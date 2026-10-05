// Befinden: vier Regler von 0 bis 10.
// Ein Eintrag ist ein Ereignis (races/{raceId}/events):
//   { type: 'befinden', data: { muedigkeit, sitz, mental, motivation }, clientTime, … }
//
// Richtung: Bei Müdigkeit und Sitzproblemen ist 0 gut, bei Mental und
// Motivation ist 10 gut. Die Farbe (gut/mittel/schlecht) zeigt das einheitlich.

export const SCALE = { min: 0, max: 10 };

export const DIMENSIONS = [
  { id: 'muedigkeit', label: 'Müdigkeit', low: 'frisch', high: 'todmüde', higherIsBetter: false, initial: 2 },
  { id: 'sitz', label: 'Sitzprobleme', low: 'keine', high: 'stark', higherIsBetter: false, initial: 0 },
  { id: 'mental', label: 'Mental', low: 'am Boden', high: 'top', higherIsBetter: true, initial: 8 },
  { id: 'motivation', label: 'Motivation', low: 'keine', high: 'voll', higherIsBetter: true, initial: 8 },
];

// 'ok' | 'warn' | 'danger'
export function level(dimension, value) {
  const good = dimension.higherIsBetter ? value / SCALE.max : 1 - value / SCALE.max;
  if (good >= 0.6) return 'ok';
  if (good >= 0.3) return 'warn';
  return 'danger';
}

export function clampValue(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(SCALE.max, Math.max(SCALE.min, n)) : null;
}

// Letzter gültiger Eintrag oder null
export function latestBefinden(events) {
  let latest = null;
  for (const e of events) {
    if (e.type !== 'befinden' || e.voided || !e.data || !Number.isFinite(e.clientTime)) continue;
    if (!latest || e.clientTime > latest.clientTime) latest = e;
  }
  return latest;
}

// Kurzform für Listen, z.B. "Müdigkeit 3 · Sitz 2 · Mental 7 · Motivation 8"
export function summary(data) {
  return DIMENSIONS.map((d) => `${d.id === 'sitz' ? 'Sitz' : d.label} ${data?.[d.id] ?? '–'}`).join(' · ');
}
