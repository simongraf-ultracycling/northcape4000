// Höhenprofil als SVG (ohne Bibliothek). Antippen/Ziehen zeigt km und Höhe
// und meldet den km (z.B. um den Punkt auf der Karte zu markieren).

import { formatNumber } from '../../format.js';
import { h } from '../dom.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 120;
const PAD = { top: 10, right: 8, bottom: 18, left: 34 };

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function createProfile({ onSelect } = {}) {
  const svg = svgEl('svg', { class: 'profile-svg', height: HEIGHT, role: 'img', 'aria-label': 'Höhenprofil' });
  const info = h('div', { class: 'profile-info', text: '' });
  const el = h('div', { class: 'profile' }, svg, info);
  let state = null;

  const render = (route, { fromKm = 0, toKm = route?.totalKm || 0, posKm = null, marks = [] } = {}) => {
    while (svg.firstChild) svg.firstChild.remove();
    if (!route || !route.hasEle || toKm - fromKm < 0.1) {
      info.textContent = route && !route.hasEle ? 'Keine Höhendaten in der Route' : '';
      state = null;
      return;
    }
    const width = Math.max(200, el.clientWidth || 340);
    svg.setAttribute('width', width);
    svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
    const samples = Math.min(500, Math.round(width));
    const pts = route.profile(fromKm, toKm, samples).filter((p) => Number.isFinite(p.ele));
    if (pts.length < 2) return;
    let min = Math.min(...pts.map((p) => p.ele));
    let max = Math.max(...pts.map((p) => p.ele));
    if (max - min < 50) {
      const mid = (max + min) / 2;
      min = mid - 25;
      max = mid + 25;
    }
    const w = width - PAD.left - PAD.right;
    const hgt = HEIGHT - PAD.top - PAD.bottom;
    const x = (km) => PAD.left + ((km - fromKm) / (toKm - fromKm)) * w;
    const y = (e) => PAD.top + (1 - (e - min) / (max - min)) * hgt;

    // Gitter und Beschriftung
    for (const e of [min, (min + max) / 2, max]) {
      svg.append(svgEl('line', { x1: PAD.left, x2: width - PAD.right, y1: y(e), y2: y(e), class: 'profile-grid' }));
      const t = svgEl('text', { x: PAD.left - 4, y: y(e) + 4, class: 'profile-label', 'text-anchor': 'end' });
      t.textContent = `${Math.round(e)}`;
      svg.append(t);
    }
    for (const km of [fromKm, (fromKm + toKm) / 2, toKm]) {
      const t = svgEl('text', { x: x(km), y: HEIGHT - 4, class: 'profile-label', 'text-anchor': km === fromKm ? 'start' : km === toKm ? 'end' : 'middle' });
      t.textContent = `${formatNumber(km, 0)} km`;
      svg.append(t);
    }

    // Fläche und Linie
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.ele).toFixed(1)}`).join('');
    svg.append(svgEl('path', { d: `${line}L${x(pts[pts.length - 1].km).toFixed(1)},${PAD.top + hgt}L${x(pts[0].km).toFixed(1)},${PAD.top + hgt}Z`, class: 'profile-area' }));
    svg.append(svgEl('path', { d: line, class: 'profile-line' }));

    // Markierungen (Etappen-/Tagesenden, Gates)
    for (const m of marks) {
      if (m.km < fromKm || m.km > toKm) continue;
      svg.append(svgEl('line', { x1: x(m.km), x2: x(m.km), y1: PAD.top, y2: PAD.top + hgt, class: `profile-mark profile-mark-${m.kind || 'stage'}` }));
    }
    // Eigene Position
    if (Number.isFinite(posKm) && posKm >= fromKm && posKm <= toKm) {
      const e = route.pointAtKm(posKm).ele;
      svg.append(svgEl('line', { x1: x(posKm), x2: x(posKm), y1: PAD.top, y2: PAD.top + hgt, class: 'profile-pos-line' }));
      if (Number.isFinite(e)) svg.append(svgEl('circle', { cx: x(posKm), cy: y(e), r: 5, class: 'profile-pos' }));
    }
    const cursor = svgEl('line', { x1: -10, x2: -10, y1: PAD.top, y2: PAD.top + hgt, class: 'profile-cursor' });
    svg.append(cursor);
    state = { route, fromKm, toKm, x, w, cursor };
    info.textContent = `${formatNumber(fromKm, 0)}–${formatNumber(toKm, 0)} km · +${formatNumber(route.ascentBetween(fromKm, toKm), 0)} / −${formatNumber(route.descentBetween(fromKm, toKm), 0)} Hm`;
  };

  const select = (event) => {
    if (!state) return;
    const rect = svg.getBoundingClientRect();
    const px = Math.min(Math.max(event.clientX - rect.left, PAD.left), PAD.left + state.w);
    const km = state.fromKm + ((px - PAD.left) / state.w) * (state.toKm - state.fromKm);
    const p = state.route.pointAtKm(km);
    state.cursor.setAttribute('x1', px);
    state.cursor.setAttribute('x2', px);
    info.textContent = `km ${formatNumber(km, 1)} · ${Number.isFinite(p.ele) ? `${Math.round(p.ele)} m ü. M.` : 'Höhe unbekannt'}`;
    onSelect?.(km, p);
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture?.(e.pointerId);
    select(e);
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'touch') select(e);
  });

  return { el, render };
}
