// Testdaten für den Sim-Modus. Pfade relativ zu races/{raceId}; '' ist das
// Renn-Dokument selbst. Spätere Etappen ergänzen hier passende Testdaten.
// Zeiten relativ zum Start der Simulation ("now"), damit "Heute", der Verlauf
// und die Statistik immer etwas zeigen. Zurücksetzen: Mehr → Debug → Testdaten.

import { distance } from '../geo/geo.js';
import { testRouteLine } from '../model/testroute.js';

// Punkt nach "km" entlang einer Linie [[lat, lon], …]
function pointAlong(line, km) {
  let rest = km * 1000;
  for (let i = 1; i < line.length; i++) {
    const [la0, lo0] = line[i - 1];
    const [la1, lo1] = line[i];
    const len = distance(la0, lo0, la1, lo1);
    if (rest <= len) {
      const t = len ? rest / len : 0;
      return [la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t];
    }
    rest -= len;
  }
  return line[line.length - 1];
}

export function createSeed(now) {
  const hour = 3_600_000;
  const meta = (t) => ({ clientTime: t, tzOffset: -new Date(t).getTimezoneOffset(), appVersion: 'testdaten', serverTime: t });
  const pad = (n) => String(n).padStart(2, '0');

  const seed = {
    '': { name: 'Beispiel-Tour – Testdaten', ...meta(now - 82 * hour) },
    'config/race': {
      value: {
        name: 'Beispiel-Tour',
        start: 'Zürich',
        checkpoints: ['Chur', 'Bormio', 'Bozen', 'Innsbruck'],
        finish: 'Zürich',
      },
      ...meta(now - 82 * hour),
    },
    'events/testdaten-1': { type: 'info', data: { text: 'Sim-Testdaten angelegt' }, source: 'sim', ...meta(now - 82 * hour) },
  };

  // Etappe 2 und 5: rund 3½ Tage Statuswechsel (vor wie vielen Stunden, Zustand)
  const timeline = [
    [80.0, 'fahren'],
    [77.5, 'pause'],
    [77.2, 'fahren'],
    [74.0, 'versorgung'],
    [73.6, 'fahren'],
    [70.5, 'restaurant'],
    [69.6, 'fahren'],
    [66.0, 'panne'],
    [65.5, 'fahren'],
    [62.0, 'versorgung'],
    [61.7, 'fahren'],
    [58.5, 'hotel'],
    [57.8, 'schlafen'],
    [52.8, 'wach'],
    [52.3, 'fahren'],
    [49.0, 'pause'],
    [48.75, 'fahren'],
    [46.0, 'faehre'],
    [44.4, 'fahren'],
    [41.5, 'restaurant'],
    [40.7, 'fahren'],
    [37.0, 'versorgung'],
    [36.7, 'fahren'],
    [33.5, 'pause'],
    [33.3, 'fahren'],
    [31.0, 'schlafen'],
    [27.8, 'wach'],
    [27.5, 'fahren'],
    [24.0, 'pause'],
    [23.6, 'fahren'],
    [20.8, 'versorgung'],
    [20.2, 'fahren'],
    [16.5, 'restaurant'],
    [15.8, 'fahren'],
    [12.0, 'hotel'],
    [11.2, 'schlafen'],
    [6.0, 'wach'],
    [5.4, 'fahren'],
    [2.6, 'versorgung'],
    [2.1, 'fahren'],
  ];
  // Standort bei jedem Wechsel: entlang der Testroute, rund 24 km/h beim Fahren
  // (Fähre: ein Stück weiter, als Lücke)
  const line = testRouteLine();
  let km = 0;
  timeline.forEach(([hoursAgo, state], i) => {
    const from = i ? timeline[i - 1][1] : null;
    if (i && (from === 'fahren' || from === 'faehre')) km += (timeline[i - 1][0] - hoursAgo) * (from === 'fahren' ? 24 : 15);
    const t = now - hoursAgo * hour;
    const [lat, lon] = pointAlong(line, km);
    const position = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, acc: 8, time: t, simulated: true };
    seed[`events/testdaten-status-${pad(i + 1)}`] = { type: 'status', data: { state, from }, position, source: 'sim', ...meta(t) };
  });

  // Befinden: Müdigkeit, Sitz, Knie, Mental, Motivation (0–10)
  const moods = [
    [79.5, 1, 0, 0, 9, 9],
    [71.0, 3, 1, 0, 8, 9],
    [63.0, 5, 2, 1, 7, 8],
    [59.0, 7, 3, 1, 6, 7],
    [52.5, 3, 3, 2, 7, 8],
    [45.0, 5, 4, 2, 6, 7],
    [38.0, 6, 5, 3, 5, 6],
    [32.0, 8, 5, 4, 4, 5],
    [27.6, 4, 5, 3, 6, 7],
    [20.0, 5, 6, 3, 6, 7],
    [13.0, 7, 5, 4, 5, 6],
    [5.5, 3, 4, 3, 7, 8],
    [1.5, 4, 5, 2, 6, 7],
  ];
  moods.forEach(([hoursAgo, muedigkeit, sitz, knie, mental, motivation], i) => {
    seed[`events/testdaten-befinden-${pad(i + 1)}`] = { type: 'befinden', data: { muedigkeit, sitz, knie, mental, motivation }, source: 'sim', ...meta(now - hoursAgo * hour) };
  });

  return seed;
}
