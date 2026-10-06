// Tagesplanung: Schlafstopps entlang der Route.
//
// Modell (bewusst einfach, gut nachvollziehbar):
//   Fahrzeit für eine Strecke = km / Tempo + Höhenmeter / Steigleistung
//   Pausen kommen anteilig dazu (Pausen pro Tag / Fahrzeit pro Tag)
//   Ein Tag endet, wenn die Fahrzeit pro Tag erreicht ist – oder an einem
//   festgelegten Schlafstopp (pins: { Tag: km }). Danach folgt der Schlaf.
// Ergebnis: Tage mit Start, Ankunft, Abfahrt; eta(km) für jeden Punkt.
//
// Gespeichert privat (verrät die Route): plan-<routeId> = { settings, pins, updated }

import { clock } from '../clock.js';
import * as store from '../store.js';
import { onRouteDeleted } from './route-store.js';

const HOUR = 3_600_000;
const MAX_DAYS = 60;
const key = (routeId) => `plan-${routeId}`;

export const DEFAULT_SETTINGS = {
  start: null, // ms; null = morgen 06:00
  speed: 22, // km/h in der Ebene (Fahrzeit, ohne Pausen)
  climbRate: 700, // Höhenmeter pro Stunde zusätzlich
  rideHours: 15, // Fahrzeit pro Tag
  pauseHours: 2.5, // Pausen pro Tag (Essen, Einkaufen …)
  sleepHours: 5, // Schlaf inkl. Abend/Morgen
};

export function defaultStart(now) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

export async function loadPlan(routeId) {
  const stored = await store.getPrivate(key(routeId));
  return { settings: { ...DEFAULT_SETTINGS, ...(stored?.settings || {}) }, pins: stored?.pins || {} };
}

export function savePlan(routeId, plan) {
  return store.setPrivate(key(routeId), { settings: plan.settings, pins: plan.pins, updated: clock.now() });
}

onRouteDeleted((routeId) => store.deletePrivate(key(routeId)));

// Reine Fahrzeit in Stunden zwischen zwei km
export function movingHours(route, fromKm, toKm, settings) {
  if (toKm <= fromKm) return 0;
  return (toKm - fromKm) / settings.speed + route.ascentBetween(fromKm, toKm) / settings.climbRate;
}

// km, an dem ab startKm die Fahrzeit "hours" erreicht ist (binäre Suche)
function kmAfterHours(route, startKm, hours, settings) {
  if (movingHours(route, startKm, route.totalKm, settings) <= hours) return route.totalKm;
  let lo = startKm;
  let hi = route.totalKm;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (movingHours(route, startKm, mid, settings) < hours) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Plan berechnen: { days, finish, totalHours, eta(km) }
export function computePlan(route, settingsIn, pins = {}, now = clock.now()) {
  const settings = { ...DEFAULT_SETTINGS, ...settingsIn };
  for (const k of ['speed', 'climbRate', 'rideHours']) if (!(settings[k] > 0)) settings[k] = DEFAULT_SETTINGS[k];
  for (const k of ['pauseHours', 'sleepHours']) if (!(settings[k] >= 0)) settings[k] = DEFAULT_SETTINGS[k];
  const start = Number.isFinite(settings.start) ? settings.start : defaultStart(now);
  const pauseFactor = settings.pauseHours / settings.rideHours;
  const days = [];
  if (!route || route.totalKm <= 0) return { days, finish: null, start, settings, eta: () => null };

  let km = 0;
  let t = start;
  for (let day = 1; day <= MAX_DAYS && km < route.totalKm - 0.05; day++) {
    const pin = Number(pins[day]);
    let endKm;
    let pinned = false;
    let pinIgnored = false;
    if (Number.isFinite(pin) && pin > km + 1 && pin <= route.totalKm + 0.01) {
      endKm = Math.min(pin, route.totalKm);
      pinned = true;
    } else {
      if (Number.isFinite(pin)) pinIgnored = true;
      endKm = kmAfterHours(route, km, settings.rideHours, settings);
    }
    const last = endKm >= route.totalKm - 0.05;
    // Ohne festen Stopp endet der Tag genau nach der Fahrzeit pro Tag
    const ride = pinned || last ? movingHours(route, km, endKm, settings) : settings.rideHours;
    const arrive = t + ride * (1 + pauseFactor) * HOUR;
    days.push({
      day,
      startKm: km,
      endKm,
      km: endKm - km,
      ascent: Math.round(route.ascentBetween(km, endKm)),
      descent: Math.round(route.descentBetween(km, endKm)),
      rideHours: ride,
      start: t,
      arrive,
      depart: last ? null : arrive + settings.sleepHours * HOUR,
      pinned,
      pinIgnored,
      last,
    });
    km = endKm;
    t = arrive + settings.sleepHours * HOUR;
  }

  // Ankunftszeit bei km (Fahrt mit anteiligen Pausen; Schlaf an den Tagesenden)
  const eta = (atKm) => {
    if (!Number.isFinite(atKm)) return null;
    const d = days.find((x) => atKm <= x.endKm + 1e-6) || days[days.length - 1];
    if (!d) return null;
    const k = Math.min(Math.max(atKm, d.startKm), d.endKm);
    return d.start + movingHours(route, d.startKm, k, settings) * (1 + pauseFactor) * HOUR;
  };

  const lastDay = days[days.length - 1];
  return {
    days,
    start,
    settings,
    finish: lastDay?.last ? lastDay.arrive : null,
    totalHours: lastDay ? (lastDay.arrive - start) / HOUR : 0,
    eta,
  };
}

// Unterkünfte nahe einem Schlafstopp (vor allem kurz davor), beste zuerst
export function staysNear(pois, km, { before = 25, after = 8, maxOff = 3000, limit = 4 } = {}) {
  return pois
    .filter((p) => p.cat === 'unterkunft' && p.km >= km - before && p.km <= km + after && p.off <= maxOff)
    .map((p) => ({ poi: p, score: Math.abs(p.km - km) + (p.km > km ? 3 : 0) + p.off / 500 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.poi);
}
