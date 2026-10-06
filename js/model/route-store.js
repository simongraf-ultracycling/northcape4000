// Routen speichern und laden – ausschliesslich im privaten Bereich
// (races/{raceId}/private/**, nur Besitzer). Offizielle Routen dürfen nie ins
// Repository oder an Follower gelangen.
//
// Dokumente (Wert jeweils im Feld "value", siehe store.getPrivate/setPrivate):
//   routes                          { active, routes: [{ id, name, km, ascent, stages, updated }] }
//   route-<id>                      { id, name, created, updated, stages: [Etappe], waypoints: [] }
//   routegeo-<id>-<etappe>-<n>      { p: Koordinaten (Polyline), e: Höhen (Polyline) | null }
// Etappe: { id, name, file, km, ascent, descent, points, chunks, hasEle }
// Geometrie in Stücken zu höchstens CHUNK_POINTS Punkten (Firestore: 1 MB je Dokument).

import { clock } from '../clock.js';
import { decodeCoords, decodeElevation, encodeCoords, encodeElevation } from '../geo/geo.js';
import * as store from '../store.js';
import { Route } from './route.js';

const INDEX_KEY = 'routes';
const CHUNK_POINTS = 20_000;

const routeKey = (id) => `route-${id}`;
const geoKey = (routeId, stageId, n) => `routegeo-${routeId}-${stageId}-${n}`;

const listeners = new Set();
const deleteListeners = new Set();
let indexCache = null;
const routeCache = new Map(); // id → { updated, promise }

export function onRoutesChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function changed() {
  for (const cb of listeners) cb();
}

// Abgeleitete Daten (Versorgung, Plan) melden sich hier zum Aufräumen an
export function onRouteDeleted(cb) {
  deleteListeners.add(cb);
  return () => deleteListeners.delete(cb);
}

// --- Verzeichnis ------------------------------------------------------------------

export async function getRouteIndex() {
  if (!indexCache) indexCache = (await store.getPrivate(INDEX_KEY)) || { active: null, routes: [] };
  return structuredClone(indexCache);
}

function saveIndex(index) {
  indexCache = index;
  store.setPrivate(INDEX_KEY, index);
}

function summary(meta) {
  return {
    id: meta.id,
    name: meta.name,
    km: Math.round(meta.stages.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
    ascent: meta.stages.reduce((sum, s) => sum + (s.ascent || 0), 0),
    stages: meta.stages.length,
    updated: meta.updated,
  };
}

async function saveMeta(meta) {
  meta.updated = clock.now();
  store.setPrivate(routeKey(meta.id), meta);
  routeCache.delete(meta.id);
  const index = await getRouteIndex();
  const i = index.routes.findIndex((r) => r.id === meta.id);
  if (i >= 0) index.routes[i] = summary(meta);
  else index.routes.push(summary(meta));
  saveIndex(index);
  changed();
}

export async function getActiveRouteId() {
  return (await getRouteIndex()).active;
}

export async function setActiveRoute(id) {
  const index = await getRouteIndex();
  index.active = id;
  saveIndex(index);
  changed();
}

// --- Laden ------------------------------------------------------------------------

export async function getRouteMeta(id) {
  return store.getPrivate(routeKey(id));
}

async function loadStageGeo(routeId, stage) {
  const parts = await Promise.all(Array.from({ length: stage.chunks || 1 }, (_, n) => store.getPrivate(geoKey(routeId, stage.id, n))));
  const lat = [];
  const lon = [];
  const ele = [];
  let withEle = stage.hasEle;
  for (const part of parts) {
    if (!part) throw new Error(`Geometrie der Etappe "${stage.name}" fehlt (noch nicht synchronisiert?)`);
    const c = decodeCoords(part.p);
    const e = part.e ? decodeElevation(part.e) : null;
    if (!e) withEle = false;
    for (let i = 0; i < c.lat.length; i++) {
      lat.push(c.lat[i]);
      lon.push(c.lon[i]);
      ele.push(e ? e[i] : NaN);
    }
  }
  return { lat: Float64Array.from(lat), lon: Float64Array.from(lon), ele: withEle ? Float32Array.from(ele) : null };
}

// Route mit Geometrie (zwischengespeichert, solange unverändert)
export async function loadRoute(id) {
  const meta = await getRouteMeta(id);
  if (!meta) return null;
  const cached = routeCache.get(id);
  if (cached && cached.updated === meta.updated) return cached.promise;
  const promise = (async () => {
    const geos = new Map();
    await Promise.all(
      meta.stages.map(async (s) => {
        geos.set(s.id, await loadStageGeo(id, s));
      }),
    );
    return new Route(meta, geos);
  })();
  routeCache.set(id, { updated: meta.updated, promise });
  promise.catch(() => routeCache.delete(id));
  return promise;
}

export async function loadActiveRoute() {
  const id = await getActiveRouteId();
  return id ? loadRoute(id) : null;
}

// --- Ändern ----------------------------------------------------------------------

export async function createRoute(name) {
  const now = clock.now();
  const meta = { id: store.newId(), name: name || 'Neue Route', created: now, updated: now, stages: [], waypoints: [] };
  await saveMeta(meta);
  await setActiveRoute(meta.id);
  return meta.id;
}

function writeStageGeo(routeId, stageId, geo) {
  const c = decodeCoords(geo.p);
  const e = geo.e ? decodeElevation(geo.e) : null;
  const chunks = Math.max(1, Math.ceil(c.lat.length / CHUNK_POINTS));
  for (let n = 0; n < chunks; n++) {
    const from = n * CHUNK_POINTS;
    const to = Math.min(c.lat.length, from + CHUNK_POINTS);
    store.setPrivate(geoKey(routeId, stageId, n), {
      p: encodeCoords(c.lat.subarray(from, to), c.lon.subarray(from, to)),
      e: e ? encodeElevation(e.subarray(from, to)) : null,
    });
  }
  return chunks;
}

// Etappen (aus dem GPX-Import oder der Testroute) hinten anfügen
export async function addStages(routeId, stages, waypoints = []) {
  const meta = await getRouteMeta(routeId);
  if (!meta) throw new Error('Route nicht gefunden');
  for (const s of stages) {
    const id = store.newId().slice(0, 10);
    const chunks = writeStageGeo(routeId, id, s.geo);
    meta.stages.push({ id, name: s.name, file: s.file || '', km: s.km, ascent: s.ascent, descent: s.descent, points: s.points, chunks, hasEle: s.hasEle });
  }
  const known = new Set(meta.waypoints.map((w) => `${w.lat},${w.lon},${w.name}`));
  for (const w of waypoints) if (!known.has(`${w.lat},${w.lon},${w.name}`)) meta.waypoints.push(w);
  meta.waypoints = meta.waypoints.slice(0, 2000);
  await saveMeta(meta);
}

export async function renameRoute(routeId, name) {
  const meta = await getRouteMeta(routeId);
  meta.name = name;
  await saveMeta(meta);
}

export async function renameStage(routeId, stageId, name) {
  const meta = await getRouteMeta(routeId);
  const stage = meta.stages.find((s) => s.id === stageId);
  if (stage) stage.name = name;
  await saveMeta(meta);
}

export async function moveStage(routeId, stageId, delta) {
  const meta = await getRouteMeta(routeId);
  const i = meta.stages.findIndex((s) => s.id === stageId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= meta.stages.length) return;
  [meta.stages[i], meta.stages[j]] = [meta.stages[j], meta.stages[i]];
  await saveMeta(meta);
}

function deleteStageGeo(routeId, stage) {
  for (let n = 0; n < (stage.chunks || 1); n++) store.deletePrivate(geoKey(routeId, stage.id, n));
}

export async function removeStage(routeId, stageId) {
  const meta = await getRouteMeta(routeId);
  const stage = meta.stages.find((s) => s.id === stageId);
  if (!stage) return;
  meta.stages = meta.stages.filter((s) => s.id !== stageId);
  deleteStageGeo(routeId, stage);
  await saveMeta(meta);
}

// Alle Etappen zu einer zusammenfügen (Lücken werden zur geraden Verbindung)
export async function mergeStages(routeId, name) {
  const route = await loadRoute(routeId);
  const meta = await getRouteMeta(routeId);
  if (!route || meta.stages.length < 2) return;
  const lat = route.lat.subarray(0, route.n);
  const lon = route.lon.subarray(0, route.n);
  const ele = route.hasEle ? route.ele.subarray(0, route.n) : null;
  const id = store.newId().slice(0, 10);
  const geo = { p: encodeCoords(lat, lon), e: ele ? encodeElevation(ele) : null };
  const chunks = writeStageGeo(routeId, id, geo);
  const old = meta.stages;
  meta.stages = [
    {
      id,
      name: name || meta.name,
      file: 'zusammengefügt',
      km: route.totalKm + route.stages.reduce((sum, s) => sum + s.gapBeforeKm, 0),
      ascent: route.ascent,
      descent: route.descent,
      points: route.n,
      chunks,
      hasEle: route.hasEle,
    },
  ];
  for (const s of old) deleteStageGeo(routeId, s);
  await saveMeta(meta);
}

export async function deleteRoute(routeId) {
  const meta = await getRouteMeta(routeId);
  if (meta) for (const s of meta.stages) deleteStageGeo(routeId, s);
  store.deletePrivate(routeKey(routeId));
  routeCache.delete(routeId);
  for (const cb of deleteListeners) cb(routeId);
  const index = await getRouteIndex();
  index.routes = index.routes.filter((r) => r.id !== routeId);
  if (index.active === routeId) index.active = index.routes[0]?.id || null;
  saveIndex(index);
  changed();
}
