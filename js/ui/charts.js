// Kleine Diagramme für die Statistik – ohne Bibliothek, Farben nur aus
// css/tokens.css (--chart-*). Antippen bzw. Ziehen zeigt die Werte als Text
// (nie nur Farbe); jede Zahl steht zusätzlich in Legende oder Liste.

import { formatHours, formatLocalTime, formatNumber } from '../format.js';
import { GROUPS, STATES } from '../model/status.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const DAY = 86_400_000;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id;

// Legende der Gruppen; values: { group: ms } (optional, dann mit Dauer)
export function groupLegend(values) {
  return h(
    'div',
    { class: 'chart-legend' },
    GROUPS.filter((g) => !values || values[g.id] > 0).map((g) =>
      h('span', { class: 'chart-key', dataset: { group: g.id } }, h('span', { class: 'chart-swatch' }), h('span', { class: 'chart-key-label', text: g.label }), values ? h('span', { class: 'chart-key-value', text: formatHours(values[g.id]) }) : null),
    ),
  );
}

// Tagesband: 24 h der Ortszeit, Abschnitte farbig. Antippen zeigt den Abschnitt.
export function dayBand(day) {
  const track = h('div', { class: 'band-track', role: 'img', 'aria-label': 'Tagesablauf' });
  const caption = h('p', { class: 'band-caption', text: 'Antippen für Details' });
  const span = day.end - day.start;
  for (const seg of day.segments) {
    const el = h('span', { class: 'band-seg', dataset: { group: seg.group } });
    el.style.left = `${((seg.start - day.start) / span) * 100}%`;
    el.style.width = `${((seg.end - seg.start) / span) * 100}%`;
    track.append(el);
  }
  const ticks = h(
    'div',
    { class: 'band-ticks', 'aria-hidden': 'true' },
    [0, 6, 12, 18, 24].map((hr) => {
      const t = h('span', { text: String(hr).padStart(2, '0') });
      t.style.left = `${(hr / 24) * 100}%`;
      return t;
    }),
  );
  let marker = null;
  const pick = (clientX) => {
    const rect = track.getBoundingClientRect();
    const t = day.start + ((clientX - rect.left) / rect.width) * span;
    const seg = day.segments.find((s) => t >= s.start && t < s.end);
    marker?.remove();
    marker = null;
    track.querySelectorAll('.is-picked').forEach((el) => el.classList.remove('is-picked'));
    if (!seg) {
      caption.textContent = `${formatLocalTime(t, day.tz)} · keine Angabe`;
      return;
    }
    const idx = day.segments.indexOf(seg);
    track.children[idx]?.classList.add('is-picked');
    caption.textContent = `${STATES[seg.state].label} · ${formatLocalTime(seg.start, day.tz)}–${formatLocalTime(seg.end, day.tz)} · ${formatHours(seg.end - seg.start)}`;
  };
  track.addEventListener('pointerdown', (e) => {
    pick(e.clientX);
    track.setPointerCapture?.(e.pointerId);
  });
  track.addEventListener('pointermove', (e) => e.buttons && pick(e.clientX));
  return h('div', { class: 'band' }, track, ticks, caption);
}

// Gestapelter Balken eines Tages (Skala 24 h)
export function stackedBar(groups) {
  const bar = h('div', { class: 'stack-bar', 'aria-hidden': 'true' });
  for (const g of GROUPS) {
    const ms = groups[g.id];
    if (!(ms > 0)) continue;
    const el = h('span', { class: 'stack-seg', dataset: { group: g.id } });
    el.style.width = `${(ms / DAY) * 100}%`;
    bar.append(el);
  }
  return bar;
}

// Säulen mit Wert auf der Säule. items: [{ label, value, sub }]
export function columns(items, { unit = '', digits = 0, onPick } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value || 0));
  const labelAll = items.length <= 10;
  const best = items.reduce((b, i) => (!b || (i.value || 0) > (b.value || 0) ? i : b), null);
  return h(
    'div',
    { class: 'cols', role: 'list' },
    items.map((item) => {
      const fill = h('span', { class: 'col-fill' });
      fill.style.height = `${((item.value || 0) / max) * 100}%`;
      const showValue = labelAll || item === best;
      const el = h(
        'button',
        { type: 'button', class: 'col', role: 'listitem', 'aria-label': `${item.label}: ${formatNumber(item.value || 0, digits)} ${unit}` },
        h('span', { class: 'col-value', text: showValue && item.value ? formatNumber(item.value, digits) : '' }),
        h('span', { class: 'col-track' }, fill),
        h('span', { class: 'col-label', text: item.label }),
      );
      if (onPick) el.addEventListener('click', () => onPick(item));
      return el;
    }),
  );
}

// Linie 0–10 über die Zeit (eine Reihe, kein Legendenkasten – der Titel nennt
// sie). Ziehen zeigt Zeitpunkt und Wert. points: [{ t, v, tz }]
export function lineChart(points, { from, to, min = 0, max = 10, height = 96, dayTicks = [] } = {}) {
  const svg = svgEl('svg', { class: 'line-svg', height, role: 'img' });
  const readout = h('p', { class: 'line-readout' });
  const el = h('div', { class: 'line-chart' }, svg, readout);
  const PAD = { top: 8, right: 10, bottom: 18, left: 22 };
  let geo = null;

  const draw = () => {
    while (svg.firstChild) svg.firstChild.remove();
    const width = Math.max(220, el.clientWidth || 320);
    svg.setAttribute('width', width);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const w = width - PAD.left - PAD.right;
    const hh = height - PAD.top - PAD.bottom;
    const span = Math.max(1, to - from);
    const x = (t) => PAD.left + ((t - from) / span) * w;
    const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * hh;
    for (const v of [min, (min + max) / 2, max]) {
      svg.append(svgEl('line', { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), class: 'chart-grid' }));
      const t = svgEl('text', { x: PAD.left - 5, y: y(v) + 3.5, class: 'chart-axis', 'text-anchor': 'end' });
      t.textContent = String(v);
      svg.append(t);
    }
    // Tagesgrenzen (dünn) mit Beschriftung, höchstens jede zweite bei vielen Tagen
    const every = dayTicks.length > 8 ? Math.ceil(dayTicks.length / 6) : 1;
    dayTicks.forEach((d, i) => {
      if (d.t < from || d.t > to) return;
      svg.append(svgEl('line', { x1: x(d.t), x2: x(d.t), y1: PAD.top, y2: height - PAD.bottom, class: 'chart-grid' }));
      if (i % every) return;
      const t = svgEl('text', { x: x(d.t) + 3, y: height - 5, class: 'chart-axis' });
      t.textContent = d.label;
      svg.append(t);
    });
    if (!points.length) return;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    svg.append(svgEl('path', { d: path, class: 'chart-line' }));
    const last = points[points.length - 1];
    svg.append(svgEl('circle', { cx: x(last.t), cy: y(last.v), r: 4, class: 'chart-dot' }));
    geo = { x, y, width };
  };

  const pick = (clientX) => {
    if (!geo || !points.length) return;
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = points[0];
    for (const p of points) if (Math.abs(geo.x(p.t) - px) < Math.abs(geo.x(best.t) - px)) best = p;
    svg.querySelector('.chart-cursor')?.remove();
    svg.querySelector('.chart-dot-pick')?.remove();
    svg.append(svgEl('line', { x1: geo.x(best.t), x2: geo.x(best.t), y1: PAD.top, y2: height - PAD.bottom, class: 'chart-cursor' }));
    svg.append(svgEl('circle', { cx: geo.x(best.t), cy: geo.y(best.v), r: 5, class: 'chart-dot chart-dot-pick' }));
    readout.textContent = `${best.v} · ${best.label || formatLocalTime(best.t, best.tz)}`;
  };
  svg.addEventListener('pointerdown', (e) => {
    pick(e.clientX);
    svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => e.buttons && pick(e.clientX));
  return { el, draw };
}

export { groupLabel };
