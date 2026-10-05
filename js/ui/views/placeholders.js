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

export const statusView = placeholder('Status', ICONS.status, 2, 'Status-Automat (fahren, Pause, Hotel, schlafe, wach, losgefahren) und Befindens-Regler.');
export const mapView = placeholder('Karte', ICONS.map, 3, 'Route, Echtzeit-Standort, Versorgungspunkte und eigene POIs.');
export const planView = placeholder('Plan', ICONS.plan, 4, 'Kontrollpunkte mit Zeitfenstern, Etappen und Fähren-Rechner.');
export const statsView = placeholder('Statistik', ICONS.stats, 5, 'Tageswerte und Diagramme.');
