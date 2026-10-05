// Mehr → Darstellung

import { h, switchRow } from '../dom.js';
import { isRaceModeSwitchOn, setRaceMode, systemForcesRaceMode } from '../display.js';

export const displaySettingsView = {
  title: 'Darstellung',
  render(container) {
    const raceMode = switchRow({
      label: 'Renn-Modus (Glas reduzieren)',
      sub: 'Deckende, kontraststarke Flächen statt Glas – besser im Sonnenlicht, schont den Akku.',
      checked: isRaceModeSwitchOn(),
      onChange: (on) => setRaceMode(on),
    });

    container.append(
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'list glass' }, raceMode.row),
        systemForcesRaceMode() &&
          h('p', { class: 'footnote', text: 'Der Renn-Modus ist durch die Systemeinstellung "Transparenz reduzieren" bzw. "Kontrast erhöhen" ohnehin aktiv.' }),
        h(
          'section',
          { class: 'card glass' },
          h('h2', { text: 'Vorschau' }),
          h('p', { class: 'muted', text: 'So sehen Flächen und Texte im aktuellen Modus aus. Im Renn-Modus ist der Hintergrund schwarz und alle Flächen sind deckend.' }),
        ),
      ),
    );
  },
};
