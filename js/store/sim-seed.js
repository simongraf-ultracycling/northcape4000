// Testdaten für den Sim-Modus. Pfade relativ zu races/{raceId}; '' ist das
// Renn-Dokument selbst. Spätere Etappen ergänzen hier passende Testdaten.

export function createSeed(now) {
  const hour = 3_600_000;
  const meta = (t) => ({ clientTime: t, tzOffset: -new Date(t).getTimezoneOffset(), appVersion: 'testdaten', serverTime: t });

  return {
    '': { name: 'Beispiel-Tour – Testdaten', ...meta(now - 3 * hour) },
    'config/race': {
      value: {
        name: 'Beispiel-Tour',
        start: 'Zürich',
        checkpoints: ['Chur', 'Bormio', 'Bozen', 'Innsbruck'],
        finish: 'Zürich',
      },
      ...meta(now - 3 * hour),
    },
    'events/testdaten-1': { type: 'info', data: { text: 'Sim-Testdaten angelegt' }, source: 'sim', ...meta(now - 2 * hour) },
  };
}
