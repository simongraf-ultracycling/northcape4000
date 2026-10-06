// Eigene Punkte (z.B. Freunde, Wasserstelle, Velo-Laden mit Termin) – für
// alle Routen gemeinsam, nur im privaten Bereich:
//   mypois   { pois: [{ id, lat, lon, name, note, created }] }
// km und Abstand zur aktiven Route werden beim Laden berechnet.

import { clock } from '../clock.js';
import * as store from '../store.js';

const KEY = 'mypois';
const listeners = new Set();
let cache = null;

export function onMyPoisChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function read() {
  if (!cache) cache = (await store.getPrivate(KEY))?.pois || [];
  return cache;
}

function write(list) {
  cache = list;
  store.setPrivate(KEY, { pois: list });
  for (const cb of listeners) cb();
}

export async function listMyPois() {
  return [...(await read())];
}

export async function addMyPoi({ lat, lon, name, note = '' }) {
  const poi = { id: store.newId().slice(0, 12), lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, name: name || 'Eigener Punkt', note, created: clock.now() };
  write([...(await read()), poi]);
  return poi;
}

export async function updateMyPoi(id, patch) {
  write((await read()).map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export async function deleteMyPoi(id) {
  write((await read()).filter((p) => p.id !== id));
}

// Für die Karte: wie Versorgungspunkte (cat 'eigen'), mit km zur Route
export async function loadMyPois(route, maxOff = 20_000) {
  const list = await read();
  return list.map((p) => {
    const near = route && !route.isEmpty ? route.nearest(p.lat, p.lon, maxOff) : null;
    return { id: p.id, cat: 'eigen', sub: 'Eigener Punkt', lat: p.lat, lon: p.lon, name: p.name, note: p.note || '', hours: '', km: near ? near.km : null, off: near ? near.dist : null, always: false, mine: true };
  });
}
