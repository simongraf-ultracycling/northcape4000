// GPX lesen (GPS Exchange Format 1.0/1.1) und für die App aufbereiten.
//
// Ein einfacher, toleranter Scanner statt DOMParser: offizielle Routen können
// sehr gross sein (viele MB), und der Scanner läuft auch im Import-Worker.
// Unterstützt <trk>/<trkseg>/<trkpt>, <rte>/<rtept> und <wpt>.

import { climb, cumulativeDistance, encodeCoords, encodeElevation, hasElevation, simplify } from './geo.js';

const TAG = /<(\/?)(?:[A-Za-z_][\w.-]*:)?(trk|rte|trkseg|trkpt|rtept|wpt|ele|name|desc|type|sym|metadata)\b([^>]*?)(\/?)>/g;
const ATTR_LAT = /\blat\s*=\s*["']([^"']+)["']/;
const ATTR_LON = /\blon\s*=\s*["']([^"']+)["']/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Liest den GPX-Text. Ergebnis:
// { name, tracks: [{ name, lat: [], lon: [], ele: [] }], waypoints: [{ lat, lon, ele, name, desc, type }] }
export function parseGpx(text) {
  if (typeof text !== 'string' || !/<gpx[\s>]/i.test(text.slice(0, 4000))) throw new Error('Keine GPX-Datei');
  const result = { name: '', tracks: [], waypoints: [] };
  let track = null; // aktuelle Spur (trk oder rte)
  let point = null; // aktueller trkpt/rtept/wpt
  let pointKind = null;
  let inMetadata = false;

  const readText = (from) => {
    if (text.startsWith('<![CDATA[', from)) {
      const end = text.indexOf(']]>', from);
      return end < 0 ? '' : text.slice(from + 9, end).trim();
    }
    const end = text.indexOf('<', from);
    return decodeEntities(text.slice(from, end < 0 ? undefined : end)).trim();
  };

  const finishPoint = () => {
    if (!point) return;
    const { lat, lon } = point;
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      if (pointKind === 'wpt') result.waypoints.push(point);
      else if (track) {
        track.lat.push(lat);
        track.lon.push(lon);
        track.ele.push(Number.isFinite(point.ele) ? point.ele : NaN);
      }
    }
    point = null;
    pointKind = null;
  };

  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(text))) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (!closing) {
      switch (tag) {
        case 'metadata':
          inMetadata = !selfClosing;
          break;
        case 'trk':
        case 'rte':
          if (!selfClosing) track = { name: '', lat: [], lon: [], ele: [] };
          break;
        case 'trkpt':
        case 'rtept':
        case 'wpt': {
          finishPoint();
          point = { lat: parseFloat(ATTR_LAT.exec(attrs)?.[1]), lon: parseFloat(ATTR_LON.exec(attrs)?.[1]), ele: NaN, name: '', desc: '', type: '' };
          pointKind = tag;
          if (selfClosing) finishPoint();
          break;
        }
        case 'ele':
          if (point && !selfClosing) point.ele = parseFloat(readText(TAG.lastIndex));
          break;
        case 'name':
        case 'desc':
        case 'type':
        case 'sym': {
          if (selfClosing) break;
          const value = readText(TAG.lastIndex);
          if (point) {
            if (tag === 'sym') point.type ||= value;
            else point[tag] ||= value;
          } else if (track && tag === 'name') track.name ||= value;
          else if (tag === 'name' && (inMetadata || !result.name)) result.name ||= value;
          break;
        }
        default:
          break;
      }
    } else {
      switch (tag) {
        case 'trkpt':
        case 'rtept':
        case 'wpt':
          finishPoint();
          break;
        case 'trk':
        case 'rte':
          finishPoint();
          if (track && track.lat.length) result.tracks.push(track);
          track = null;
          break;
        case 'metadata':
          inMetadata = false;
          break;
        default:
          break;
      }
    }
  }
  finishPoint();
  if (track && track.lat.length) result.tracks.push(track);
  return result;
}

// Spur → Etappe: vereinfacht (3D-Douglas-Peucker), Kennzahlen, kodierte Geometrie.
export function trackToStage(track, { name, file, tolerance = 5 } = {}) {
  const keep = simplify(track.lat, track.lon, track.ele, { tolerance });
  const lat = keep.map((i) => track.lat[i]);
  const lon = keep.map((i) => track.lon[i]);
  const ele = keep.map((i) => track.ele[i]);
  const dist = cumulativeDistance(lat, lon);
  const withEle = hasElevation(ele);
  const { ascent, descent } = withEle ? climb(ele) : { ascent: 0, descent: 0 };
  return {
    name: name || track.name || 'Etappe',
    file: file || '',
    points: lat.length,
    originalPoints: track.lat.length,
    km: dist[dist.length - 1] / 1000,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    hasEle: withEle,
    start: [lat[0], lon[0]],
    end: [lat[lat.length - 1], lon[lon.length - 1]],
    geo: { p: encodeCoords(lat, lon), e: withEle ? encodeElevation(ele) : null },
  };
}

// Ganze GPX-Datei → Etappen (eine je Spur) und Wegpunkte
export function gpxToStages(text, fileName = '') {
  const gpx = parseGpx(text);
  if (!gpx.tracks.length) throw new Error('Die Datei enthält keine Spur (trk/rte)');
  const base = fileName.replace(/\.gpx$/i, '');
  const stages = gpx.tracks.map((track, i) =>
    trackToStage(track, {
      name: track.name || (gpx.tracks.length > 1 ? `${gpx.name || base} ${i + 1}` : gpx.name || base),
      file: fileName,
    }),
  );
  const waypoints = gpx.waypoints.map((w) => ({
    lat: Math.round(w.lat * 1e5) / 1e5,
    lon: Math.round(w.lon * 1e5) / 1e5,
    name: w.name || w.desc || 'Wegpunkt',
    type: w.type || '',
  }));
  return { name: gpx.name || base, stages, waypoints };
}
