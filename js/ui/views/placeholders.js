// Platzhalter für die Tabs, die in späteren Etappen gebaut werden.

import { h, icon } from '../dom.js';
import { ICONS } from '../icons.js';

function placeholder(title, iconSvg, stage, text) {
  return {
    title,
    render(container) {
      container.append(
        h(
          'div',
          { class: 'stack' },
          h('section', { class: 'card glass placeholder' }, icon(iconSvg), h('h2', { text: title }), h('p', { class: 'muted', text: `Folgt in Etappe ${stage}: ${text}` })),
        ),
      );
    },
  };
}

export const statsView = placeholder('Statistik', ICONS.stats, 5, 'Tageswerte und Diagramme.');
