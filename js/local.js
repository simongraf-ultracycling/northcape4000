// Geräte-lokaler Speicher (localStorage) für Einstellungen DIESES Geräts:
// Darstellung, Sim-Schalter, simulierte Uhr, Fehlerprotokoll, Sim-Daten.
// Keine Renndaten! Die App greift darauf über store.settings zu (js/store.js);
// nur die Infrastruktur-Module clock.js und log.js nutzen diese Datei direkt,
// um Import-Zyklen zu vermeiden. js/boot.js liest die Schlüssel ebenfalls
// (Präfix "nc4000.") – beim Umbenennen dort nachziehen.

const PREFIX = 'nc4000.';
const listeners = new Map();

export function readLocal(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Gibt false zurück, wenn nicht gespeichert werden konnte (z.B. Speicher voll).
export function writeLocal(key, value) {
  let ok = true;
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    ok = false;
  }
  for (const cb of listeners.get(key) || []) {
    try {
      cb(value);
    } catch (err) {
      setTimeout(() => {
        throw err;
      });
    }
  }
  return ok;
}

export function onLocalChange(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key).delete(cb);
}
