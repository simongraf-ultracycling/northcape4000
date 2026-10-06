// Versorgungspunkte entlang der Route aus OpenStreetMap (Overpass-API).
//
// - Abfrage in Abschnitten (CHUNK_KM) entlang der vereinfachten Route; Korridor
//   radius (Versorgung) bzw. radiusStay (Unterkünfte, Orte).
// - Ergebnis im privaten Bereich (zeigt den Routenverlauf!) und danach offline:
//     pois-<routeId>               { radius, radiusStay, chunkKm, chunks, done[], count, updated, routeUpdated }
//     poisdata-<routeId>-<n>       { json: "[…]" }  (kompakte Liste, ein Abschnitt)
// - km entlang der Route und Abstand werden beim Laden berechnet (bleibt so
//   auch nach Änderungen an den Etappen richtig).
// Braucht Netz; die Route wird dabei vereinfacht an den Overpass-Server geschickt.

import { clock } from '../clock.js';
import { simplify } from '../geo/geo.js';
import * as store from '../store.js';
import { isAlwaysOpen } from './opening-hours.js';
import { onRouteDeleted } from './route-store.js';

export const POI_CATEGORIES = [
  { id: 'supermarkt', label: 'Supermarkt', plural: 'Supermärkte und Läden', icon: 'cart' },
  { id: 'tankstelle', label: 'Tankstelle', plural: 'Tankstellen', icon: 'fuel' },
  { id: 'baeckerei', label: 'Bäckerei', plural: 'Bäckereien', icon: 'bread' },
  { id: 'wasser', label: 'Trinkwasser', plural: 'Trinkwasser', icon: 'drop' },
  { id: 'velo', label: 'Velo', plural: 'Velo-Werkstätten', icon: 'wrench' },
  { id: 'unterkunft', label: 'Unterkunft', plural: 'Unterkünfte', icon: 'bed' },
];
// Orte (Städte/Dörfer) werden nur für Beschriftungen genutzt, nicht als Punkte gezeigt
export const PLACE_CATEGORY = 'ort';

export const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export const DEFAULTS = { radius: 1000, radiusStay: 3000, chunkKm: 100 };
const MAX_COORDS = 300;
const REQUEST_TIMEOUT_MS = 120_000;

const indexKey = (routeId) => `pois-${routeId}`;
const dataKey = (routeId, n) => `poisdata-${routeId}-${n}`;

const STAY_TYPES = { hotel: 'Hotel', motel: 'Motel', guest_house: 'Pension', hostel: 'Hostel', camp_site: 'Camping', alpine_hut: 'Hütte', chalet: 'Chalet', apartment: 'Ferienwohnung' };

// OSM-Tags → { c: Kategorie, s: Untertyp } oder null
export function categorize(tags) {
  if (!tags) return null;
  const { shop, amenity, tourism, place } = tags;
  if (shop === 'supermarket') return { c: 'supermarkt', s: 'Supermarkt' };
  if (shop === 'convenience') return { c: 'supermarkt', s: 'Laden' };
  if (amenity === 'fuel') return { c: 'tankstelle', s: 'Tankstelle' };
  if (shop === 'bakery') return { c: 'baeckerei', s: 'Bäckerei' };
  if (amenity === 'drinking_water' || amenity === 'water_point') return { c: 'wasser', s: 'Trinkwasser' };
  if ((tags.man_made === 'water_tap' || tags.natural === 'spring') && tags.drinking_water === 'yes') return { c: 'wasser', s: tags.natural === 'spring' ? 'Quelle' : 'Wasserhahn' };
  if (shop === 'bicycle') return { c: 'velo', s: tags['service:bicycle:repair'] === 'yes' ? 'Velogeschäft mit Werkstatt' : 'Velogeschäft' };
  if (amenity === 'bicycle_repair_station') return { c: 'velo', s: 'Velo-Servicestation' };
  if (STAY_TYPES[tourism]) return { c: 'unterkunft', s: STAY_TYPES[tourism] };
  if (place === 'city' || place === 'town' || place === 'village') return { c: PLACE_CATEGORY, s: place };
  return null;
}

// Overpass-Element → kompakter Punkt
export function toPoi(el) {
  const tags = el.tags || {};
  const cat = categorize(tags);
  if (!cat) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const hours = tags.opening_hours || '';
  const poi = {
    i: `${el.type[0]}${el.id}`,
    c: cat.c,
    s: cat.s,
    a: Math.round(lat * 1e5) / 1e5,
    o: Math.round(lon * 1e5) / 1e5,
    n: tags.name || tags.brand || '',
  };
  if (hours) poi.h = hours;
  if (tags.phone || tags['contact:phone']) poi.p = tags.phone || tags['contact:phone'];
  if (tags.website || tags['contact:website']) poi.w = tags.website || tags['contact:website'];
  if (tags.seasonal && tags.seasonal !== 'no') poi.z = tags.seasonal;
  return poi;
}

// Abfrage für einen Abschnitt (Koordinaten "lat,lon,lat,lon,…")
export function buildQuery(coords, radius, radiusStay) {
  const line = coords.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join(',');
  const a = `around:${Math.round(radius)},${line}`;
  const b = `around:${Math.round(radiusStay)},${line}`;
  return `[out:json][timeout:110];
(
  nwr(${a})["shop"~"^(supermarket|convenience|bakery|bicycle)$"];
  nwr(${a})["amenity"~"^(fuel|drinking_water|water_point|bicycle_repair_station)$"];
  node(${a})["drinking_water"="yes"]["man_made"="water_tap"];
  node(${a})["drinking_water"="yes"]["natural"="spring"];
  nwr(${b})["tourism"~"^(hotel|motel|guest_house|hostel|camp_site|alpine_hut|chalet)$"];
  node(${b})["place"~"^(city|town|village)$"];
);
out center tags qt;`;
}

// Abschnitte der Route: [{ fromKm, toKm, coords }]
export function routeChunks(route, chunkKm = DEFAULTS.chunkKm) {
  const chunks = [];
  for (let from = 0; from < route.totalKm - 0.01; from += chunkKm) {
    const to = Math.min(route.totalKm, from + chunkKm);
    const a = route.pointAtKm(from).i;
    const b = Math.min(route.n - 1, route.pointAtKm(to).i + 1);
    const lat = Array.from(route.lat.subarray(a, b + 1));
    const lon = Array.from(route.lon.subarray(a, b + 1));
    let tolerance = 60;
    let keep = simplify(lat, lon, null, { tolerance, minStep: 20 });
    while (keep.length > MAX_COORDS) {
      tolerance *= 1.6;
      keep = simplify(lat, lon, null, { tolerance, minStep: 20 });
    }
    chunks.push({ fromKm: from, toKm: to, coords: keep.map((i) => [lat[i], lon[i]]) });
  }
  return chunks;
}

async function postQuery(query, signal) {
  let lastError = null;
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length * 2; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => timeout.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: timeout.signal,
      });
      if (res.ok) return await res.json();
      lastError = new Error(`${new URL(endpoint).host}: HTTP ${res.status}`);
      // 429/504: Server ausgelastet → kurz warten, anderen Server versuchen
      await new Promise((r) => setTimeout(r, res.status === 429 ? 4000 : 1500));
    } catch (err) {
      if (signal?.aborted) throw new Error('Abgebrochen');
      lastError = err.name === 'AbortError' ? new Error('Zeitüberschreitung') : err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new Error('Overpass nicht erreichbar');
}

// --- Speicher -------------------------------------------------------------------------

export async function getPoiIndex(routeId) {
  return store.getPrivate(indexKey(routeId));
}

// Lädt fehlende Abschnitte von Overpass und speichert sie.
// onProgress({ done, total, count }); bricht mit signal ab (Fortsetzen möglich).
export async function fetchPois(route, { radius = DEFAULTS.radius, radiusStay = DEFAULTS.radiusStay, restart = false, signal, onProgress } = {}) {
  if (!navigator.onLine) throw new Error('Kein Netz – Versorgung laden braucht eine Internetverbindung');
  const chunks = routeChunks(route, DEFAULTS.chunkKm);
  let index = restart ? null : await getPoiIndex(route.id);
  const sameSetup = index && index.radius === radius && index.radiusStay === radiusStay && index.chunks === chunks.length && index.routeUpdated === route.meta.updated;
  if (!sameSetup) {
    if (index) await deletePois(route.id, index);
    index = { radius, radiusStay, chunkKm: DEFAULTS.chunkKm, chunks: chunks.length, done: [], counts: {}, count: 0, updated: null, routeUpdated: route.meta.updated };
  }
  const done = new Set(index.done);
  onProgress?.({ done: done.size, total: chunks.length, count: index.count });
  for (let n = 0; n < chunks.length; n++) {
    if (done.has(n)) continue;
    if (signal?.aborted) throw new Error('Abgebrochen');
    const data = await postQuery(buildQuery(chunks[n].coords, radius, radiusStay), signal);
    const pois = (data.elements || []).map(toPoi).filter(Boolean);
    store.setPrivate(dataKey(route.id, n), { json: JSON.stringify(pois) });
    done.add(n);
    index.done = [...done].sort((a, b) => a - b);
    index.counts[n] = pois.length;
    index.count = Object.values(index.counts).reduce((s, c) => s + c, 0);
    index.updated = clock.now();
    store.setPrivate(indexKey(route.id), index);
    onProgress?.({ done: done.size, total: chunks.length, count: index.count });
    await new Promise((r) => setTimeout(r, 700)); // Server schonen
  }
  poiCache.delete(route.id);
  return index;
}

export async function deletePois(routeId, index) {
  const idx = index || (await getPoiIndex(routeId).catch(() => null));
  if (!idx) return;
  for (let n = 0; n < (idx.chunks || 0); n++) store.deletePrivate(dataKey(routeId, n));
  store.deletePrivate(indexKey(routeId));
  poiCache.delete(routeId);
}

onRouteDeleted((routeId) => deletePois(routeId));

// --- Laden ----------------------------------------------------------------------------

const poiCache = new Map(); // routeId → { key, promise }

// Alle Punkte der Route mit km und Abstand, nach km sortiert:
// [{ id, cat, sub, lat, lon, name, hours, phone, web, seasonal, km, off, always }]
export async function loadPois(route) {
  const index = await getPoiIndex(route.id);
  if (!index || !index.done?.length) return { index: index || null, pois: [], places: [] };
  const key = `${index.updated}|${route.meta.updated}`;
  const cached = poiCache.get(route.id);
  if (cached?.key === key) return cached.promise;
  const promise = (async () => {
    const parts = await Promise.all(index.done.map((n) => store.getPrivate(dataKey(route.id, n)).catch(() => null)));
    const seen = new Set();
    const pois = [];
    const places = [];
    const maxOff = Math.max(index.radius, index.radiusStay) * 1.5;
    for (const part of parts) {
      if (!part?.json) continue;
      for (const p of JSON.parse(part.json)) {
        if (seen.has(p.i)) continue;
        seen.add(p.i);
        const near = route.nearest(p.a, p.o, maxOff);
        if (!near) continue;
        const item = { id: p.i, cat: p.c, sub: p.s, lat: p.a, lon: p.o, name: p.n, hours: p.h || '', phone: p.p || '', web: p.w || '', seasonal: p.z || '', km: near.km, off: near.dist, always: isAlwaysOpen(p.h) };
        (p.c === PLACE_CATEGORY ? places : pois).push(item);
      }
    }
    pois.sort((a, b) => a.km - b.km);
    places.sort((a, b) => a.km - b.km);
    return { index, pois, places };
  })();
  poiCache.set(route.id, { key, promise });
  promise.catch(() => poiCache.delete(route.id));
  return promise;
}

// Nächster Ort nahe km (für Beschriftungen wie "bei Sterzing")
export function placeNear(places, km, maxKm = 15) {
  let best = null;
  for (const p of places) {
    const d = Math.abs(p.km - km);
    if (d > maxKm) continue;
    // Städte bevorzugen, dann Nähe
    const weight = d + (p.sub === 'village' ? 4 : p.sub === 'town' ? 1 : 0) + p.off / 1000;
    if (!best || weight < best.weight) best = { place: p, weight };
  }
  return best?.place || null;
}
