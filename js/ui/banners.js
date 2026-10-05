// Banner (über der Tab-Leiste) und kurze Hinweise.

import { h, icon } from './dom.js';

const area = () => document.getElementById('banner-area');
const banners = new Map();

// showBanner('update', { title, sub, iconSvg, variant: 'accent'|'danger', onTap })
export function showBanner(id, { title, sub, iconSvg, variant = 'accent', onTap }) {
  hideBanner(id);
  const el = h(
    'button',
    { type: 'button', class: `banner glass banner-${variant}`, onClick: onTap },
    iconSvg && icon(iconSvg),
    h('span', { class: 'row-text' }, h('span', { class: 'banner-title', text: title }), sub && h('span', { class: 'banner-sub', text: sub })),
  );
  banners.set(id, el);
  area().prepend(el);
}

export function hideBanner(id) {
  banners.get(id)?.remove();
  banners.delete(id);
}

export function toast(text, ms = 2200) {
  const el = h('div', { class: 'toast glass', role: 'status', text });
  area().append(el);
  setTimeout(() => el.remove(), ms);
}
