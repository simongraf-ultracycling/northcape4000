// Mehr → Darstellung: Farbmodus, Renn-Modus, Hinweis für alte Installationen.

import { VERSION } from '../../version.js';
import { button, h, icon, sectionTitle, switchRow } from '../dom.js';
import {
  AUTO_MODE,
  MODES,
  getColorMode,
  getEffectiveMode,
  hideReinstallHint,
  isRaceModeSwitchOn,
  needsReinstall,
  onDisplayChange,
  setColorMode,
  setRaceMode,
  systemForcesRaceMode,
} from '../display.js';
import { ICONS } from '../icons.js';

const modeName = (id) => MODES.find((m) => m.id === id)?.name || id;

// Farbmodus: Kacheln mit Farbkreis (3 × 2). Die Farbkreise tragen selbst
// data-mode und zeigen so Hintergrund und Kartenfarbe des Modus.
function modeGrid() {
  const tiles = [...MODES, AUTO_MODE].map((mode) => {
    const input = h('input', { type: 'radio', name: 'color-mode', value: mode.id });
    input.addEventListener('change', () => input.checked && setColorMode(mode.id));
    const dot =
      mode.id === AUTO_MODE.id
        ? h(
            'span',
            { class: 'mode-dot mode-dot-auto', 'aria-hidden': 'true' },
            h('span', { class: 'mode-half', dataset: { mode: AUTO_MODE.light } }),
            h('span', { class: 'mode-half', dataset: { mode: AUTO_MODE.dark } }),
          )
        : h('span', { class: 'mode-dot', dataset: { mode: mode.id }, 'aria-hidden': 'true' });
    return h('label', { class: 'mode-tile glass', dataset: { value: mode.id } }, input, dot, mode.name);
  });
  return h('div', { class: 'mode-grid', role: 'radiogroup', 'aria-label': 'Farbmodus' }, tiles);
}

// Alte Installation (Statusleiste "black-translucent"): Anleitung zum Neu-Hinzufügen
function reinstallCard(onHide) {
  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'Oberer Rand unscharf?' }),
    h('p', {
      class: 'muted',
      text: 'Ab iOS 26 legt das iPhone eine Unschärfe über den oberen Rand, solange die App unter der Statusleiste durchläuft. Die App ist jetzt anders eingestellt – iOS übernimmt das aber nur beim Hinzufügen zum Home-Bildschirm. Einmal neu hinzufügen:',
    }),
    h(
      'ol',
      { class: 'steps' },
      h('li', { text: 'Oben in der Pille darf kein ⇅ stehen (alles synchronisiert).' }),
      h('li', { text: 'App-Symbol auf dem Home-Bildschirm lange drücken → "App entfernen" → "Vom Home-Bildschirm löschen".' }),
      h('li', { text: `In Safari simongraf-ultracycling.github.io/northcape4000 öffnen. Erscheint "Neue Version", antippen; unten auf der Anmeldeseite muss "Version ${VERSION}" (oder neuer) stehen.` }),
      h('li', { text: 'Teilen → "Zum Home-Bildschirm", dann die App von dort starten und neu anmelden.' }),
    ),
    button('Hinweis ausblenden', { block: true, onClick: onHide }),
  );
}

function preview() {
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card glass stack' },
      h('h2', { text: 'Tag 3 · 412 km' }),
      h('p', { class: 'muted', text: 'So wirken Titel, Texte, Knöpfe und Anzeigen im gewählten Farbmodus.' }),
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
      sub: 'Klare Ränder, keine Schatten, maximaler Kontrast – besser im Sonnenlicht. Gilt für jeden Farbmodus.',
      checked: isRaceModeSwitchOn(),
      onChange: (on) => setRaceMode(on),
    });
    const autoHint = h('p', { class: 'footnote' });
    const forcedHint = h('p', {
      class: 'footnote',
      text: 'Der Renn-Modus ist durch die Systemeinstellung "Transparenz reduzieren" bzw. "Kontrast erhöhen" ohnehin aktiv.',
    });
    const reinstall = needsReinstall()
      ? reinstallCard(() => {
          hideReinstallHint();
          reinstall.remove();
        })
      : null;

    const page = h(
      'div',
      { class: 'stack' },
      reinstall,
      sectionTitle('Farbmodus'),
      modeGrid(),
      autoHint,
      sectionTitle('Renn-Modus'),
      h('div', { class: 'list glass' }, raceMode.row),
      forcedHint,
      sectionTitle('Vorschau'),
      preview(),
    );
    container.append(page);

    // Auswahl und Hinweise nach jeder Änderung nachführen
    const update = () => {
      for (const tile of page.querySelectorAll('.mode-tile')) {
        const selected = tile.dataset.value === getColorMode();
        tile.classList.toggle('is-selected', selected);
        tile.querySelector('input').checked = selected;
      }
      autoHint.hidden = getColorMode() !== AUTO_MODE.id;
      autoHint.textContent = `Folgt der Einstellung des iPhones: ${modeName(AUTO_MODE.light)} bei Hell, ${modeName(AUTO_MODE.dark)} bei Dunkel – gerade ${modeName(getEffectiveMode())}.`;
      forcedHint.hidden = !systemForcesRaceMode();
    };
    update();
    return onDisplayChange(update);
  },
};
