// Bottom-Sheet: schwebende Karte über allem, konzentrisch zu den Bildschirm-
// ecken (wie die Tab-Leiste). Schliessen per Knopf, Tippen daneben oder Esc.
// Der Router schliesst offene Sheets beim Wechsel der Ansicht.

import { h, icon } from './dom.js';
import { ICONS } from './icons.js';

let current = null;

function onKey(event) {
  if (event.key === 'Escape') closeSheet();
}

// openSheet({ title, content: Node|Node[], onClose }) → { close, body }
export function openSheet({ title, content, onClose }) {
  closeSheet();
  const body = h('div', { class: 'sheet-body' }, content);
  const panel = h(
    'section',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', text: title }),
      h('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Schliessen', onClick: () => closeSheet() }, h('span', { class: 'chip chip-round glass' }, icon(ICONS.close))),
    ),
    body,
  );
  const root = h('div', { class: 'sheet-root' }, h('div', { class: 'sheet-backdrop', onClick: () => closeSheet() }), panel);
  document.body.append(root);
  document.body.classList.add('sheet-open');
  document.addEventListener('keydown', onKey);
  current = { root, onClose };
  return { close: closeSheet, body };
}

export function closeSheet() {
  if (!current) return;
  const { root, onClose } = current;
  current = null;
  root.remove();
  document.body.classList.remove('sheet-open');
  document.removeEventListener('keydown', onKey);
  onClose?.();
}

export function isSheetOpen() {
  return !!current;
}
