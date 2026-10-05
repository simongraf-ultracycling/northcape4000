// Darstellung: Farbmodus und Renn-Modus (Glas reduzieren).
//
// Setzt auf <html> die Attribute data-mode (Farbmodus), data-scheme
// (hell/dunkel, folgt aus dem Farbmodus) und data-glass; alle Werte dazu
// stehen in css/tokens.css. js/boot.js setzt dieselben Attribute schon vor
// dem ersten Bild (Liste dort ebenfalls nachführen).
//
// Statusleiste: index.html verlangt eine deckende iOS-Statusleiste
// (apple-mobile-web-app-status-bar-style "default"); ihre Farbe ist
// theme-color = Hintergrund des Farbmodus, die Symbolfarbe wählt iOS selbst.
//
// Renn-Modus: per Schalter ODER automatisch, wenn das System "Transparenz
// reduzieren" bzw. "Kontrast erhöhen" meldet (sofern unterstützt).

import * as store from '../store.js';

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

const DEFAULT_MODE = 'dunkelblau'; // Dunkles Design als Standard
const LEGACY_MODES = { dark: 'dunkelblau', light: 'weiss' }; // Einstellungen bis v0.4.0

const raceQueries = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)'].map((q) => matchMedia(q));
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

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

// --- Statusleiste: alte Installation erkennen -----------------------------------
//
// Bis v0.5.0 lief die App unter der Statusleiste durch ("black-translucent").
// Ab iOS 26 legt iOS dann eine Unschärfe über den oberen Rand. iOS übernimmt
// die neue Einstellung nur beim Hinzufügen zum Home-Bildschirm: Zeichnet die
// installierte App hochkant noch unter die Statusleiste (oberer
// Sicherheitsabstand > 0), muss sie einmal neu hinzugefügt werden.

export function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function needsReinstall() {
  if (!isStandalone() || window.innerWidth > window.innerHeight) return false;
  if (store.settings.get('reinstallHintHidden', false) === true) return false;
  const probe = document.createElement('div');
  probe.className = 'safe-probe';
  document.body.append(probe);
  const top = probe.getBoundingClientRect().height;
  probe.remove();
  return top > 0;
}

export function hideReinstallHint() {
  store.settings.set('reinstallHintHidden', true);
}

// --- Anwenden ----------------------------------------------------------------------

export function onDisplayChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function apply() {
  const root = document.documentElement;
  const mode = getEffectiveMode();
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-scheme', schemeOf(mode));
  root.setAttribute('data-glass', isRaceModeActive() ? 'off' : 'on');
  // Statusleiste und Browser-Farbe = Hintergrund des Farbmodus (aus css/tokens.css)
  const base = getComputedStyle(root).getPropertyValue('--bg-base').trim();
  if (base) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', base);
  for (const cb of listeners) cb();
}

export function initDisplay() {
  apply();
  for (const q of [...raceQueries, darkQuery]) q.addEventListener?.('change', apply);
  for (const key of ['colorMode', 'raceMode']) store.settings.onChange(key, apply);
}
