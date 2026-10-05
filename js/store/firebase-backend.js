// Firebase-Backend (Firestore + Authentication).
// Darf NUR von js/store.js verwendet werden – Schnittstelle siehe sim-backend.js.
//
// - Firebase JS SDK (modular) vom CDN gstatic, Version fest in js/version.js.
//   Der Service Worker cacht die SDK-Dateien vorab → App startet offline.
// - Firestore mit persistentLocalCache (IndexedDB): Schreibvorgänge werden lokal
//   gespeichert und später automatisch nachgeliefert, auch nach App-Neustart.
// - Anmeldung bleibt dauerhaft erhalten (indexedDBLocalPersistence).

import { FIREBASE_CONFIG } from '../config.js';
import { FIREBASE_SDK_VERSION } from '../version.js';

const SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
const CONNECTION_RETRY_MS = 30_000;

export async function createBackend({ raceId, onConnection, onUser }) {
  const [appSdk, authSdk, fs] = await Promise.all([
    import(`${SDK_BASE}firebase-app.js`),
    import(`${SDK_BASE}firebase-auth.js`),
    import(`${SDK_BASE}firebase-firestore.js`),
  ]);

  const app = appSdk.initializeApp(FIREBASE_CONFIG);
  const auth = authSdk.initializeAuth(app, {
    persistence: [authSdk.indexedDBLocalPersistence, authSdk.browserLocalPersistence],
  });
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({
      tabManager: fs.persistentMultipleTabManager(),
      // Keine automatische Bereinigung: private Daten (Route) müssen offline bleiben.
      cacheSizeBytes: fs.CACHE_SIZE_UNLIMITED,
    }),
    ignoreUndefinedProperties: true,
  });

  let networkEnabled = true;

  // --- Hilfsfunktionen -----------------------------------------------------

  const docRef = (segments) => fs.doc(db, 'races', raceId, ...segments);
  const collectionRef = (segments) => fs.collection(db, 'races', raceId, ...segments);

  // Firestore-Typen in einfache Werte umwandeln (Timestamp → ms)
  function plain(value) {
    if (value instanceof fs.Timestamp) return value.toMillis();
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = plain(v);
      return out;
    }
    return value;
  }

  function docResult(snap) {
    return {
      id: snap.id,
      exists: snap.exists(),
      data: snap.exists() ? plain(snap.data({ serverTimestamps: 'none' })) : null,
      fromCache: snap.metadata.fromCache,
      pending: snap.metadata.hasPendingWrites,
    };
  }

  // --- Anmeldung -----------------------------------------------------------

  const toUser = (u) => (u ? { uid: u.uid, email: u.email } : null);
  await auth.authStateReady();
  let user = toUser(auth.currentUser);

  authSdk.onAuthStateChanged(auth, (u) => {
    const next = toUser(u);
    if (next?.uid === user?.uid) return;
    user = next;
    onUser(user);
    watchConnection();
  });

  // --- Verbindungsanzeige --------------------------------------------------
  // Firestore kennt keinen direkten Verbindungsstatus. Wir beobachten das
  // (öffentlich lesbare) Renn-Dokument: Kommt ein Stand vom Server, ist die
  // Verbindung da; Stände nur aus dem Cache heissen "verbinde" bzw. "offline".

  let connectionUnsub = null;
  let connectionRetry = null;
  let lastFromCache = true;

  function reportConnection() {
    if (!networkEnabled || !navigator.onLine) onConnection('offline');
    else onConnection(lastFromCache ? 'connecting' : 'connected');
  }

  function watchConnection() {
    connectionUnsub?.();
    clearTimeout(connectionRetry);
    lastFromCache = true;
    reportConnection();
    connectionUnsub = fs.onSnapshot(
      docRef([]),
      { includeMetadataChanges: true },
      (snap) => {
        lastFromCache = snap.metadata.fromCache;
        reportConnection();
      },
      (err) => {
        onConnection('error', describeCode(err));
        connectionRetry = setTimeout(watchConnection, CONNECTION_RETRY_MS);
      },
    );
  }

  function describeCode(err) {
    return err?.code === 'permission-denied' ? 'Keine Leseberechtigung – Regeln veröffentlicht?' : err?.message || String(err);
  }

  window.addEventListener('online', reportConnection);
  window.addEventListener('offline', reportConnection);
  watchConnection();

  // --- Diagnose: Warteschlange im lokalen Speicher --------------------------
  // Firestore bietet keine öffentliche Zählung ausstehender Schreibvorgänge.
  // Wir zählen darum (nur lesend) die Einträge im IndexedDB-Speicher "mutations"
  // von Firestore. Interna des SDK – bei SDK-Wechsel prüfen; im Fehlerfall null.

  const IDB_NAME = `firestore/[DEFAULT]/${FIREBASE_CONFIG.projectId}/main`;

  function diagnostics() {
    return new Promise((resolve) => {
      const result = { persistentCache: null, cacheKind: 'IndexedDB (Firestore)', queuedWrites: null };
      let request;
      try {
        request = indexedDB.open(IDB_NAME);
      } catch {
        resolve(result);
        return;
      }
      request.onupgradeneeded = () => {
        // Datenbank existiert nicht → nicht anlegen!
        request.transaction.abort();
        result.persistentCache = false;
      };
      request.onerror = () => resolve(result);
      request.onblocked = () => resolve(result);
      request.onsuccess = () => {
        const idb = request.result;
        idb.onversionchange = () => idb.close(); // Firestore nie blockieren
        result.persistentCache = true;
        try {
          if (!idb.objectStoreNames.contains('mutations')) {
            idb.close();
            resolve(result);
            return;
          }
          const count = idb.transaction('mutations', 'readonly').objectStore('mutations').count();
          count.onsuccess = () => {
            result.queuedWrites = count.result;
            idb.close();
            resolve(result);
          };
          count.onerror = () => {
            idb.close();
            resolve(result);
          };
        } catch {
          idb.close();
          resolve(result);
        }
      };
    });
  }

  // --- Follower-Sicht prüfen --------------------------------------------------
  // Fragt die Firestore-REST-API OHNE Anmeldung ab – genau wie ein Follower,
  // der nur die raceId kennt. Bestätigt, dass die Regeln richtig wirken.

  async function followerCheck() {
    const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/`;
    const race = `races/${raceId}`;
    const checks = [
      { label: 'Renn-Dokument lesen', path: race, expected: 'erlaubt' },
      { label: 'Ereignisse auflisten', path: `${race}/events`, list: true, expected: 'erlaubt' },
      { label: 'Alle Rennen auflisten', path: 'races', list: true, expected: 'verboten' },
      { label: 'Privat lesen (private/test)', path: `${race}/private/test`, expected: 'verboten' },
      { label: 'Privat auflisten', path: `${race}/private`, list: true, expected: 'verboten' },
      { label: 'Schreiben ohne Login', path: `${race}/debug/follower-test`, write: true, expected: 'verboten' },
    ];
    const results = [];
    for (const check of checks) {
      const url = new URL(base + check.path);
      url.searchParams.set('key', FIREBASE_CONFIG.apiKey);
      if (check.list) url.searchParams.set('pageSize', '1');
      let actual;
      let detail = '';
      try {
        const res = await fetch(url, {
          method: check.write ? 'PATCH' : 'GET',
          cache: 'no-store',
          credentials: 'omit',
          headers: check.write ? { 'Content-Type': 'application/json' } : undefined,
          body: check.write ? JSON.stringify({ fields: { test: { stringValue: 'follower' } } }) : undefined,
        });
        if (res.ok || res.status === 404) actual = 'erlaubt';
        else if (res.status === 401 || res.status === 403) actual = 'verboten';
        else actual = `HTTP ${res.status}`;
        detail = res.status === 404 ? 'erlaubt (Dokument existiert noch nicht)' : `HTTP ${res.status}`;
      } catch (err) {
        actual = 'Netzfehler';
        detail = err.message;
      }
      results.push({ label: check.label, expected: check.expected, actual, ok: actual === check.expected, detail });
    }
    return results;
  }

  // --- Schnittstelle ---------------------------------------------------------

  return {
    kind: 'firebase',

    getUser: () => user,

    async signIn(email, password) {
      await authSdk.signInWithEmailAndPassword(auth, email, password);
    },

    async signOut() {
      await authSdk.signOut(auth);
    },

    write(segments, fields) {
      const ref = docRef(segments);
      // Promise wird erst bei Server-Bestätigung erfüllt (offline: bleibt offen)
      const server = fs.setDoc(ref, { ...fields, serverTime: fs.serverTimestamp() });
      // Lokales Lesen läuft in Firestore nach dem Schreiben → sieht den neuen Stand
      const local = fs.getDocFromCache(ref).then((snap) => {
        if (!snap.exists()) throw new Error('nicht im lokalen Speicher');
      });
      return { local, server };
    },

    async read(segments) {
      const ref = docRef(segments);
      let snap;
      try {
        snap = await fs.getDoc(ref);
      } catch (err) {
        if (err.code === 'permission-denied') throw err;
        snap = await fs.getDocFromCache(ref); // offline: lokale Kopie
      }
      return docResult(snap);
    },

    watchDoc(segments, cb, onError) {
      return fs.onSnapshot(docRef(segments), { includeMetadataChanges: true }, (snap) => cb(docResult(snap)), onError);
    },

    watchCollection(segments, { orderBy = 'clientTime', desc = true, limit = 100 } = {}, cb, onError) {
      const q = fs.query(collectionRef(segments), fs.orderBy(orderBy, desc ? 'desc' : 'asc'), fs.limit(limit));
      return fs.onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => cb(snap.docs.map(docResult), { fromCache: snap.metadata.fromCache }),
        onError,
      );
    },

    async setNetworkEnabled(enabled) {
      networkEnabled = enabled;
      if (enabled) await fs.enableNetwork(db);
      else await fs.disableNetwork(db);
      reportConnection();
    },

    diagnostics,
    followerCheck,
  };
}
