// Standort des Geräts – nur solange die App offen ist (Web-Apps dürfen im
// Hintergrund nicht orten; die laufende Live-Position kommt später über
// Garmin LiveTrack).
//
// - watchPosition(cb): fortlaufend (z.B. Karte offen); gemeinsamer Wächter.
// - getPosition(): einmalig, mit Zeitlimit (z.B. beim Statuswechsel).
// - Sim-Modus: setSimulatedPosition() ersetzt das GPS (Karte: lange tippen).

import { clock } from '../clock.js';
import * as store from '../store.js';

const subscribers = new Set();
let watchId = null;
let last = null; // { lat, lon, acc, alt, heading, speed, time, simulated }
let lastError = null;
let simulated = null;

const ERRORS = {
  1: { code: 'denied', text: 'Standort nicht erlaubt – in den iPhone-Einstellungen für die App bzw. Safari erlauben' },
  2: { code: 'unavailable', text: 'Standort nicht verfügbar' },
  3: { code: 'timeout', text: 'Standort: Zeitüberschreitung' },
};

function toPosition(p) {
  const c = p.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    acc: c.accuracy,
    alt: Number.isFinite(c.altitude) ? c.altitude : null,
    heading: Number.isFinite(c.heading) ? c.heading : null,
    speed: Number.isFinite(c.speed) ? c.speed : null,
    time: clock.now(),
    real: clock.realNow(),
    simulated: false,
  };
}

function toError(err) {
  return ERRORS[err?.code] || { code: 'unavailable', text: err?.message || 'Standort nicht verfügbar' };
}

function emit() {
  for (const cb of subscribers) cb(last, lastError);
}

export function isSupported() {
  return 'geolocation' in navigator;
}

export function lastPosition(maxAgeMs = Infinity) {
  if (simulated) return simulated;
  if (!last) return null;
  return clock.realNow() - last.real <= maxAgeMs ? last : null;
}

export function getLastError() {
  return lastError;
}

function startWatch() {
  if (watchId !== null || !isSupported() || simulated) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      last = toPosition(p);
      lastError = null;
      emit();
    },
    (err) => {
      lastError = toError(err);
      emit();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
  );
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

// cb(position|null, error|null); gibt Abmelde-Funktion zurück
export function watchPosition(cb) {
  subscribers.add(cb);
  startWatch();
  const current = lastPosition();
  if (current || lastError) queueMicrotask(() => subscribers.has(cb) && cb(current, lastError));
  return () => {
    subscribers.delete(cb);
    if (!subscribers.size) stopWatch();
  };
}

// Einmalige Position; nimmt eine frische vorhandene, sonst wartet sie (timeout)
export function getPosition({ maxAge = 60_000, timeout = 20_000 } = {}) {
  const fresh = lastPosition(maxAge);
  if (fresh) return Promise.resolve(fresh);
  if (!isSupported()) return Promise.reject({ code: 'unsupported', text: 'Dieses Gerät kann den Standort nicht bestimmen' });
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        last = toPosition(p);
        lastError = null;
        emit();
        resolve(last);
      },
      (err) => {
        lastError = toError(err);
        emit();
        reject(lastError);
      },
      { enableHighAccuracy: true, maximumAge: maxAge, timeout },
    );
  });
}

// --- Sim-Modus ---------------------------------------------------------------------------

export function setSimulatedPosition(lat, lon) {
  if (!store.isSimMode()) return;
  stopWatch();
  simulated = { lat, lon, acc: 5, alt: null, heading: null, speed: null, time: clock.now(), real: clock.realNow(), simulated: true };
  last = simulated;
  lastError = null;
  emit();
}

export function clearSimulatedPosition() {
  simulated = null;
  last = null;
  if (subscribers.size) startWatch();
  emit();
}

export function isSimulated() {
  return !!simulated;
}

// Für Ereignisse (z.B. Statuswechsel): kompakt, auf ~1 m gerundet
export function toEventPosition(p) {
  const out = { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5, acc: Math.round(p.acc || 0), time: p.time };
  if (Number.isFinite(p.alt)) out.alt = Math.round(p.alt);
  if (p.simulated) out.simulated = true;
  return out;
}
