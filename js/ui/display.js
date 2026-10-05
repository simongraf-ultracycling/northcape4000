// Darstellung: Design, Farbmodus und Renn-Modus (Glas reduzieren).
//
// Setzt auf <html> die Attribute data-theme (Design), data-mode (Farbmodus),
// data-scheme (hell/dunkel, folgt aus dem Farbmodus) und data-glass; alle
// Werte dazu stehen in css/tokens.css. js/boot.js setzt dieselben Attribute
// schon vor dem ersten Bild (Listen dort ebenfalls nachführen).
//
// Renn-Modus: per Schalter ODER automatisch, wenn das System "Transparenz
// reduzieren" bzw. "Kontrast erhöhen" meldet (sofern unterstützt).

import * as store from '../store.js';

// Designs: Schrift, Knopf-Stil, Symbole, Karten – ruhige Varianten derselben
// schlichten, runden Form (Farben kommen aus dem Farbmodus).
export const THEMES = [
  { id: 'klar', name: 'Klar', description: 'Wie iOS: SF Pro, gefüllte Knöpfe, schlichte Symbole.' },
  { id: 'rund', name: 'Rund', description: 'Runde Schrift, Symbole in Kreisen, getönte Knöpfe.' },
  { id: 'fein', name: 'Fein', description: 'Leichte Schrift, feine Linien, umrandete Flächen.' },
  { id: 'kraeftig', name: 'Kräftig', description: 'Fette Schrift, kräftige Symbole auf Farbplättchen.' },
  { id: 'klassik', name: 'Klassik', description: 'Serifen-Titel, schlanke Symbole, dunkle Knöpfe.' },
  { id: 'technik', name: 'Technik', description: 'Monospace-Schrift, eckige Linienenden, Akzent Grün.' },
  { id: 'avenir', name: 'Avenir', description: 'Avenir Next, Symbole in Ringen, getönte Knöpfe.' },
  { id: 'helvetica', name: 'Helvetica', description: 'Schwarz-weiss, eckige Linienenden, ohne Farbe.' },
  { id: 'glas', name: 'Glas', description: 'Durchscheinende Flächen mit Lichtkante und Schatten.' },
  { id: 'geometrisch', name: 'Geometrisch', description: 'Futura-Titel, Symbole in Farbkreisen.' },
];

// Farbmodi: neutrale Hintergründe und Flächen
export const MODES = [
  { id: 'weiss', name: 'Weiss', scheme: 'light' },
  { id: 'hellgrau', name: 'Hellgrau', scheme: 'light' },
  { id: 'dunkelgrau', name: 'Dunkelgrau', scheme: 'dark' },
  { id: 'dunkelblau', name: 'Dunkelblau', scheme: 'dark' },
  { id: 'schwarz', name: 'Schwarz', scheme: 'dark' },
];

// "Automatisch" folgt der iPhone-Einstellung Hell/Dunkel
export const AUTO_MODE = { id: 'auto', name: 'Automatisch', light: 'weiss', dark: 'dunkelblau' };

const DEFAULT_THEME = 'klar';
const DEFAULT_MODE = 'dunkelblau'; // Dunkles Design als Standard
const LEGACY_MODES = { dark: 'dunkelblau', light: 'weiss' }; // Einstellungen bis v0.4.0

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

// --- Farbmodus -------------------------------------------------------------------

// Gewählte Einstellung: Id aus MODES oder 'auto'
export function getColorMode() {
  const stored = store.settings.get('colorMode', DEFAULT_MODE);
  const mode = LEGACY_MODES[stored] || stored;
  return mode === AUTO_MODE.id || MODES.some((m) => m.id === mode) ? mode : DEFAULT_MODE;
}

export function setColorMode(mode) {
  if (mode === AUTO_MODE.id || MODES.some((m) => m.id === mode)) store.settings.set('colorMode', mode);
}

// Tatsächlich angezeigter Farbmodus (nie 'auto')
export function getEffectiveMode() {
  const mode = getColorMode();
  if (mode === AUTO_MODE.id) return darkQuery.matches ? AUTO_MODE.dark : AUTO_MODE.light;
  return mode;
}

export function schemeOf(modeId) {
  return MODES.find((m) => m.id === modeId)?.scheme || 'dark';
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
  const mode = getEffectiveMode();
  root.setAttribute('data-theme', getTheme());
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-scheme', schemeOf(mode));
  root.setAttribute('data-glass', isRaceModeActive() ? 'off' : 'on');
  // Browser-/Systemfarbe = Hintergrund des aktiven Farbmodus (aus css/tokens.css)
  const base = getComputedStyle(root).getPropertyValue('--bg-base').trim();
  if (base) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base);
  for (const cb of listeners) cb();
}

export function initDisplay() {
  apply();
  for (const q of [...raceQueries, darkQuery]) q.addEventListener?.('change', apply);
  for (const key of ['theme', 'colorMode', 'raceMode']) store.settings.onChange(key, apply);
}
