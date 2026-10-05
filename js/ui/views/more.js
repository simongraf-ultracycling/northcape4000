// "Mehr": Konto, Darstellung, Simulation, Debug.

import * as store from '../../store.js';
import { FIREBASE_SDK_VERSION, VERSION } from '../../version.js';
import { toast } from '../banners.js';
import { button, h, icon } from '../dom.js';
import { ICONS } from '../icons.js';

function accountCard() {
  if (store.getMode() === 'sim') {
    return h(
      'section',
      { class: 'card glass' },
      h('h2', { class: 'is-sim', text: 'Sim-Modus aktiv' }),
      h('p', { class: 'muted', text: 'Lokaler Simulator mit Testdaten – keine Anmeldung, nichts geht an Firebase. Beenden unter "Simulation".' }),
    );
  }

  const user = store.getUser();
  const signOut = async () => {
    const info = await store.getStorageInfo();
    const pending = Math.max(info.queuedWrites || 0, store.getStatus().pendingSession);
    const warning = pending
      ? `\n\nAchtung: ${pending} Einträge sind noch nicht synchronisiert. Sie werden erst nach erneutem Anmelden übertragen.`
      : '';
    if (!window.confirm(`Wirklich abmelden?${warning}`)) return;
    try {
      await store.signOut();
    } catch (err) {
      toast(store.describeError(err));
    }
  };

  return h(
    'section',
    { class: 'card glass stack' },
    h(
      'div',
      { class: 'row' },
      icon(ICONS.user, 'row-icon'),
      h(
        'span',
        { class: 'row-text' },
        h('span', { class: 'row-label', text: user?.email || 'Nicht angemeldet' }),
        h('span', {
          class: `row-sub ${user?.isOwner ? 'is-ok' : 'is-danger'}`,
          text: user?.isOwner ? 'Besitzer – darf schreiben' : 'Nicht der Besitzer – Schreiben wird abgelehnt',
        }),
      ),
    ),
    button('Abmelden', { variant: 'danger', block: true, iconSvg: ICONS.logout, onClick: signOut }),
  );
}

function linkRow(href, iconSvg, label, sub) {
  return h(
    'a',
    { class: 'row', href },
    icon(iconSvg, 'row-icon'),
    h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: label }), h('span', { class: 'row-sub', text: sub })),
    icon(ICONS.chevronRight, 'row-chevron'),
  );
}

export const moreView = {
  title: 'Mehr',
  render(container) {
    container.append(
      h(
        'div',
        { class: 'stack' },
        accountCard(),
        h(
          'nav',
          { class: 'list glass', 'aria-label': 'Einstellungen' },
          linkRow('#mehr/darstellung', ICONS.display, 'Darstellung', 'Renn-Modus (Glas reduzieren)'),
          linkRow('#mehr/simulation', ICONS.simulation, 'Simulation', 'Sim-Modus, simulierte Zeit, offline'),
          linkRow('#mehr/debug', ICONS.debug, 'Debug', 'Zustand, Tests, Fehlerprotokoll'),
        ),
        h('p', { class: 'footnote', text: `Version ${VERSION} · Firebase SDK ${FIREBASE_SDK_VERSION}` }),
      ),
    );
  },
};
