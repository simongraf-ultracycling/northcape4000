// Status-Automat: Zustände, sinnvolle Übergänge und Auswertungen.
// Reine Logik ohne Oberfläche – auch für Statistik und Follower-Seite gedacht.
//
// Ein Statuswechsel ist ein Ereignis (races/{raceId}/events):
//   { type: 'status', data: { state, from }, clientTime, … }
// Ungültig gemachte Ereignisse (voided: true) zählen nirgends. Massgeblich ist
// immer clientTime (auch nach einer Zeitkorrektur im Verlauf).

export const STATES = {
  fahren: { id: 'fahren', label: 'Fahren', icon: 'bike', category: 'fahren' },
  pause: { id: 'pause', label: 'Pause', icon: 'pause', category: 'pause' },
  versorgung: { id: 'versorgung', label: 'Versorgung', icon: 'cart', category: 'pause' },
  hotel: { id: 'hotel', label: 'Hotel', icon: 'bed', category: 'pause' },
  schlafen: { id: 'schlafen', label: 'Schlafen', icon: 'moon', category: 'schlaf' },
  wach: { id: 'wach', label: 'Wach', icon: 'sun', category: 'pause' },
};

export const STATE_IDS = Object.keys(STATES);

// Auswertungs-Gruppen für "Heute" und die spätere Statistik
export const CATEGORIES = [
  { id: 'fahren', label: 'Fahren' },
  { id: 'pause', label: 'Pausen' },
  { id: 'schlaf', label: 'Schlaf' },
];

// Vorgeschlagene nächste Schritte je Zustand (der erste ist der wahrscheinlichste).
// Alle anderen Zustände bleiben über "Anderer Status" erreichbar.
const NEXT = {
  none: ['fahren'],
  fahren: ['pause', 'versorgung', 'hotel', 'schlafen'],
  pause: ['fahren', 'versorgung', 'schlafen'],
  versorgung: ['fahren', 'pause', 'hotel'],
  hotel: ['schlafen', 'fahren', 'versorgung'],
  schlafen: ['wach'],
  wach: ['fahren', 'versorgung', 'schlafen'],
};

export function nextStates(current) {
  return NEXT[current || 'none'] || NEXT.none;
}

// Beschriftung eines Knopfs, der in den Zustand "to" wechselt
export function actionLabel(to, from) {
  if (to === 'fahren') return !from || from === 'wach' || from === 'hotel' ? 'Losgefahren' : 'Weiterfahren';
  if (to === 'wach') return 'Aufgewacht';
  return STATES[to]?.label || to;
}

// --- Auswertung ------------------------------------------------------------------

// Gültige Statuswechsel, älteste zuerst
export function statusEvents(events) {
  return events
    .filter((e) => e.type === 'status' && !e.voided && STATES[e.data?.state] && Number.isFinite(e.clientTime))
    .sort((a, b) => a.clientTime - b.clientTime);
}

// Aktueller Status: { state, since, event } oder null
export function currentStatus(events, now) {
  const list = statusEvents(events).filter((e) => e.clientTime <= now);
  const last = list[list.length - 1];
  return last ? { state: last.data.state, since: last.clientTime, event: last } : null;
}

// Abschnitte [{ state, start, end, event }] – der letzte endet "jetzt"
export function intervals(events, now) {
  const list = statusEvents(events).filter((e) => e.clientTime <= now);
  return list.map((e, i) => ({
    state: e.data.state,
    start: e.clientTime,
    end: i + 1 < list.length ? list[i + 1].clientTime : now,
    event: e,
  }));
}

// Mitternacht (Ortszeit des Geräts) des Tages, in dem "ms" liegt
export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Dauer je Gruppe im Zeitraum [from, to): { fahren, pause, schlaf } in ms
export function durationsBetween(events, from, to) {
  const sums = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const part of intervals(events, to)) {
    const start = Math.max(part.start, from);
    const end = Math.min(part.end, to);
    if (end > start) sums[STATES[part.state].category] += end - start;
  }
  return sums;
}
