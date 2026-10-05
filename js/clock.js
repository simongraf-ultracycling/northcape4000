// Einzige Zeitquelle der App.
// Die App fragt die aktuelle Zeit NUR über clock.now() ab – nie über Date.now()
// oder new Date() ohne Argument. (new Date(ms) zum Formatieren ist erlaubt.)
//
// clock.now()     App-Zeit; im Sim-Modus ggf. simuliert (inkl. Zeitraffer).
//                 Für alles Fachliche: clientTime, Anzeigen, Auswertungen.
// clock.realNow() Echte Gerätezeit. Nur für Technisches: Fehlerprotokoll,
//                 Messung von Latenzen, Timeouts.

import { readLocal, writeLocal } from './local.js';

const KEY = 'simClock';
const listeners = new Set();

// Gespeicherte Simulation: { simBase, realBase, factor }
let sim = readLocal(KEY, null);
// Simulierte Zeit gilt nur im Sim-Modus (wird beim Start von app.js gesetzt).
let simEnabled = false;

function realNow() {
  return Date.now();
}

function now() {
  if (!simEnabled || !sim) return realNow();
  return Math.round(sim.simBase + (realNow() - sim.realBase) * sim.factor);
}

function emit() {
  for (const cb of listeners) cb(getSimulation());
}

function setSimEnabled(enabled) {
  simEnabled = !!enabled;
  emit();
}

// Simulierte Zeit setzen: ab jetzt läuft die App-Zeit ab simTime mit factor.
function setSimulation(simTime, factor = 1) {
  if (!Number.isFinite(simTime) || !Number.isFinite(factor) || factor < 0) {
    throw new Error('Ungültige Simulationswerte');
  }
  sim = { simBase: simTime, realBase: realNow(), factor };
  writeLocal(KEY, sim);
  emit();
}

function resetSimulation() {
  sim = null;
  writeLocal(KEY, undefined);
  emit();
}

// null, wenn die App in Echtzeit läuft.
function getSimulation() {
  if (!simEnabled || !sim) return null;
  return { factor: sim.factor, now: now() };
}

function isSimulated() {
  return getSimulation() !== null;
}

function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const clock = { now, realNow, setSimEnabled, setSimulation, resetSimulation, getSimulation, isSimulated, onChange };
