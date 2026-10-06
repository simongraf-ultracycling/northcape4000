// Service Worker und Updates.
//
// Ablauf:
// 1. Beim Start wird sw.js?v=<VERSION>&fb=<SDK-Version>&lf=<Leaflet-Version>
//    registriert. Der Service Worker cacht damit alle App-, SDK- und
//    Leaflet-Dateien unter dem Namen nc4000-<VERSION>.
// 2. Regelmässig (Start, Rückkehr in die App, alle 30 min) wird js/version.js
//    direkt vom Server gelesen. Ist dort eine neuere Version, wird der Service
//    Worker mit der neuen URL registriert → er lädt die neue Version im
//    Hintergrund und wartet.
// 3. Wartet eine neue Version, erscheint das Banner "Neue Version – tippen zum
//    Laden". Erst beim Tippen: skipWaiting + Neuladen.

import { logEntry } from './log.js';
import { FIREBASE_SDK_VERSION, LEAFLET_VERSION, VERSION } from './version.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const listeners = new Set();
const supported = 'serviceWorker' in navigator;

let registration = null;
let registerError = null;
let lastCheck = null; // { status, server, error }
let reloadRequested = false;

function swUrl(version, sdkVersion, leafletVersion) {
  return `./sw.js?v=${encodeURIComponent(version)}&fb=${encodeURIComponent(sdkVersion)}&lf=${encodeURIComponent(leafletVersion)}`;
}

function versionOf(worker) {
  if (!worker) return null;
  try {
    return new URL(worker.scriptURL).searchParams.get('v');
  } catch {
    return null;
  }
}

function emit() {
  const state = getUpdateState();
  for (const cb of listeners) cb(state);
}

export function onUpdateStateChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getUpdateState() {
  const controller = supported ? navigator.serviceWorker.controller : null;
  const waiting = registration?.waiting || null;
  return {
    supported,
    registered: !!registration,
    controlled: !!controller,
    activeVersion: versionOf(registration?.active) || versionOf(controller),
    waitingVersion: controller ? versionOf(waiting) : null,
    installingVersion: versionOf(registration?.installing),
    updateReady: !!(waiting && controller),
    error: registerError,
    lastCheck,
  };
}

function track(reg) {
  if (registration === reg) return;
  registration = reg;
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    emit();
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        const text = navigator.serviceWorker.controller
          ? `Version ${versionOf(worker)} geladen, wartet auf Aktivierung`
          : `Version ${versionOf(worker)} für die Offline-Nutzung gespeichert`;
        logEntry('info', text, { source: 'update' });
      }
      if (worker.state === 'redundant') logEntry('warn', `Installation von Version ${versionOf(worker)} abgebrochen`, { source: 'update' });
      emit();
    });
  });
}

async function register(version, sdkVersion, leafletVersion) {
  const reg = await navigator.serviceWorker.register(swUrl(version, sdkVersion, leafletVersion), { scope: './', updateViaCache: 'none' });
  track(reg);
  registerError = null;
  emit();
  return reg;
}

export async function initServiceWorker() {
  if (!supported) {
    emit();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur neu laden, wenn der Benutzer das Update angetippt hat (nicht bei der
    // allerersten Installation, die via clients.claim() übernimmt).
    if (reloadRequested) window.location.reload();
    else emit();
  });
  try {
    // Nicht die eigene (ältere) Version registrieren, wenn bereits eine gleiche
    // oder neuere installiert ist oder wartet – sonst würde der Browser die
    // wartende neue Version durch die alte ersetzen wollen.
    const existing = await navigator.serviceWorker.getRegistration('./');
    const newest = existing && (existing.installing || existing.waiting || existing.active);
    if (newest && compareVersions(versionOf(newest), VERSION) >= 0) {
      track(existing);
      emit();
    } else {
      await register(VERSION, FIREBASE_SDK_VERSION, LEAFLET_VERSION);
    }
  } catch (err) {
    registerError = err.message || String(err);
    logEntry('error', `Service Worker: Registrierung fehlgeschlagen – ${registerError}`, { source: 'update' });
    emit();
    return;
  }
  setTimeout(() => checkForUpdate(), 4000);
  setInterval(() => checkForUpdate(), CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

// Vergleicht "1.2.3"-Versionen; null/unbekannt gilt als kleiner.
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

let checking = null;

// Liest js/version.js am Cache vorbei vom Server.
// Ergebnis-status: 'current' | 'update' | 'offline' | 'error' | 'unsupported'
export function checkForUpdate() {
  if (!supported || !registration) return Promise.resolve({ status: 'unsupported' });
  if (!navigator.onLine) return Promise.resolve({ status: 'offline' });
  if (checking) return checking;
  checking = (async () => {
    try {
      // Zufallsparameter: am HTTP-/CDN-Cache vorbei; sw.js lässt "versionCheck" durch.
      const res = await fetch(`./js/version.js?versionCheck=${Math.random().toString(36).slice(2)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const server = /export const VERSION\s*=\s*'([^']+)'/.exec(text)?.[1];
      const sdk = /export const FIREBASE_SDK_VERSION\s*=\s*'([^']+)'/.exec(text)?.[1];
      const leaflet = /export const LEAFLET_VERSION\s*=\s*'([^']+)'/.exec(text)?.[1] || LEAFLET_VERSION;
      if (!server || !sdk) throw new Error('version.js unlesbar');
      if (compareVersions(server, VERSION) > 0) {
        if (versionOf(registration.waiting) !== server && versionOf(registration.installing) !== server) {
          logEntry('info', `Neue Version ${server} gefunden, wird geladen`, { source: 'update' });
          await register(server, sdk, leaflet);
        }
        lastCheck = { status: 'update', server };
      } else {
        lastCheck = { status: 'current', server };
      }
    } catch (err) {
      lastCheck = { status: 'error', error: err.message || String(err) };
    } finally {
      checking = null;
    }
    emit();
    return lastCheck;
  })();
  return checking;
}

// Vom Update-Banner aufgerufen: wartende Version aktivieren und neu laden.
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  logEntry('info', `Update auf Version ${versionOf(waiting)} angetippt`, { source: 'update' });
  reloadRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Fallback, falls controllerchange ausbleibt
  setTimeout(() => window.location.reload(), 4000);
}

// "Cache leeren und neu laden": entfernt App-Cache und Service Worker.
// Die Daten (Firestore-Speicher, Einstellungen) bleiben erhalten.
export async function clearCacheAndReload() {
  try {
    if (supported) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('nc4000-')).map((k) => caches.delete(k)));
    }
  } catch (err) {
    logEntry('error', `Cache leeren: ${err.message || err}`, { source: 'update' });
  }
  window.location.reload();
}
