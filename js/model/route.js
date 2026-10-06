// Route: alle Etappen einer Route als ein durchgehender Verlauf.
//
// - km zählen über alle Etappen. Liegt zwischen Ende und nächstem Start mehr
//   als GAP_JOIN_M (z.B. eine Fähre), ist das eine Lücke: wird gezeichnet
//   (gestrichelt), aber nicht als Strecke gezählt.
// - Höhenmeter je Etappe mit Hysterese (js/geo/geo.js), über die Route summiert.
// - nearest(): Position → km auf der Route und Abstand zur Route.

import { SegmentIndex, climb, distance, floorIndex } from '../geo/geo.js';

export const GAP_JOIN_M = 300;

export class Route {
  // meta: Routen-Dokument { id, name, stages: [{ id, name, … }], waypoints }
  // geos: Map stageId → { lat, lon, ele|null }
  constructor(meta, geos) {
    this.id = meta.id;
    this.name = meta.name;
    this.meta = meta;
    const total = meta.stages.reduce((sum, s) => sum + (geos.get(s.id)?.lat.length || 0), 0);
    const lat = (this.lat = new Float64Array(total));
    const lon = (this.lon = new Float64Array(total));
    const ele = (this.ele = new Float32Array(total).fill(NaN));
    const dist = (this.dist = new Float64Array(total));
    const gap = (this.gap = new Uint8Array(total)); // gap[i]: Segment i → i+1 ist eine Lücke
    this.cumAscent = new Float32Array(total);
    this.cumDescent = new Float32Array(total);
    this.stages = [];
    this.hasEle = false;

    let k = 0;
    let d = 0;
    let ascentBase = 0;
    let descentBase = 0;
    for (const s of meta.stages) {
      const g = geos.get(s.id);
      if (!g || !g.lat.length) continue;
      const startIdx = k;
      let gapM = 0;
      if (k > 0) {
        const jump = distance(lat[k - 1], lon[k - 1], g.lat[0], g.lon[0]);
        if (jump > GAP_JOIN_M) {
          gap[k - 1] = 1;
          gapM = jump;
        } else d += jump;
      }
      for (let i = 0; i < g.lat.length; i++, k++) {
        if (i > 0) d += distance(g.lat[i - 1], g.lon[i - 1], g.lat[i], g.lon[i]);
        lat[k] = g.lat[i];
        lon[k] = g.lon[i];
        if (g.ele) ele[k] = g.ele[i];
        dist[k] = d;
      }
      const c = g.ele ? climb(g.ele) : null;
      for (let i = 0; i < g.lat.length; i++) {
        this.cumAscent[startIdx + i] = ascentBase + (c ? c.cumAscent[i] : 0);
        this.cumDescent[startIdx + i] = descentBase + (c ? c.cumDescent[i] : 0);
      }
      if (c) {
        ascentBase += c.ascent;
        descentBase += c.descent;
        this.hasEle = true;
      }
      this.stages.push({ ...s, startIdx, endIdx: k - 1, startKm: dist[startIdx] / 1000, endKm: dist[k - 1] / 1000, gapBeforeKm: gapM / 1000 });
    }
    this.n = k;
    this.totalKm = k ? dist[k - 1] / 1000 : 0;
    this.ascent = Math.round(ascentBase);
    this.descent = Math.round(descentBase);
    this._index = null;

    // Wegpunkte aus den GPX-Dateien mit km (falls nahe der Route)
    this.waypoints = (meta.waypoints || []).map((w) => {
      const near = k > 1 ? this.nearest(w.lat, w.lon, 5000) : null;
      return { ...w, km: near ? near.km : null };
    });
  }

  get isEmpty() {
    return this.n < 2;
  }

  get index() {
    if (!this._index) this._index = new SegmentIndex(this.lat, this.lon, { skip: this.gap });
    return this._index;
  }

  // Position → { km, dist (m), lat, lon, seg } oder null (weiter als maxDist)
  nearest(lat, lon, maxDist = 50_000) {
    if (this.n < 2) return null;
    const r = this.index.nearest(lat, lon, maxDist);
    if (!r) return null;
    const i = r.seg;
    const m = this.dist[i] + (this.dist[i + 1] - this.dist[i]) * r.t;
    return { km: m / 1000, dist: r.dist, lat: r.lat, lon: r.lon, seg: i };
  }

  indexAtKm(km) {
    return floorIndex(this.dist, km * 1000);
  }

  // Punkt bei km (interpoliert): { lat, lon, ele, i }
  pointAtKm(km) {
    const m = Math.min(Math.max(km * 1000, 0), this.totalKm * 1000);
    let i = floorIndex(this.dist, m);
    // Bei Lücken (gleiche km am Ende/Anfang) die Etappe nach der Lücke nehmen
    while (i < this.n - 1 && this.gap[i] && this.dist[i + 1] <= m) i++;
    if (i >= this.n - 1) return { lat: this.lat[this.n - 1], lon: this.lon[this.n - 1], ele: this.ele[this.n - 1], i: this.n - 1 };
    const span = this.dist[i + 1] - this.dist[i];
    const t = span > 0 ? (m - this.dist[i]) / span : 0;
    const e0 = this.ele[i];
    const e1 = this.ele[i + 1];
    return {
      lat: this.lat[i] + (this.lat[i + 1] - this.lat[i]) * t,
      lon: this.lon[i] + (this.lon[i + 1] - this.lon[i]) * t,
      ele: Number.isFinite(e0) && Number.isFinite(e1) ? e0 + (e1 - e0) * t : e0,
      i,
    };
  }

  #interp(arr, km) {
    const m = km * 1000;
    const i = floorIndex(this.dist, m);
    if (i < 0) return 0;
    if (i >= this.n - 1) return arr[this.n - 1];
    const span = this.dist[i + 1] - this.dist[i];
    const t = span > 0 ? (m - this.dist[i]) / span : 0;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }

  ascentBetween(fromKm, toKm) {
    return Math.max(0, this.#interp(this.cumAscent, toKm) - this.#interp(this.cumAscent, fromKm));
  }

  descentBetween(fromKm, toKm) {
    return Math.max(0, this.#interp(this.cumDescent, toKm) - this.#interp(this.cumDescent, fromKm));
  }

  stageAt(km) {
    return this.stages.find((s) => km <= s.endKm + 1e-9) || this.stages[this.stages.length - 1] || null;
  }

  // Höhenprofil: [{ km, ele }] mit gleichmässigen Abständen
  profile(fromKm = 0, toKm = this.totalKm, samples = 400) {
    const out = [];
    const span = Math.max(toKm - fromKm, 0.001);
    for (let s = 0; s <= samples; s++) {
      const km = fromKm + (span * s) / samples;
      const p = this.pointAtKm(km);
      out.push({ km, ele: p.ele });
    }
    return out;
  }

  // Für die Karte: Linienzüge je Etappe und Lücken-Linien
  stageLines() {
    return this.stages.map((s) => {
      const pts = [];
      for (let i = s.startIdx; i <= s.endIdx; i++) pts.push([this.lat[i], this.lon[i]]);
      return { stage: s, latlngs: pts };
    });
  }

  gapLines() {
    const lines = [];
    for (let i = 0; i < this.n - 1; i++) {
      if (this.gap[i]) lines.push([
        [this.lat[i], this.lon[i]],
        [this.lat[i + 1], this.lon[i + 1]],
      ]);
    }
    return lines;
  }

  // Abschnitt [fromKm, toKm] als Linienzug (z.B. eine Tagesetappe)
  slice(fromKm, toKm) {
    const a = this.pointAtKm(fromKm);
    const b = this.pointAtKm(toKm);
    const pts = [[a.lat, a.lon]];
    for (let i = a.i + 1; i <= b.i; i++) {
      if (this.gap[i - 1]) {
        pts.push(null); // Lücke: Linie unterbrechen
      }
      pts.push([this.lat[i], this.lon[i]]);
    }
    pts.push([b.lat, b.lon]);
    // In zusammenhängende Teile aufteilen
    const parts = [[]];
    for (const p of pts) {
      if (p === null) parts.push([]);
      else parts[parts.length - 1].push(p);
    }
    return parts.filter((p) => p.length > 1);
  }

  bounds() {
    let s = 90;
    let w = 180;
    let n = -90;
    let e = -180;
    for (let i = 0; i < this.n; i++) {
      s = Math.min(s, this.lat[i]);
      n = Math.max(n, this.lat[i]);
      w = Math.min(w, this.lon[i]);
      e = Math.max(e, this.lon[i]);
    }
    return [
      [s, w],
      [n, e],
    ];
  }
}
