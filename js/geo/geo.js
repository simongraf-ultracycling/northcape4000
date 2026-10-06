// Geo-Grundlagen: Distanzen, Vereinfachung, Polyline-Kodierung, Höhenmeter und
// ein räumlicher Index für "nächster Punkt auf der Route". Reine Rechen-
// funktionen ohne Oberfläche (laufen auch im Import-Worker).
//
// Koordinaten immer als getrennte Zahlen-Arrays lat[], lon[], ele[] (ele darf
// fehlen bzw. NaN enthalten). Distanzen in Metern.

export const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

// Grosskreis-Distanz (Haversine) in Metern
export function distance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Kumulierte Distanz je Punkt (Meter)
export function cumulativeDistance(lat, lon) {
  const n = lat.length;
  const out = new Float64Array(n);
  for (let i = 1; i < n; i++) out[i] = out[i - 1] + distance(lat[i - 1], lon[i - 1], lat[i], lon[i]);
  return out;
}

// --- Vereinfachung -------------------------------------------------------------------
//
// Douglas-Peucker in 3D (Lage + Höhe, je in Metern): behält die Form der Route
// UND des Höhenprofils innerhalb der Toleranz – Höhenmeter bleiben so fast
// unverändert. Vorher werden Punkte näher als minStep zusammengefasst.
// Gibt die Indizes der behaltenen Punkte zurück.

export function simplify(lat, lon, ele, { tolerance = 5, minStep = 2 } = {}) {
  const n = lat.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);

  // 1. Radial-Filter (sehr dichte Aufzeichnungen)
  const pre = [0];
  for (let i = 1; i < n - 1; i++) {
    const j = pre[pre.length - 1];
    if (distance(lat[j], lon[j], lat[i], lon[i]) >= minStep) pre.push(i);
  }
  pre.push(n - 1);
  const m = pre.length;

  // 2. Lokale Projektion in Meter
  const x = new Float64Array(m);
  const y = new Float64Array(m);
  const z = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const i = pre[k];
    x[k] = lon[i] * RAD * EARTH_RADIUS * Math.cos(lat[i] * RAD);
    y[k] = lat[i] * RAD * EARTH_RADIUS;
    const e = ele ? ele[i] : NaN;
    z[k] = Number.isFinite(e) ? e : 0;
  }

  // 3. Douglas-Peucker (iterativ, kein Rekursions-Limit)
  const keep = new Uint8Array(m);
  keep[0] = 1;
  keep[m - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack = [0, m - 1];
  while (stack.length) {
    const last = stack.pop();
    const first = stack.pop();
    const ax = x[first];
    const ay = y[first];
    const az = z[first];
    const dx = x[last] - ax;
    const dy = y[last] - ay;
    const dz = z[last] - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let maxD = -1;
    let idx = -1;
    for (let k = first + 1; k < last; k++) {
      let t = len2 ? ((x[k] - ax) * dx + (y[k] - ay) * dy + (z[k] - az) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t * dx - x[k];
      const py = ay + t * dy - y[k];
      const pz = az + t * dz - z[k];
      const d2 = px * px + py * py + pz * pz;
      if (d2 > maxD) {
        maxD = d2;
        idx = k;
      }
    }
    if (idx > 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push(first, idx, idx, last);
    }
  }
  const out = [];
  for (let k = 0; k < m; k++) if (keep[k]) out.push(pre[k]);
  return out;
}

// --- Höhenmeter ----------------------------------------------------------------------
//
// Mit Hysterese (Standard 5 m), damit GPS-Rauschen nicht als Anstieg zählt.
// cumAscent[i] / cumDescent[i]: Summe bis Punkt i.

export const CLIMB_THRESHOLD = 5;

export function climb(ele, threshold = CLIMB_THRESHOLD) {
  const n = ele ? ele.length : 0;
  const cumAscent = new Float32Array(n);
  const cumDescent = new Float32Array(n);
  let ascent = 0;
  let descent = 0;
  let ref = NaN;
  for (let i = 0; i < n; i++) {
    const e = ele[i];
    if (Number.isFinite(e)) {
      if (!Number.isFinite(ref)) ref = e;
      else if (e - ref >= threshold) {
        ascent += e - ref;
        ref = e;
      } else if (ref - e >= threshold) {
        descent += ref - e;
        ref = e;
      }
    }
    cumAscent[i] = ascent;
    cumDescent[i] = descent;
  }
  return { ascent, descent, cumAscent, cumDescent };
}

export function hasElevation(ele) {
  if (!ele) return false;
  for (let i = 0; i < ele.length; i++) if (Number.isFinite(ele[i])) return true;
  return false;
}

// --- Polyline-Kodierung (Google-Verfahren) --------------------------------------------
// Kompakt und ohne verschachtelte Arrays – passt in Firestore-Dokumente.

function encodeValue(v, out) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  while (n >= 0x20) {
    out.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
    n >>>= 5;
  }
  out.push(String.fromCharCode(n + 63));
}

function decodeValues(str, dims) {
  const values = [];
  const prev = new Array(dims).fill(0);
  let index = 0;
  let dim = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    const delta = result & 1 ? ~(result >> 1) : result >> 1;
    prev[dim] += delta;
    values.push(prev[dim]);
    dim = (dim + 1) % dims;
  }
  return values;
}

// Koordinaten mit 5 Nachkommastellen (~1 m)
export function encodeCoords(lat, lon) {
  const out = [];
  let pLat = 0;
  let pLon = 0;
  for (let i = 0; i < lat.length; i++) {
    const a = Math.round(lat[i] * 1e5);
    const o = Math.round(lon[i] * 1e5);
    encodeValue(a - pLat, out);
    encodeValue(o - pLon, out);
    pLat = a;
    pLon = o;
  }
  return out.join('');
}

export function decodeCoords(str) {
  const values = decodeValues(str || '', 2);
  const n = values.length >> 1;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lat[i] = values[2 * i] / 1e5;
    lon[i] = values[2 * i + 1] / 1e5;
  }
  return { lat, lon };
}

// Höhen in ganzen Metern; fehlende Werte werden aus den Nachbarn ergänzt.
export function encodeElevation(ele) {
  if (!hasElevation(ele)) return null;
  const filled = fillGaps(ele);
  const out = [];
  let prev = 0;
  for (let i = 0; i < filled.length; i++) {
    const v = Math.round(filled[i]);
    encodeValue(v - prev, out);
    prev = v;
  }
  return out.join('');
}

export function decodeElevation(str) {
  if (!str) return null;
  return Float32Array.from(decodeValues(str, 1));
}

function fillGaps(ele) {
  const out = Array.from(ele);
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) last = out[i];
    else out[i] = last;
  }
  let next = NaN;
  for (let i = out.length - 1; i >= 0; i--) {
    if (Number.isFinite(out[i])) next = out[i];
    else out[i] = next;
  }
  return out.map((v) => (Number.isFinite(v) ? v : 0));
}

// --- Räumlicher Index: nächster Punkt auf einer Linie -------------------------------
//
// Teilt die Segmente in ein Gitter (cell Grad) ein und sucht ringweise.
// skip[i] = 1: Segment i → i+1 gehört nicht zur Route (z.B. Fähre/Lücke).

export class SegmentIndex {
  constructor(lat, lon, { cell = 0.02, skip = null } = {}) {
    this.lat = lat;
    this.lon = lon;
    this.cell = cell;
    this.grid = new Map();
    for (let i = 0; i < lat.length - 1; i++) {
      if (skip && skip[i]) continue;
      const r0 = Math.floor(Math.min(lat[i], lat[i + 1]) / cell);
      const r1 = Math.floor(Math.max(lat[i], lat[i + 1]) / cell);
      const c0 = Math.floor(Math.min(lon[i], lon[i + 1]) / cell);
      const c1 = Math.floor(Math.max(lon[i], lon[i + 1]) / cell);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = r * 100000 + c;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  // { seg, t, dist, lat, lon } oder null, wenn weiter als maxDist (Meter)
  nearest(qLat, qLon, maxDist = 50_000) {
    const { cell, lat, lon } = this;
    const cosQ = Math.cos(qLat * RAD);
    const mPerDegLat = RAD * EARTH_RADIUS;
    const mPerDegLon = mPerDegLat * Math.max(cosQ, 0.01);
    const r0 = Math.floor(qLat / cell);
    const c0 = Math.floor(qLon / cell);
    // Zellen in Breite/Länge, die maxDist sicher abdecken
    const maxRingLat = Math.ceil(maxDist / (mPerDegLat * cell)) + 1;
    const maxRingLon = Math.ceil(maxDist / (mPerDegLon * cell)) + 1;
    const maxRing = Math.min(Math.max(maxRingLat, maxRingLon), 400);
    let best = null;
    const seen = new Set();
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const list = this.grid.get((r0 + dr) * 100000 + (c0 + dc));
          if (!list) continue;
          for (const i of list) {
            if (seen.has(i)) continue;
            seen.add(i);
            // Lokale Ebene um den Suchpunkt
            const ax = (lon[i] - qLon) * mPerDegLon;
            const ay = (lat[i] - qLat) * mPerDegLat;
            const bx = (lon[i + 1] - qLon) * mPerDegLon;
            const by = (lat[i + 1] - qLat) * mPerDegLat;
            const dx = bx - ax;
            const dy = by - ay;
            const len2 = dx * dx + dy * dy;
            let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + t * dx;
            const py = ay + t * dy;
            const dist = Math.sqrt(px * px + py * py);
            if (!best || dist < best.dist) best = { seg: i, t, dist };
          }
        }
      }
      // Alles innerhalb des bisher Besten ist sicher abgesucht
      const covered = ring * cell * Math.min(mPerDegLat, mPerDegLon);
      if (best && best.dist <= covered) break;
      if (covered > maxDist + cell * mPerDegLat) break;
    }
    if (!best || best.dist > maxDist) return null;
    const i = best.seg;
    best.lat = lat[i] + (lat[i + 1] - lat[i]) * best.t;
    best.lon = lon[i] + (lon[i + 1] - lon[i]) * best.t;
    return best;
  }
}

// Binäre Suche: grösster Index mit values[i] <= v
export function floorIndex(values, v) {
  let lo = 0;
  let hi = values.length - 1;
  if (hi < 0) return -1;
  if (v <= values[0]) return 0;
  if (v >= values[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
