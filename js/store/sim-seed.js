// Testdaten für den Sim-Modus. Pfade relativ zu races/{raceId}; '' ist das
// Renn-Dokument selbst. Spätere Etappen ergänzen hier passende Testdaten.
// Zeiten relativ zum Start der Simulation ("now"), damit "Heute" und der
// Verlauf immer etwas zeigen. Zurücksetzen: Mehr → Debug → Testdaten.

export function createSeed(now) {
  const hour = 3_600_000;
  const meta = (t) => ({ clientTime: t, tzOffset: -new Date(t).getTimezoneOffset(), appVersion: 'testdaten', serverTime: t });
  const pad = (n) => String(n).padStart(2, '0');

  const seed = {
    '': { name: 'Beispiel-Tour – Testdaten', ...meta(now - 30 * hour) },
    'config/race': {
      value: {
        name: 'Beispiel-Tour',
        start: 'Zürich',
        checkpoints: ['Chur', 'Bormio', 'Bozen', 'Innsbruck'],
        finish: 'Zürich',
      },
      ...meta(now - 30 * hour),
    },
    'events/testdaten-1': { type: 'info', data: { text: 'Sim-Testdaten angelegt' }, source: 'sim', ...meta(now - 30 * hour) },
  };

  // Etappe 2: rund 28 Stunden Statuswechsel (vor wie vielen Stunden, Zustand)
  const timeline = [
    [27.5, 'fahren'],
    [24.0, 'pause'],
    [23.6, 'fahren'],
    [20.8, 'versorgung'],
    [20.2, 'fahren'],
    [16.5, 'pause'],
    [16.2, 'fahren'],
    [12.0, 'hotel'],
    [11.2, 'schlafen'],
    [6.0, 'wach'],
    [5.4, 'fahren'],
    [2.6, 'versorgung'],
    [2.1, 'fahren'],
  ];
  timeline.forEach(([hoursAgo, state], i) => {
    const from = i ? timeline[i - 1][1] : null;
    seed[`events/testdaten-status-${pad(i + 1)}`] = { type: 'status', data: { state, from }, source: 'sim', ...meta(now - hoursAgo * hour) };
  });

  // Befinden: Müdigkeit, Sitzprobleme, Mental, Motivation (0–10)
  const moods = [
    [26.0, 2, 0, 8, 9],
    [13.0, 7, 5, 5, 6],
    [5.5, 3, 4, 7, 8],
    [1.5, 4, 5, 6, 7],
  ];
  moods.forEach(([hoursAgo, muedigkeit, sitz, mental, motivation], i) => {
    seed[`events/testdaten-befinden-${pad(i + 1)}`] = { type: 'befinden', data: { muedigkeit, sitz, mental, motivation }, source: 'sim', ...meta(now - hoursAgo * hour) };
  });

  return seed;
}
