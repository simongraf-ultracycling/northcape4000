// Darstellung: Renn-Modus (Glas reduzieren).
// Aktiv per Schalter (Mehr → Darstellung) ODER automatisch, wenn das System
// "Transparenz reduzieren" bzw. "Kontrast erhöhen" meldet (sofern unterstützt).

import * as store from '../store.js';

const queries = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)'].map((q) => matchMedia(q));
const THEME_COLORS = { glass: '#060a16', off: '#000000' };

export function systemForcesRaceMode() {
  return queries.some((q) => q.matches);
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

function apply() {
  const off = isRaceModeActive();
  document.documentElement.setAttribute('data-glass', off ? 'off' : 'on');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', off ? THEME_COLORS.off : THEME_COLORS.glass);
}

export function initDisplay() {
  apply();
  for (const q of queries) q.addEventListener?.('change', apply);
  store.settings.onChange('raceMode', apply);
}
