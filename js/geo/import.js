// GPX-Dateien einlesen – im Worker (js/geo/import-worker.js), sonst direkt.

import { gpxToStages } from './gpx.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker === false) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const { id, ok, result, error } = event.data;
        const p = pending.get(id);
        pending.delete(id);
        if (p) ok ? p.resolve(result) : p.reject(new Error(error));
      };
      worker.onerror = () => {
        for (const p of pending.values()) p.reject(new Error('Import-Worker fehlgeschlagen'));
        pending.clear();
        worker = false;
      };
    } catch {
      worker = false;
      return null;
    }
  }
  return worker;
}

// Datei → { name, stages, waypoints } (siehe gpxToStages)
export async function readGpxFile(file) {
  const text = await file.text();
  const w = getWorker();
  if (!w) return gpxToStages(text, file.name);
  try {
    return await new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, text, fileName: file.name });
    });
  } catch (err) {
    if (worker === false) return gpxToStages(text, file.name); // Worker nicht nutzbar
    throw err;
  }
}
