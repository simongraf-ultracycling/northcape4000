// Mehr → Darstellung: Design, Erscheinungsbild (Dunkel/Hell/Automatisch), Renn-Modus.

import { button, h, icon, sectionTitle, switchRow } from '../dom.js';
import {
  COLOR_MODES,
  THEMES,
  getColorMode,
  getEffectiveMode,
  getTheme,
  isRaceModeSwitchOn,
  onDisplayChange,
  setColorMode,
  setRaceMode,
  setTheme,
  systemForcesRaceMode,
} from '../display.js';
import { ICONS } from '../icons.js';

const MODE_ICONS = { dark: ICONS.moon, light: ICONS.sun, auto: ICONS.auto };

function swatch(themeId) {
  return h(
    'span',
    { class: 'swatch', dataset: { theme: themeId, mode: getEffectiveMode() }, 'aria-hidden': 'true' },
    h('span', { class: 'swatch-aa', text: 'Aa' }),
    h('span', { class: 'swatch-dot' }),
    h('span', { class: 'swatch-card' }),
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

function modeSwitch() {
  const segments = COLOR_MODES.map((mode) => {
    const input = h('input', { type: 'radio', name: 'color-mode', value: mode.id, checked: mode.id === getColorMode() });
    input.addEventListener('change', () => input.checked && setColorMode(mode.id));
    return h('label', { class: 'segment', dataset: { mode: mode.id } }, input, icon(MODE_ICONS[mode.id]), mode.name);
  });
  return h('div', { class: 'segmented glass', role: 'radiogroup', 'aria-label': 'Erscheinungsbild' }, segments);
}

function preview() {
  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'Rovereto → Nordkapp' }),
    h('p', { class: 'muted', text: 'So wirken Titel, Texte, Knöpfe und Anzeigen im gewählten Design.' }),
    h(
      'div',
      { class: 'preview-row' },
      h('span', { class: 'pill is-ok' }, h('span', { class: 'dot' }), h('span', { class: 'label', text: 'Online' })),
      h('span', { class: 'pill is-offline' }, h('span', { class: 'dot' }), h('span', { class: 'label', text: 'Offline' })),
      h('span', { class: 'pill is-warn' }, h('span', { class: 'label', text: '⇅ 2' })),
    ),
    h('div', { class: 'btn-row' }, button('Speichern', { variant: 'primary' }), button('Abbrechen')),
  );
}

export const displaySettingsView = {
  title: 'Darstellung',
  render(container) {
    const raceMode = switchRow({
      label: 'Renn-Modus (Glas reduzieren)',
      sub: 'Deckende, kontraststarke Flächen statt Glas – besser im Sonnenlicht, schont den Akku. Gilt für jedes Design.',
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
      sectionTitle('Design'),
      themeList(),
      sectionTitle('Erscheinungsbild'),
      modeSwitch(),
      autoHint,
      sectionTitle('Renn-Modus'),
      h('div', { class: 'list glass' }, raceMode.row),
      forcedHint,
      sectionTitle('Vorschau'),
      preview(),
    );
    container.append(page);

    // Auswahl, Vorschau-Farben und Hinweise nach jeder Änderung nachführen
    const update = () => {
      const mode = getEffectiveMode();
      for (const el of page.querySelectorAll('.swatch')) el.dataset.mode = mode;
      for (const input of page.querySelectorAll('input[name="theme"]')) input.checked = input.value === getTheme();
      for (const seg of page.querySelectorAll('.segment')) {
        const selected = seg.dataset.mode === getColorMode();
        seg.classList.toggle('is-selected', selected);
        seg.querySelector('input').checked = selected;
      }
      autoHint.hidden = getColorMode() !== 'auto';
      autoHint.textContent = `Folgt der Einstellung des iPhones – gerade ${mode === 'dark' ? 'Dunkel' : 'Hell'}.`;
      forcedHint.hidden = !systemForcesRaceMode();
    };
    update();
    return onDisplayChange(update);
  },
};
