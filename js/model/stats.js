// Statistik: Tages- und Gesamtwerte aus Statuswechseln, Befinden und den
// Standorten der Statuswechsel. Reine Logik ohne Oberfläche (auch für die
// Follower-Seite gedacht).
//
// Tage zählen nach Ortszeit des Fahrers: clientTime + tzOffset des Status-
// wechsels, mit dem ein Abschnitt beginnt (Zeitzonenwechsel, z.B. MESZ → OESZ).
// Strecke: zwischen den Standorten von "Fahren" und dem nächsten Wechsel –
// entlang der Route, wenn beide nahe an ihr liegen, sonst Luftlinie (ca.).

import { distance } from '../geo/geo.js';
import { DIMENSIONS, befindenEvents } from './befinden.js';
import { GROUPS, STATES, statusEvents } from './status.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const NEAR_ROUTE_M = 3000;
// Länger ohne Wechsel gilt als unbekannt (z.B. Test im Herbst, nächster Eintrag
// im Sommer) – sonst würde ein vergessener Status monatelang "fahren".
export const MAX_INTERVAL_MS = 48 * 3_600_000;

export const RANGES = [
  { id: '7', label: '7 Tage', days: 7 },
  { id: '30', label: '30 Tage', days: 30 },
  { id: 'all', label: 'Alles', days: null },
];

const deviceTz = (ms) => -new Date(ms).getTimezoneOffset();
const tzOf = (e) => (Number.isFinite(e?.tzOffset) ? e.tzOffset : deviceTz(e?.clientTime ?? 0));

export function dayKey(ms, tz) {
  return new Date(ms + tz * MINUTE).toISOString().slice(0, 10);
}

function nextMidnight(ms, tz) {
  return (Math.floor((ms + tz * MINUTE) / DAY) + 1) * DAY - tz * MINUTE;
}

function keyMinus(key, days) {
  return new Date(Date.parse(`${key}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);
}

const emptyGroups = () => Object.fromEntries(GROUPS.map((g) => [g.id, 0]));

// Abschnitte [{ state, group, start, end, tz, event, next }] – der letzte endet jetzt
function buildIntervals(events, now) {
  const list = statusEvents(events).filter((e) => e.clientTime <= now);
  return list.map((e, i) => {
    const next = list[i + 1] || null;
    const rawEnd = next ? next.clientTime : now;
    return {
      state: e.data.state,
      group: STATES[e.data.state].group,
      start: e.clientTime,
      end: Math.min(rawEnd, e.clientTime + MAX_INTERVAL_MS),
      tz: tzOf(e),
      event: e,
      next,
      running: !next,
    };
  });
}

// Strecke einer Fahrt (km) oder null; approx = Luftlinie
function rideDistance(part, route) {
  const a = part.event.position;
  const b = part.next?.position;
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return null;
  if (route && !route.isEmpty) {
    const na = route.nearest(a.lat, a.lon, NEAR_ROUTE_M);
    const nb = route.nearest(b.lat, b.lon, NEAR_ROUTE_M);
    if (na && nb && nb.km >= na.km) return { km: nb.km - na.km, approx: false, endKm: nb.km };
  }
  return { km: distance(a.lat, a.lon, b.lat, b.lon) / 1000, approx: true, endKm: null };
}

// events: alle Ereignisse; route: aktive Route (optional, für km entlang der Route)
// range: '7' | '30' | 'all'
export function computeStats(events, now, { route = null, range = 'all' } = {}) {
  const intervals = buildIntervals(events, now);
  const moods = befindenEvents(events).filter((e) => e.clientTime <= now);
  const tzNow = intervals.length ? intervals[intervals.length - 1].tz : deviceTz(now);
  const todayKey = dayKey(now, tzNow);
  const rangeDays = RANGES.find((r) => r.id === range)?.days ?? null;
  const fromKey = rangeDays ? keyMinus(todayKey, rangeDays - 1) : '0000-00-00';
  const inRange = (key) => key >= fromKey && key <= todayKey;

  const days = new Map();
  const day = (key, tz) => {
    if (!days.has(key)) {
      const start = Date.parse(`${key}T00:00:00Z`) - tz * MINUTE;
      days.set(key, {
        key,
        tz,
        start,
        end: start + DAY,
        isToday: key === todayKey,
        groups: emptyGroups(),
        states: {},
        segments: [],
        km: 0,
        kmKnown: false,
        kmApprox: false,
        kmMissing: false,
        endKm: null,
        rides: 0,
        longestRide: 0,
        stops: 0,
        firstRide: null,
        lastStop: null,
        moods: [],
      });
    }
    return days.get(key);
  };

  // Abschnitte auf Tage verteilen (an Mitternacht der Ortszeit teilen)
  for (const part of intervals) {
    const ride = part.state === 'fahren' ? (part.running ? null : rideDistance(part, route)) : null;
    const total = part.end - part.start;
    let t = part.start;
    while (t < part.end) {
      const cut = Math.min(part.end, nextMidnight(t, part.tz));
      const key = dayKey(t, part.tz);
      if (inRange(key)) {
        const d = day(key, part.tz);
        const ms = cut - t;
        d.groups[part.group] += ms;
        d.states[part.state] = (d.states[part.state] || 0) + ms;
        d.segments.push({ state: part.state, group: part.group, start: t, end: cut });
        if (part.state === 'fahren') {
          if (t === part.start) {
            d.rides++;
            if (d.firstRide === null) d.firstRide = t;
          }
          d.longestRide = Math.max(d.longestRide, total);
          if (ride && total > 0) {
            d.km += (ride.km * ms) / total;
            d.kmKnown = true;
            d.kmApprox ||= ride.approx;
            if (ride.endKm !== null && cut === part.end) d.endKm = Math.max(d.endKm ?? 0, ride.endKm);
          } else if (!part.running) d.kmMissing = true;
        } else if (t === part.start && part.group !== 'schlaf') d.stops++;
        if (part.state === 'fahren' && cut === part.end && !part.running) d.lastStop = cut;
      }
      t = cut;
    }
  }
  for (const e of moods) {
    const tz = tzOf(e);
    const key = dayKey(e.clientTime, tz);
    if (inRange(key)) day(key, tz).moods.push(e);
  }

  const list = [...days.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const d of list) {
    d.mood = {};
    for (const dim of DIMENSIONS) {
      const values = d.moods.map((e) => e.data[dim.id]).filter(Number.isFinite);
      d.mood[dim.id] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
  }

  // Gesamtwerte und Rekorde im Zeitraum
  const totals = { groups: emptyGroups(), km: 0, kmKnown: false, kmApprox: false, days: list.length };
  for (const d of list) {
    for (const g of GROUPS) totals.groups[g.id] += d.groups[g.id];
    if (d.kmKnown) {
      totals.km += d.km;
      totals.kmKnown = true;
      totals.kmApprox ||= d.kmApprox;
    }
  }
  const tracked = Object.values(totals.groups).reduce((a, b) => a + b, 0);
  const awake = tracked - totals.groups.schlaf;
  const inRangePart = (p) => inRange(dayKey(p.start, p.tz));
  const parts = intervals.filter(inRangePart);
  const rides = parts.filter((p) => p.state === 'fahren');
  const sleeps = parts.filter((p) => p.state === 'schlafen' && !p.running);
  const stops = parts.filter((p) => p.group !== 'fahren' && p.group !== 'schlaf' && !p.running);
  const pannen = parts.filter((p) => p.state === 'panne');
  let speedKm = 0;
  let speedMs = 0;
  for (const p of rides) {
    if (p.running) continue;
    const r = rideDistance(p, route);
    if (!r) continue;
    speedKm += r.km;
    speedMs += p.end - p.start;
  }
  const longest = rides.reduce((best, p) => (!best || p.end - p.start > best.end - best.start ? p : best), null);
  const records = {
    longestRide: longest ? { ms: longest.end - longest.start, start: longest.start, tz: longest.tz } : null,
    movingShare: awake > 0 ? totals.groups.fahren / awake : null,
    sleepCount: sleeps.length,
    sleepAvg: sleeps.length ? sleeps.reduce((a, p) => a + p.end - p.start, 0) / sleeps.length : null,
    sleepShortest: sleeps.length ? Math.min(...sleeps.map((p) => p.end - p.start)) : null,
    stopCount: stops.length,
    stopAvg: stops.length ? stops.reduce((a, p) => a + p.end - p.start, 0) / stops.length : null,
    panneCount: pannen.length,
    panneMs: pannen.reduce((a, p) => a + p.end - p.start, 0),
    avgSpeed: speedMs > 30 * MINUTE ? speedKm / (speedMs / 3_600_000) : null,
    bestDayKm: list.reduce((best, d) => (d.kmKnown && (!best || d.km > best.km) ? d : best), null),
    bestDayRide: list.reduce((best, d) => (!best || d.groups.fahren > best.groups.fahren ? d : best), null),
  };

  // Befinden-Verlauf je Regler
  const moodSeries = Object.fromEntries(
    DIMENSIONS.map((dim) => [
      dim.id,
      moods.filter((e) => inRange(dayKey(e.clientTime, tzOf(e))) && Number.isFinite(e.data[dim.id])).map((e) => ({ t: e.clientTime, v: e.data[dim.id], tz: tzOf(e) })),
    ]),
  );

  return { days: list, totals, records, moodSeries, todayKey, fromKey, tracked };
}
