// Anzeige von Versorgungspunkten – gemeinsam für Karte und Plan.

import { formatDay, formatElapsed, formatNumber, formatTime } from '../../format.js';
import { openState, parseOpeningHours } from '../../model/opening-hours.js';
import { POI_CATEGORIES } from '../../model/pois.js';
import { button, h, icon } from '../dom.js';
import { ICONS } from '../icons.js';

export const CATEGORY = Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c]));

export function catIcon(catId, className) {
  if (catId === 'eigen') return icon(ICONS.star, className);
  return icon(ICONS[CATEGORY[catId]?.icon] || ICONS.flag, className);
}

export function poiTitle(poi) {
  return poi.name || poi.sub || CATEGORY[poi.cat]?.label || 'Punkt';
}

export function kmLabel(km, digits = 1) {
  return `km ${formatNumber(km, digits)}`;
}

export function offLabel(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 60) return 'direkt an der Route';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m neben der Route`;
  return `${formatNumber(meters / 1000, 1)} km neben der Route`;
}

// "14:32" heute, sonst mit Tag
export function dayTime(ms, now) {
  const day = formatDay(ms, now);
  return day === 'heute' ? formatTime(ms) : `${day} ${formatTime(ms)}`;
}

// Öffnungszeiten zum Zeitpunkt ms: { open: true|false|null, always, text }
export function hoursAt(poi, ms) {
  if (!poi.hours) {
    if (poi.cat === 'wasser') return { open: null, always: false, text: 'ohne Öffnungszeiten (meist frei zugänglich)' };
    return { open: null, always: false, text: 'Öffnungszeiten unbekannt' };
  }
  const s = openState(parseOpeningHours(poi.hours), ms);
  return { open: s.known ? s.open : null, always: s.always, text: s.known ? s.label : `Öffnungszeiten: ${s.label}` };
}

export function googleMapsUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}&travelmode=bicycling`;
}

// Knopf "In Google Maps" (öffnet die Google-Maps-App bzw. Safari)
export function mapsButton(lat, lon, label = 'Google Maps') {
  return h('a', { class: 'btn btn-primary btn-block', href: googleMapsUrl(lat, lon), target: '_blank', rel: 'noopener' }, icon(ICONS.navigate), label);
}

// Inhalt der Detailansicht eines Punktes.
// ctx: { now, posKm, etaFromNow(km), plannedEta(km), stayAction: { label, onClick }, onShowOnMap }
export function poiDetails(poi, ctx = {}) {
  const now = ctx.now;
  const rows = [];
  const kv = (key, value, cls = '') => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: key }), h('span', { class: `kv-value ${cls}`, text: value }));

  if (poi.mine) {
    if (poi.note) rows.push(kv('Notiz', poi.note));
  } else rows.push(kv('Art', [CATEGORY[poi.cat]?.label, poi.sub && poi.sub !== CATEGORY[poi.cat]?.label ? poi.sub : ''].filter(Boolean).join(' · ')));
  rows.push(kv('Lage', Number.isFinite(poi.km) ? `${kmLabel(poi.km)} · ${offLabel(poi.off)}` : 'weit weg von der Route'));
  if (Number.isFinite(ctx.posKm) && Number.isFinite(poi.km)) {
    const ahead = poi.km - ctx.posKm;
    const eta = ctx.etaFromNow?.(poi.km);
    rows.push(kv(ahead >= 0 ? 'Vor dir' : 'Hinter dir', `${formatNumber(Math.abs(ahead), 1)} km${ahead >= 0 && eta ? ` · ca. ${formatElapsed(eta - now)}` : ''}`));
  }
  const nowHours = hoursAt(poi, now);
  // Unterkünfte und eigene Punkte ohne Angaben: keine (nutzlose) Zeile "unbekannt"
  if (poi.hours || (poi.cat !== 'unterkunft' && !poi.mine)) rows.push(kv('Jetzt', nowHours.text, nowHours.open === true ? 'is-ok' : nowHours.open === false ? 'is-danger' : ''));
  const ahead = Number.isFinite(ctx.posKm) ? poi.km >= ctx.posKm : true;
  const eta = ahead ? (Number.isFinite(ctx.posKm) ? ctx.etaFromNow?.(poi.km) : ctx.plannedEta?.(poi.km)) : null;
  if (eta && poi.hours) {
    const at = hoursAt(poi, eta);
    rows.push(kv('Bei Ankunft', `${dayTime(eta, now)} · ${at.text}`, at.open === true ? 'is-ok' : at.open === false ? 'is-danger' : ''));
  }
  if (poi.hours && !nowHours.always) rows.push(kv('Öffnungszeiten', poi.hours));
  if (poi.seasonal) rows.push(kv('Saisonal', poi.seasonal === 'yes' ? 'ja' : poi.seasonal));

  const actions = [mapsButton(poi.lat, poi.lon)];
  if (poi.phone) actions.push(h('a', { class: 'btn btn-block', href: `tel:${poi.phone.replace(/[^\d+]/g, '')}` }, icon(ICONS.phone), poi.phone));
  if (poi.web && /^https?:\/\//i.test(poi.web)) actions.push(h('a', { class: 'btn btn-block', href: poi.web, target: '_blank', rel: 'noopener' }, icon(ICONS.globe), 'Webseite'));
  if (ctx.stayAction) actions.push(button(ctx.stayAction.label, { block: true, iconSvg: ICONS.moon, onClick: ctx.stayAction.onClick }));
  if (ctx.onEdit) actions.push(button('Bearbeiten', { block: true, iconSvg: ICONS.edit, onClick: ctx.onEdit }));
  if (ctx.onDelete) actions.push(ctx.onDelete);
  if (ctx.onShowOnMap) actions.push(button('Auf der Karte zeigen', { variant: 'plain', block: true, onClick: ctx.onShowOnMap }));

  return [h('div', { class: 'list glass' }, rows), h('div', { class: 'stack' }, actions)];
}
