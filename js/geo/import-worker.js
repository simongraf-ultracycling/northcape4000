// Web-Worker für den GPX-Import: Lesen, Vereinfachen und Kodieren laufen
// ausserhalb der Oberfläche (grosse Dateien blockieren die App nicht).

import { gpxToStages } from './gpx.js';

self.onmessage = (event) => {
  const { id, text, fileName } = event.data;
  try {
    self.postMessage({ id, ok: true, result: gpxToStages(text, fileName) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};
