// Mehr → Darstellung: Farbmodus, Design, Renn-Modus.

import { button, h, icon, sectionTitle, switchRow } from '../dom.js';
import {
  AUTO_MODE,
  MODES,
  THEMES,
  getColorMode,
  getEffectiveMode,
  getTheme,
  isRaceModeSwitchOn,
  onDisplayChange,
  schemeOf,
  setColorMode,
  setRaceMode,
  setTheme,
  systemForcesRaceMode,
} from '../display.js';
import { ICONS } from '../icons.js';

const modeName = (id) => MODES.find((m) => m.id === id)?.name || id;

// Farbmodus: Kacheln mit Farbkreis (3 × 2)
function modeGrid() {
  const tiles = [...MODES, AUTO_MODE].map((mode) => {
    const input = h('input', { type: 'radio', name: 'color-mode', value: mode.id });
    input.addEventListener('change', () => input.checked && setColorMode(mode.id));
    const dot =
      mode.id === AUTO_MODE.id
        ? h('span', { class: 'mode-dot mode-dot-auto', 'aria-hidden': 'true' })
        : h('span', { class: 'mode-dot', dataset: { mode: mode.id, scheme: mode.scheme }, 'aria-hidden': 'true' });
    return h('label', { class: 'mode-tile glass', dataset: { value: mode.id } }, input, dot, mode.name);
  });
  return h('div', { class: 'mode-grid', role: 'radiogroup', 'aria-label': 'Farbmodus' }, tiles);
}

// Mini-Vorschau eines Designs im aktuellen Farbmodus
function swatch(themeId) {
  const mode = getEffectiveMode();
  return h(
    'span',
    { class: 'swatch', dataset: { theme: themeId, mode, scheme: schemeOf(mode) }, 'aria-hidden': 'true' },
    h('span', { class: 'swatch-aa', text: 'Aa' }),
    icon(ICONS.status, 'swatch-icon'),
    h('span', { class: 'swatch-pill' }),
  );
}

function themeList() {
  const rows = THEMES.map((theme) => {
    const input = h('input', { type: 'radio', name: 'theme', value: theme.id, class: 'choice', checked: theme.id === getTheme() });
    input.addEventListener('change', () => input.checked && setTheme(theme.id));
    return h(
      'label',
      { class: 'row' },
      swatch(theme.id),
      h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: theme.name }), h('span', { class: 'row-sub', text: theme.description })),
      input,
    );
  });
  return h('div', { class: 'list glass', role: 'radiogroup', 'aria-label': 'Design' }, rows);
}

function preview() {
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card glass stack' },
      h('h2', { text: 'Tag 3 · 412 km' }),
      h('p', { class: 'muted', text: 'So wirken Titel, Texte, Knöpfe und Anzeigen im gewählten Design.' }),
      h(
        'div',
        { class: 'preview-row' },
        h('span', { class: 'pill is-ok' }, h('span', { class: 'dot' }), h('span', { class: 'label', text: 'Online' })),
        h('span', { class: 'pill is-offline' }, h('span', { class: 'dot' }), h('span', { class: 'label', text: 'Offline' })),
        h('span', { class: 'pill is-warn' }, h('span', { class: 'label', text: '⇅ 2' })),
      ),
      h('div', { class: 'btn-row' }, button('Speichern', { variant: 'primary' }), button('Abbrechen')),
    ),
    h(
      'div',
      { class: 'list glass' },
      h(
        'div',
        { class: 'row' },
        icon(ICONS.map, 'row-icon'),
        h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: 'Nächster Kontrollpunkt' }), h('span', { class: 'row-sub', text: 'Bozen · 86 km · ca. 4 h 10 min' })),
      ),
      h(
        'div',
        { class: 'row' },
        icon(ICONS.stats, 'row-icon'),
        h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: 'Heute' }), h('span', { class: 'row-sub', text: '231 km · 2840 Hm · 21,4 km/h' })),
      ),
    ),
  );
}

export const displaySettingsView = {
  title: 'Darstellung',
  render(container) {
    const raceMode = switchRow({
      label: 'Renn-Modus (Glas reduzieren)',
      sub: 'Deckende Flächen, klare Ränder, keine Schatten, maximaler Kontrast – besser im Sonnenlicht. Gilt für jedes Design.',
      checked: isRaceModeSwitchOn(),
      onChange: (on) => setRaceMode(on),
    });
    const autoHint = h('p', { class: 'footnote' });
    const forcedHint = h('p', {
      class: 'footnote',
      text: 'Der Renn-Modus ist durch die Systemeinstellung "Transparenz reduzieren" bzw. "Kontrast erhöhen" ohnehin aktiv.',
    });

    const page = h(
      'div',
      { class: 'stack' },
      sectionTitle('Farbmodus'),
      modeGrid(),
      autoHint,
      sectionTitle('Design'),
      themeList(),
      sectionTitle('Renn-Modus'),
      h('div', { class: 'list glass' }, raceMode.row),
      forcedHint,
      sectionTitle('Vorschau'),
      preview(),
    );
    container.append(page);

    // Auswahl, Vorschauen und Hinweise nach jeder Änderung nachführen
    const update = () => {
      const mode = getEffectiveMode();
      for (const el of page.querySelectorAll('.swatch')) {
        el.dataset.mode = mode;
        el.dataset.scheme = schemeOf(mode);
      }
      for (const input of page.querySelectorAll('input[name="theme"]')) input.checked = input.value === getTheme();
      for (const tile of page.querySelectorAll('.mode-tile')) {
        const selected = tile.dataset.value === getColorMode();
        tile.classList.toggle('is-selected', selected);
        tile.querySelector('input').checked = selected;
      }
      autoHint.hidden = getColorMode() !== AUTO_MODE.id;
      autoHint.textContent = `Folgt der Einstellung des iPhones: ${modeName(AUTO_MODE.light)} bei Hell, ${modeName(AUTO_MODE.dark)} bei Dunkel – gerade ${modeName(mode)}.`;
      forcedHint.hidden = !systemForcesRaceMode();
    };
    update();
    return onDisplayChange(update);
  },
};
