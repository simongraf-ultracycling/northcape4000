// Sim-Backend: lokaler Simulator mit Testdaten – gleiche Schnittstelle wie
// firebase-backend.js. Darf NUR von js/store.js verwendet werden.
//
// Daten liegen in localStorage ("nc4000.simDb"). Schreibvorgänge sind sofort
// lokal sichtbar ("ausstehend") und werden nach kurzer Verzögerung "vom Server
// bestätigt" – ausser das Gerät ist offline oder "Offline simulieren" ist an.
//
// Schnittstelle (für beide Backends gleich):
//   createBackend({ raceId, ownerUid, onConnection(state, detail), onUser(user) })
//   getUser()                          → { uid, email } | null
//   signIn(email, password), signOut()
//   write(segments, fields)            → { local: Promise, server: Promise }
//   read(segments)                     → Promise<{ id, exists, data, fromCache, pending }>
//   watchDoc(segments, cb, onError)    → Abmelde-Funktion; cb(doc)
//   watchCollection(segments, { orderBy, desc, limit }, cb, onError)
//                                      → Abmelde-Funktion; cb(docs, { fromCache })
//   setNetworkEnabled(enabled)         → Promise
//   diagnostics()                      → Promise<{ persistentCache, cacheKind, queuedWrites }>
//   followerCheck()                    (nur Firebase)
//   reset()                            (nur Sim)
// segments: Pfad relativ zu races/{raceId}, z.B. ['events', id]; [] = Renn-Dokument.
// data: einfache Werte, Zeitstempel als ms; serverTime ist null, solange ausstehend.

import { clock } from '../clock.js';
import { readLocal, writeLocal } from '../local.js';
import { createSeed } from './sim-seed.js';

const KEY = 'simDb';
const ACK_DELAY_MS = { min: 250, max: 900 };

export async function createBackend({ ownerUid, onConnection, onUser }) {
  // docs: { [pfad]: { data, pending } }
  let docs = load();
  let networkEnabled = true;
  const serverWaiters = new Map(); // pfad → [resolve]
  const docWatchers = new Set();
  const collectionWatchers = new Set();
  let ackTimer = null;

  function load() {
    const stored = readLocal(KEY, null);
    if (stored && typeof stored === 'object' && stored.docs) return stored.docs;
    const seeded = {};
    for (const [path, data] of Object.entries(createSeed(clock.now()))) seeded[path] = { data, pending: false };
    return seeded;
  }

  function persist() {
    writeLocal(KEY, { docs });
  }

  const pathOf = (segments) => segments.join('/');
  const isOnline = () => networkEnabled && navigator.onLine;
  const copy = (value) => (value == null ? value : structuredClone(value));

  function docResult(path) {
    const entry = docs[path];
    return {
      id: path.split('/').pop() || '',
      exists: !!entry,
      data: entry ? copy(entry.data) : null,
      fromCache: !isOnline(),
      pending: !!entry?.pending,
    };
  }

  function childrenOf(collectionPath) {
    const depth = collectionPath.split('/').length + 1;
    return Object.keys(docs).filter((p) => p.startsWith(collectionPath + '/') && p.split('/').length === depth);
  }

  function queryCollection(collectionPath, { orderBy = 'clientTime', desc = true, limit = 100 } = {}) {
    const list = childrenOf(collectionPath).map(docResult);
    list.sort((a, b) => {
      const va = a.data?.[orderBy] ?? 0;
      const vb = b.data?.[orderBy] ?? 0;
      return desc ? vb - va : va - vb;
    });
    return list.slice(0, limit);
  }

  function notify(path) {
    queueMicrotask(() => {
      for (const w of docWatchers) if (path === null || w.path === path) w.cb(docResult(w.path));
      for (const w of collectionWatchers) {
        if (path === null || path.startsWith(w.path + '/')) w.cb(queryCollection(w.path, w.options), { fromCache: !isOnline() });
      }
    });
  }

  function reportConnection() {
    onConnection(isOnline() ? 'sim' : 'offline', isOnline() ? 'Simulator' : '');
  }

  // Ausstehende Einträge nacheinander "vom Server bestätigen"
  function scheduleAcks() {
    if (ackTimer || !isOnline()) return;
    const next = Object.keys(docs).find((p) => docs[p].pending);
    if (next === undefined) return;
    const delay = ACK_DELAY_MS.min + Math.random() * (ACK_DELAY_MS.max - ACK_DELAY_MS.min);
    ackTimer = setTimeout(() => {
      ackTimer = null;
      if (!isOnline()) return;
      const entry = docs[next];
      if (entry?.pending) {
        entry.pending = false;
        entry.data.serverTime = clock.now();
        persist();
        notify(next);
        for (const resolve of serverWaiters.get(next) || []) resolve();
        serverWaiters.delete(next);
      }
      scheduleAcks();
    }, delay);
  }

  window.addEventListener('online', () => {
    reportConnection();
    notify(null);
    scheduleAcks();
  });
  window.addEventListener('offline', () => {
    reportConnection();
    notify(null);
  });

  const user = { uid: ownerUid, email: 'Sim-Modus (lokal)' };
  reportConnection();
  scheduleAcks(); // aus früheren Sitzungen ausstehende Einträge

  return {
    kind: 'sim',

    getUser: () => user,

    async signIn() {
      onUser(user);
    },

    async signOut() {
      // Im Sim-Modus gibt es kein Abmelden; der Sim-Modus wird unter "Mehr" beendet.
    },

    write(segments, fields) {
      const path = pathOf(segments);
      docs[path] = { data: { ...copy(fields), serverTime: null }, pending: true };
      persist();
      notify(path);
      const server = new Promise((resolve) => {
        if (!serverWaiters.has(path)) serverWaiters.set(path, []);
        serverWaiters.get(path).push(resolve);
      });
      scheduleAcks();
      return { local: Promise.resolve(), server };
    },

    async read(segments) {
      return docResult(pathOf(segments));
    },

    watchDoc(segments, cb) {
      const watcher = { path: pathOf(segments), cb };
      docWatchers.add(watcher);
      queueMicrotask(() => docWatchers.has(watcher) && cb(docResult(watcher.path)));
      return () => docWatchers.delete(watcher);
    },

    watchCollection(segments, options, cb) {
      const watcher = { path: pathOf(segments), options, cb };
      collectionWatchers.add(watcher);
      queueMicrotask(() => collectionWatchers.has(watcher) && cb(queryCollection(watcher.path, options), { fromCache: !isOnline() }));
      return () => collectionWatchers.delete(watcher);
    },

    async setNetworkEnabled(enabled) {
      networkEnabled = enabled;
      reportConnection();
      notify(null);
      if (enabled) scheduleAcks();
    },

    async diagnostics() {
      return { persistentCache: true, cacheKind: 'localStorage (Sim)', queuedWrites: Object.values(docs).filter((d) => d.pending).length };
    },

    async reset() {
      clearTimeout(ackTimer);
      ackTimer = null;
      writeLocal(KEY, undefined);
      docs = load();
      persist();
      for (const waiters of serverWaiters.values()) waiters.forEach((resolve) => resolve());
      serverWaiters.clear();
      notify(null);
    },
  };
}
