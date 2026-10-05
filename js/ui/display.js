// Darstellung: Design, Erscheinungsbild (Dunkel/Hell/Automatisch) und
// Renn-Modus (Glas reduzieren).
//
// Setzt auf <html> die Attribute data-theme, data-mode und data-glass; alle
// Werte dazu stehen in css/tokens.css. js/boot.js setzt dieselben Attribute
// schon vor dem ersten Bild (Liste der Designs dort ebenfalls nachführen).
//
// Renn-Modus: per Schalter ODER automatisch, wenn das System "Transparenz
// reduzieren" bzw. "Kontrast erhöhen" meldet (sofern unterstützt).

import * as store from '../store.js';

export const THEMES = [
  { id: 'polarnacht', name: 'Polarnacht', description: 'Nordlicht-Blau mit klarem Glas – das Original.' },
  { id: 'gletscher', name: 'Gletscher', description: 'Eisweiss und Petrol, stark mattiertes Glas.' },
  { id: 'wald', name: 'Wald', description: 'Tannengrün und Moos, lindgrüner Akzent.' },
  { id: 'sand', name: 'Sand', description: 'Wüstensand und Bernstein, warm und weich.' },
  { id: 'abendrot', name: 'Abendrot', description: 'Koralle, Pfirsich und Magenta wie ein Sonnenuntergang.' },
  { id: 'rose', name: 'Rosé', description: 'Rosa und Himbeere, besonders runde Formen.' },
  { id: 'lavendel', name: 'Lavendel', description: 'Flieder und Violett mit runder Schrift.' },
  { id: 'graphit', name: 'Graphit', description: 'Neutrales Grau, schwarz-weiss ohne Farbe.' },
  { id: 'carbon', name: 'Carbon', description: 'Tiefschwarz, ganz klares Glas, Signalorange.' },
  { id: 'mitternacht', name: 'Mitternacht', description: 'Tintenblau und Gold.' },
];

export const COLOR_MODES = [
  { id: 'dark', name: 'Dunkel' },
  { id: 'light', name: 'Hell' },
  { id: 'auto', name: 'Automatisch' },
];

const DEFAULT_THEME = 'polarnacht';
const DEFAULT_MODE = 'dark'; // Dunkles Design als Standard

const raceQueries = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)'].map((q) => matchMedia(q));
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

// --- Design --------------------------------------------------------------------

export function getTheme() {
  const id = store.settings.get('theme', DEFAULT_THEME);
  return THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
}

export function setTheme(id) {
  if (THEMES.some((t) => t.id === id)) store.settings.set('theme', id);
}

// --- Erscheinungsbild ----------------------------------------------------------

// Gewählte Einstellung: 'dark' | 'light' | 'auto'
export function getColorMode() {
  const mode = store.settings.get('colorMode', DEFAULT_MODE);
  return COLOR_MODES.some((m) => m.id === mode) ? mode : DEFAULT_MODE;
}

export function setColorMode(mode) {
  if (COLOR_MODES.some((m) => m.id === mode)) store.settings.set('colorMode', mode);
}

// Tatsächlich angezeigt: 'dark' | 'light'
export function getEffectiveMode() {
  const mode = getColorMode();
  if (mode === 'auto') return darkQuery.matches ? 'dark' : 'light';
  return mode;
}

// --- Renn-Modus -------------------------------------------------------------------

export function systemForcesRaceMode() {
  return raceQueries.some((q) => q.matches);
}

export function isRaceModeSwitchOn() {
  return store.settings.get('raceMode', false) === true;
}

export function setRaceMode(on) {
  store.settings.set('raceMode', !!on);
}

export function isRaceModeActive() {
  return isRaceModeSwitchOn() || systemForcesRaceMode();
}

// --- Anwenden ----------------------------------------------------------------------

export function onDisplayChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function apply() {
  const root = document.documentElement;
  root.setAttribute('data-theme', getTheme());
  root.setAttribute('data-mode', getEffectiveMode());
  root.setAttribute('data-glass', isRaceModeActive() ? 'off' : 'on');
  // Browser-/Systemfarbe = Grundfarbe des aktiven Designs (aus css/tokens.css)
  const base = getComputedStyle(root).getPropertyValue('--bg-base').trim();
  if (base) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base);
  for (const cb of listeners) cb();
}

export function initDisplay() {
  apply();
  for (const q of [...raceQueries, darkQuery]) q.addEventListener?.('change', apply);
  for (const key of ['theme', 'colorMode', 'raceMode']) store.settings.onChange(key, apply);
}
