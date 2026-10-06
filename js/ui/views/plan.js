// Plan: Tagesetappen mit Schlafstopps entlang der aktiven Route.
// Automatisch aus Tempo, Steigleistung, Fahrzeit, Pausen und Schlaf – jeder
// Schlafstopp lässt sich festlegen (km oder Unterkunft aus der Versorgung).
// Gates, Zeitfenster und Fähren-Rechner folgen in Etappe 4.

import { clock } from '../../clock.js';
import { formatNumber, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../format.js';
import { DEFAULT_SETTINGS, computePlan, defaultStart, loadPlan, savePlan, staysNear } from '../../model/plan.js';
import { loadPois, placeNear } from '../../model/pois.js';
import { loadActiveRoute, onRoutesChange } from '../../model/route-store.js';
import * as store from '../../store.js';
import { toast } from '../banners.js';
import { button, clear, h, icon, replaceContent, sectionTitle } from '../dom.js';
import { ICONS } from '../icons.js';
import { dayTime, kmLabel, offLabel, poiDetails, poiTitle } from '../map/poi-ui.js';
import { closeSheet, openSheet } from '../sheet.js';

const FIELDS = [
  { key: 'speed', label: 'Tempo (Fahrt)', unit: 'km/h', step: 0.5, min: 5, max: 50 },
  { key: 'climbRate', label: 'Steigleistung', unit: 'Hm/h', step: 50, min: 100, max: 2000 },
  { key: 'rideHours', label: 'Fahrzeit pro Tag', unit: 'h', step: 0.5, min: 1, max: 24 },
  { key: 'pauseHours', label: 'Pausen pro Tag', unit: 'h', step: 0.5, min: 0, max: 12 },
  { key: 'sleepHours', label: 'Schlaf', unit: 'h', step: 0.5, min: 0, max: 16 },
];

export const planView = {
  title: 'Plan',
  render(container) {
    let alive = true;
    const page = h('div', { class: 'stack' });
    container.append(page);
    let route = null;
    let data = null;
    let pois = [];
    let places = [];

    const save = () => savePlan(route.id, data);

    function settingsCard(plan) {
      const startInput = h('input', { class: 'input', type: 'datetime-local', value: toDateTimeLocalValue(plan.start) });
      startInput.addEventListener('change', () => {
        const t = fromDateTimeLocalValue(startInput.value);
        if (!Number.isFinite(t)) return;
        data.settings.start = t;
        save();
        renderPlan();
      });
      const inputs = FIELDS.map((f) => {
        const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: f.step, min: f.min, max: f.max, value: String(data.settings[f.key]) });
        input.addEventListener('change', () => {
          const v = Number(String(input.value).replace(',', '.'));
          if (!Number.isFinite(v) || v < f.min || v > f.max) {
            toast(`${f.label}: ${f.min}–${f.max} ${f.unit}`);
            input.value = String(data.settings[f.key]);
            return;
          }
          data.settings[f.key] = v;
          save();
          renderPlan();
        });
        return h('label', { class: 'field' }, h('span', { class: 'field-label', text: `${f.label} (${f.unit})` }), input);
      });
      const cycle = data.settings.rideHours + data.settings.pauseHours + data.settings.sleepHours;
      return h(
        'section',
        { class: 'card glass stack' },
        h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Start' }), startInput),
        h('div', { class: 'plan-fields' }, inputs),
        h('p', { class: 'small muted', text: `Ein Tag = ${formatNumber(cycle, 1)} h (Fahrt + Pausen + Schlaf). Fahrzeit = km ÷ Tempo + Höhenmeter ÷ Steigleistung.` }),
        button('Standardwerte', {
          variant: 'plain',
          block: true,
          onClick: () => {
            data.settings = { ...DEFAULT_SETTINGS, start: data.settings.start };
            save();
            renderPlan();
          },
        }),
      );
    }

    function summaryCard(plan) {
      const now = clock.now();
      const days = plan.days.length;
      const rows = [
        h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: 'Strecke' }), h('span', { class: 'kv-value', text: `${formatNumber(route.totalKm, 0)} km${route.hasEle ? ` · +${formatNumber(route.ascent, 0)} Hm` : ''}` })),
        h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: 'Tage' }), h('span', { class: 'kv-value', text: `${days} · Ø ${formatNumber(route.totalKm / Math.max(1, plan.totalHours / 24), 0)} km pro 24 h` })),
        h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: 'Ziel' }), h('span', { class: 'kv-value', text: plan.finish ? `${dayTime(plan.finish, now)} · ${formatNumber(plan.totalHours / 24, 1)} Tage` : '–' })),
      ];
      // Wegpunkte (z.B. Gates) mit geplanter Ankunft
      const wps = route.waypoints.filter((w) => Number.isFinite(w.km)).sort((a, b) => a.km - b.km);
      for (const w of wps) {
        rows.push(h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: `${w.name}${w.type ? ` (${w.type})` : ''}` }), h('span', { class: 'kv-value', text: `${kmLabel(w.km, 0)} · ${dayTime(plan.eta(w.km), now)}` })));
      }
      return h('div', { class: 'list glass' }, rows);
    }

    function setPin(day, km) {
      data.pins = { ...data.pins, [day]: Math.round(km * 100) / 100 };
      save();
      renderPlan();
    }

    function clearPin(day) {
      const pins = { ...data.pins };
      delete pins[day];
      data.pins = pins;
      save();
      renderPlan();
    }

    function dayCard(d, plan) {
      const now = clock.now();
      const place = placeNear(places, d.endKm);
      const head = h(
        'div',
        { class: 'plan-day-head' },
        h('span', { class: 'plan-day-num', text: String(d.day) }),
        h('span', { class: 'row-text' }, h('span', { class: 'plan-day-title', text: `Tag ${d.day} · ${dayTime(d.start, now)}` }), h('span', { class: 'row-sub', text: `${kmLabel(d.startKm, 0)}–${formatNumber(d.endKm, 0)} · ${formatNumber(d.km, 0)} km${route.hasEle ? ` · +${formatNumber(d.ascent, 0)} Hm` : ''} · ${formatNumber(d.rideHours, 1)} h Fahrt` })),
      );
      const stopText = d.last ? `Ziel · Ankunft ${dayTime(d.arrive, now)}` : `${d.pinned ? 'Schlafstopp (festgelegt)' : 'Schlafstopp'} ${place ? `bei ${place.name} ` : ''}· ${kmLabel(d.endKm, 0)}`;
      const stop = h('p', { class: 'plan-stop' }, icon(d.last ? ICONS.flag : ICONS.moon), h('span', { text: stopText }));
      const times = d.last ? null : h('p', { class: 'small muted', text: `Ankunft ${dayTime(d.arrive, now)} · weiter ${dayTime(d.depart, now)}` });
      const warn = d.pinIgnored ? h('p', { class: 'small is-warn', text: 'Festgelegter Stopp liegt vor dem Tagesstart – ignoriert.' }) : null;

      const stays = d.last ? [] : staysNear(pois, d.endKm);
      const stayRows = stays.map((p) => {
        const row = h(
          'button',
          { type: 'button', class: 'row' },
          icon(ICONS.bed, 'row-icon'),
          h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: poiTitle(p) }), h('span', { class: 'row-sub', text: `${p.sub} · ${kmLabel(p.km, 1)} · ${offLabel(p.off)}` })),
          icon(ICONS.chevronRight, 'row-chevron'),
        );
        row.addEventListener('click', () =>
          openSheet({
            title: poiTitle(p),
            content: poiDetails(p, {
              now,
              plannedEta: plan.eta,
              stayAction: { label: `Als Schlafstopp für Tag ${d.day}`, onClick: () => (closeSheet(), setPin(d.day, p.km), toast(`Schlafstopp Tag ${d.day}: ${poiTitle(p)}`)) },
              onShowOnMap: () => (window.location.hash = `#karte?km=${p.km.toFixed(2)}`),
            }),
          }),
        );
        return row;
      });

      const actions = h(
        'div',
        { class: 'btn-row' },
        button('Auf Karte', { iconSvg: ICONS.map, onClick: () => (window.location.hash = `#karte?km=${d.endKm.toFixed(2)}`) }),
        d.last
          ? null
          : button('km festlegen', {
              iconSvg: ICONS.edit,
              onClick: () => {
                const v = prompt(`Schlafstopp Tag ${d.day} bei km (${formatNumber(d.startKm + 1, 0)}–${formatNumber(route.totalKm, 0)})`, formatNumber(d.endKm, 0));
                if (v === null) return;
                const km = Number(String(v).replace(/[’'\s]/g, '').replace(',', '.'));
                if (!Number.isFinite(km) || km <= d.startKm || km > route.totalKm) return toast('Ungültiger km-Wert');
                setPin(d.day, km);
              },
            }),
      );

      return h(
        'section',
        { class: `card glass stack plan-day${d.pinned ? ' is-pinned' : ''}` },
        head,
        stop,
        times,
        warn,
        stayRows.length ? h('div', { class: 'list plan-stays' }, h('p', { class: 'plan-stays-title', text: 'Unterkünfte in der Nähe' }), stayRows) : null,
        actions,
        d.pinned ? button('Wieder automatisch', { variant: 'plain', block: true, onClick: () => clearPin(d.day) }) : null,
      );
    }

    let rendering = false;
    function renderPlan() {
      if (!alive || rendering) return;
      rendering = true;
      try {
        renderPlanNow();
      } finally {
        rendering = false;
      }
    }

    function renderPlanNow() {
      const plan = computePlan(route, data.settings, data.pins);
      replaceContent(
        page,
        sectionTitle(route.name),
        summaryCard(plan),
        sectionTitle('Annahmen'),
        settingsCard(plan),
        sectionTitle('Tagesetappen'),
        ...plan.days.map((d) => dayCard(d, plan)),
        h('p', { class: 'footnote', text: pois.length ? 'Unterkünfte aus der Versorgung (OpenStreetMap). Antippen für Details und "Als Schlafstopp".' : 'Tipp: Unter Karte → Routen die Versorgung laden – dann erscheinen hier Unterkünfte nahe der Schlafstopps.' }),
        h('p', { class: 'footnote', text: 'Gates mit Zeitfenstern und der Fähren-Rechner folgen in Etappe 4.' }),
      );
    }

    async function load() {
      clear(page).append(h('section', { class: 'card glass' }, h('p', { class: 'muted', text: 'Lade Plan …' })));
      try {
        route = await loadActiveRoute();
      } catch (err) {
        route = null;
        toast(store.describeError(err), 4000);
      }
      if (!alive) return;
      if (!route || route.isEmpty) {
        clear(page).append(
          h(
            'section',
            { class: 'card glass stack placeholder' },
            icon(ICONS.plan),
            h('h2', { text: 'Noch keine Route' }),
            h('p', { class: 'muted', text: 'Für die Tagesplanung zuerst eine Route laden (GPX oder Testroute).' }),
            button('Routen verwalten', { variant: 'primary', block: true, onClick: () => (window.location.hash = '#karte/routen') }),
          ),
        );
        return;
      }
      data = await loadPlan(route.id).catch(() => ({ settings: { ...DEFAULT_SETTINGS }, pins: {} }));
      if (!Number.isFinite(data.settings.start)) data.settings.start = defaultStart(clock.now());
      try {
        ({ pois, places } = await loadPois(route));
      } catch {
        pois = [];
        places = [];
      }
      renderPlan();
    }

    load();
    const off = onRoutesChange(() => load());
    return () => {
      alive = false;
      off();
    };
  },
};
