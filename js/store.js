// Datenschicht – die EINZIGE Schnittstelle der App für Daten.
//
// - Renndaten über ein austauschbares Backend: "firebase" (Firestore, js/store/
//   firebase-backend.js) oder "sim" (lokaler Simulator, js/store/sim-backend.js).
//   Kein anderer Code greift direkt auf Firebase zu.
// - Geräte-Einstellungen (nur dieses Gerät) über store.settings.
//
// Datenstruktur in Firestore:
//   races/{raceId}                 Renn-Dokument (öffentlich per get)
//   races/{raceId}/events/{id}     Ereignisse: type 'status' (data.state, data.from),
//                                  'befinden' (data.muedigkeit/sitz/mental/motivation), …
//   races/{raceId}/config/{key}    Renn-Konfiguration (Gates, Zeitfenster, …)
//   races/{raceId}/debug/{id}      Test-Einträge aus dem Debug-Bereich
//   races/{raceId}/private/{key}   NUR Besitzer: offizielle Route, eigene POIs
//
// Jeder Eintrag enthält:
//   clientTime  Zeitpunkt auf dem Handy (ms seit 1970, aus clock.now()) –
//               massgeblich für ALLE Auswertungen
//   tzOffset    Zeitzone des Handys in Minuten (z.B. 120 für MESZ)
//   appVersion  App-Version, die den Eintrag geschrieben hat
//   serverTime  vom Server gesetzt (ms), nur Info; null solange nicht synchronisiert
//
// Korrekturen (updateEvent) ergänzen ein Dokument: editedTime, editedVersion;
// geänderte Zeit: originalClientTime; gelöscht: voided: true (bleibt erhalten,
// zählt aber nirgends mehr).
//
// Schreibvorgänge geben sofort { id, local, server } zurück:
//   local   Promise: lokal gespeichert (übersteht App-Neustart, auch offline)
//   server  Promise: vom Server bestätigt – bleibt offline offen!
// Die Oberfläche wartet darum nie auf server.

import { clock } from './clock.js';
import { RACE_ID, OWNER_UID } from './config.js';
import { readLocal, writeLocal, onLocalChange } from './local.js';
import { logEntry } from './log.js';
import { VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Geräte-Einstellungen (localStorage)

export const settings = {
  get: (key, fallback = null) => readLocal(key, fallback),
  set: (key, value) => writeLocal(key, value),
  onChange: (key, cb) => onLocalChange(key, cb),
};

export function isSimMode() {
  return readLocal('simMode', false) === true;
}

// Wirkt erst nach einem Neustart der App (Backend-Wechsel).
export function setSimMode(on) {
  writeLocal('simMode', !!on);
}

// ---------------------------------------------------------------------------
// Zustand

let backend = null;
let initPromise = null;
const statusListeners = new Set();
const authListeners = new Set();

const status = {
  mode: isSimMode() ? 'sim' : 'firebase',
  ready: false,
  online: navigator.onLine,
  offlineSimulated: false,
  // 'starting' | 'connecting' | 'connected' | 'offline' | 'error' | 'sim'
  connection: 'starting',
  connectionDetail: '',
  user: null, // { uid, email, isOwner }
  pendingSession: 0, // in dieser Sitzung geschrieben, noch nicht vom Server bestätigt
};

function emitStatus() {
  const snapshot = getStatus();
  for (const cb of statusListeners) cb(snapshot);
}

function patchStatus(patch) {
  Object.assign(status, patch);
  emitStatus();
}

export function getStatus() {
  return { ...status, user: status.user && { ...status.user } };
}

export function onStatusChange(cb) {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

window.addEventListener('online', () => patchStatus({ online: true }));
window.addEventListener('offline', () => patchStatus({ online: false }));

function requireBackend() {
  if (!backend) throw new Error('Datenschicht noch nicht bereit');
  return backend;
}

function toUser(user) {
  return user ? { uid: user.uid, email: user.email || '', isOwner: user.uid === OWNER_UID } : null;
}

// ---------------------------------------------------------------------------
// Start

export function initStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const module = status.mode === 'sim' ? await import('./store/sim-backend.js') : await import('./store/firebase-backend.js');
      backend = await module.createBackend({
        raceId: RACE_ID,
        ownerUid: OWNER_UID,
        onConnection: (connection, detail = '') => patchStatus({ connection, connectionDetail: detail }),
        onUser: (user) => {
          patchStatus({ user: toUser(user) });
          for (const cb of authListeners) cb(getUser());
        },
      });
      patchStatus({ ready: true, user: toUser(backend.getUser()) });
      logEntry('info', `App gestartet (${status.mode === 'sim' ? 'Sim-Modus' : 'Firebase'})`, { source: 'store' });
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function getMode() {
  return status.mode;
}

// ---------------------------------------------------------------------------
// Anmeldung (im Sim-Modus immer "angemeldet")

export function getUser() {
  return status.user && { ...status.user };
}

export function onAuthChange(cb) {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

export async function signIn(email, password) {
  await requireBackend().signIn(String(email).trim(), password);
}

export async function signOut() {
  await requireBackend().signOut();
}

// ---------------------------------------------------------------------------
// Schreiben / Lesen (intern)

function meta() {
  const t = clock.now();
  return { clientTime: t, tzOffset: -new Date(t).getTimezoneOffset(), appVersion: VERSION };
}

export function newId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let id = '';
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

function write(segments, fields, label) {
  return track(requireBackend().write(segments, { ...fields, ...meta() }), segments, label);
}

// Bestehendes Dokument ergänzen (Felder werden zusammengeführt)
function update(segments, fields, label) {
  const edited = { editedTime: clock.now(), editedVersion: VERSION };
  return track(requireBackend().update(segments, { ...fields, ...edited }), segments, label);
}

// Ausstehende Bestätigungen zählen, Fehler protokollieren
function track(result, segments, label) {
  patchStatus({ pendingSession: status.pendingSession + 1 });
  const done = () => patchStatus({ pendingSession: Math.max(0, status.pendingSession - 1) });
  result.server.then(done, (err) => {
    done();
    logEntry('error', `${label}: vom Server abgelehnt – ${describeError(err)}`, { source: 'store' });
  });
  result.local.catch((err) => logEntry('error', `${label}: lokal nicht gespeichert – ${describeError(err)}`, { source: 'store' }));
  return { id: segments[segments.length - 1], local: result.local, server: result.server };
}

// Dokument für die Oberfläche: { id, ...Felder, pending }
function flatten(doc) {
  return { id: doc.id, ...doc.data, pending: doc.pending };
}

function watchList(segments, options, cb) {
  return requireBackend().watchCollection(
    segments,
    options,
    (docs, info) => cb(docs.map(flatten), info),
    (err) => logEntry('error', `Abonnement ${segments.join('/')}: ${describeError(err)}`, { source: 'store' }),
  );
}

// ---------------------------------------------------------------------------
// Ereignisse: races/{raceId}/events

export function addEvent(type, data = {}) {
  if (!type) throw new Error('addEvent: type fehlt');
  return write(['events', newId()], { type, data, source: 'app' }, `Ereignis "${type}"`);
}

// Ereignis korrigieren, z.B. { clientTime, originalClientTime } oder { voided: true }
export function updateEvent(id, fields) {
  if (!id) throw new Error('updateEvent: id fehlt');
  return update(['events', id], fields, 'Korrektur');
}

// cb(events, { fromCache }) – neueste zuerst. Gibt eine Abmelde-Funktion zurück.
export function subscribeEvents(cb, { limit = 500 } = {}) {
  return watchList(['events'], { orderBy: 'clientTime', desc: true, limit }, cb);
}

// ---------------------------------------------------------------------------
// Renn-Konfiguration: races/{raceId}/config/{key} – Wert im Feld "value"

export async function getConfig(key) {
  const doc = await requireBackend().read(['config', key]);
  return doc.exists ? doc.data.value : null;
}

export function setConfig(key, value) {
  return write(['config', key], { value }, `Konfiguration "${key}"`);
}

export function subscribeConfig(key, cb) {
  return requireBackend().watchDoc(
    ['config', key],
    (doc) => cb(doc.exists ? doc.data.value : null, { pending: doc.pending, fromCache: doc.fromCache }),
    (err) => logEntry('error', `Abonnement config/${key}: ${describeError(err)}`, { source: 'store' }),
  );
}

// ---------------------------------------------------------------------------
// Privater Bereich: races/{raceId}/private/{key} – nur Besitzer.
// Einmal geladen, bleibt der Inhalt im lokalen Speicher und ist offline lesbar.
// Firestore-Dokumente sind auf 1 MB begrenzt (Route später in Abschnitten).

export async function getPrivate(key) {
  const doc = await requireBackend().read(['private', key]);
  return doc.exists ? doc.data.value : null;
}

export function setPrivate(key, value) {
  return write(['private', key], { value }, `Privat "${key}"`);
}

export function deletePrivate(key) {
  return track(requireBackend().remove(['private', key]), ['private', key], `Privat "${key}" löschen`);
}

// ---------------------------------------------------------------------------
// Verbindung / Diagnose

// "Offline simulieren": trennt die Datenverbindung (Firebase: disableNetwork).
// Wird bewusst nicht gespeichert – nach einem Neustart ist die App wieder online.
export async function setOfflineSimulated(on) {
  await requireBackend().setNetworkEnabled(!on);
  patchStatus({ offlineSimulated: !!on });
}

export async function getStorageInfo() {
  const info = { usage: null, quota: null, persisted: null, persistentCache: null, cacheKind: null, queuedWrites: null };
  try {
    if (navigator.storage?.estimate) Object.assign(info, await navigator.storage.estimate());
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
  } catch {
    // nicht unterstützt
  }
  if (backend) Object.assign(info, await backend.diagnostics());
  return info;
}

// Bittet den Browser, die Daten nicht automatisch zu löschen.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return null;
  return navigator.storage.persist();
}

// Werkzeuge für den Debug-Bereich
export const debug = {
  writePing() {
    return write(['debug', newId()], { kind: 'ping' }, 'Test-Eintrag');
  },
  subscribePings(cb, { limit = 5 } = {}) {
    return watchList(['debug'], { orderBy: 'clientTime', desc: true, limit }, cb);
  },
  // Liest ein privates Dokument mit Angaben zur Quelle (Server oder lokaler Speicher).
  async readPrivate(key) {
    const doc = await requireBackend().read(['private', key]);
    return { exists: doc.exists, value: doc.exists ? doc.data.value : null, fromCache: doc.fromCache, pending: doc.pending };
  },
  // Prüft ohne Login (wie ein Follower), was lesbar ist. Nur Firebase-Modus.
  async checkFollowerAccess() {
    const b = requireBackend();
    return b.followerCheck ? b.followerCheck() : null;
  },
  // Sim-Modus: Testdaten auf den Ausgangszustand zurücksetzen.
  async resetSimData() {
    const b = requireBackend();
    if (b.reset) await b.reset();
  },
};

// ---------------------------------------------------------------------------
// Fehlermeldungen auf Deutsch

const ERROR_TEXTS = {
  'permission-denied': 'Keine Berechtigung – Regeln veröffentlicht? Richtig angemeldet?',
  unavailable: 'Server nicht erreichbar.',
  unauthenticated: 'Nicht angemeldet.',
  'failed-precondition': 'Lokaler Speicher nicht verfügbar (App in mehreren Fenstern offen?).',
  'resource-exhausted': 'Kontingent erschöpft.',
  'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
  'auth/invalid-login-credentials': 'E-Mail oder Passwort falsch.',
  'auth/wrong-password': 'E-Mail oder Passwort falsch.',
  'auth/user-not-found': 'E-Mail oder Passwort falsch.',
  'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
  'auth/missing-password': 'Bitte Passwort eingeben.',
  'auth/missing-email': 'Bitte E-Mail eingeben.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte etwas später nochmals probieren.',
  'auth/network-request-failed': 'Keine Verbindung zum Server. Für die Anmeldung braucht es Netz.',
  'auth/user-disabled': 'Dieses Konto ist gesperrt.',
  'auth/operation-not-allowed': 'Anmeldung per E-Mail/Passwort ist in Firebase nicht aktiviert.',
};

export function describeError(err) {
  if (!err) return 'Unbekannter Fehler';
  const code = err.code || '';
  return ERROR_TEXTS[code] || ERROR_TEXTS[code.replace(/^firestore\//, '')] || err.message || String(err);
}
