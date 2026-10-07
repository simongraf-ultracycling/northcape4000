// Statistik: Kennzahlen, Tagesansicht (Tagesband, Zeiten, Strecke, Plan-
// Vergleich), alle Tage als gestapelte Balken, Strecke pro Tag, Befinden-
// Verlauf (kleine Diagramme je Regler) und Rekorde.
// Daten: Statuswechsel (mit Standort) und Befinden aus store.subscribeEvents,
// dazu – falls vorhanden – die aktive Route und ihr Plan (km und Plan-Vergleich).

import { clock } from '../../clock.js';
import { formatDayKey, formatHours, formatLocalTime, formatNumber } from '../../format.js';
import * as befinden from '../../model/befinden.js';
import { computePlan, loadPlan } from '../../model/plan.js';
import { loadActiveRoute, onRoutesChange } from '../../model/route-store.js';
import { RANGES, computeStats, dayKey } from '../../model/stats.js';
import { GROUPS } from '../../model/status.js';
import * as store from '../../store.js';
import { columns, dayBand, groupLegend, lineChart, stackedBar } from '../charts.js';
import { button, clear, h, icon, replaceContent, sectionTitle } from '../dom.js';
import { ICONS } from '../icons.js';

const NEAR_ROUTE_M = 3000;

function kv(key, value) {
  return h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: key }), h('span', { class: 'kv-value', text: value }));
}

function tile(value, label, sub, group) {
  return h('div', { class: 'tile glass', dataset: group ? { category: group } : {} }, h('span', { class: 'tile-value', text: value }), h('span', { class: 'tile-label', text: label }), sub ? h('span', { class: 'tile-sub', text: sub }) : null);
}

function moodText(mood) {
  return befinden.DIMENSIONS.filter((d) => Number.isFinite(mood[d.id]))
    .map((d) => `${d.short} ${formatNumber(mood[d.id], 1)}`)
    .join(' · ');
}

// Plan: km, die zum Zeitpunkt t erreicht sein sollten (Umkehrung von eta)
function planKmAt(plan, route, t) {
  if (!plan || !Number.isFinite(plan.start) || t < plan.start) return null;
  let lo = 0;
  let hi = route.totalKm;
  if ((plan.eta(hi) ?? Infinity) <= t) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((plan.eta(mid) ?? Infinity) <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

function planDelta(actualKm, plannedKm) {
  const d = actualKm - plannedKm;
  if (Math.abs(d) < 1) return 'genau im Plan';
  return `${formatNumber(Math.abs(d), 0)} km ${d > 0 ? 'vor' : 'hinter'} dem Plan`;
}

export const statsView = {
  title: 'Statistik',
  render(container) {
    let alive = true;
    let events = [];
    let loaded = false;
    let route = null;
    let plan = null;
    let range = store.settings.get('statsRange', '7');
    if (!RANGES.some((r) => r.id === range)) range = '7';
    let selected = null; // Tag (Schlüssel) der Tagesansicht
    const page = h('div', { class: 'stack' });
    container.append(page);

    // --- Zeitraum (eine Zeile oben) -------------------------------------------------
    function rangeControl() {
      return h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Zeitraum' },
        RANGES.map((r) => {
          const btn = h('button', { type: 'button', class: `segmented-item${r.id === range ? ' is-active' : ''}`, role: 'radio', 'aria-checked': String(r.id === range), text: r.label });
          btn.addEventListener('click', () => {
            range = r.id;
            store.settings.set('statsRange', range);
            render();
          });
          return btn;
        }),
      );
    }

    // --- Kennzahlen -------------------------------------------------------------------
    function kpis(st) {
      const { totals, records } = st;
      const n = Math.max(1, totals.days);
      return h(
        'div',
        { class: 'tiles tiles-2' },
        tile(formatHours(totals.groups.fahren), 'Fahrzeit', `Ø ${formatHours(totals.groups.fahren / n)} pro Tag`, 'fahren'),
        tile(totals.kmKnown ? `${totals.kmApprox ? 'ca. ' : ''}${formatNumber(totals.km, 0)} km` : '–', 'Strecke', records.avgSpeed ? `Ø ${formatNumber(records.avgSpeed, 1)} km/h in Fahrt` : 'aus den Standorten der Wechsel', null),
        tile(formatHours(totals.groups.schlaf), 'Schlaf', records.sleepAvg ? `Ø ${formatHours(records.sleepAvg)} pro Nacht` : 'noch keine Nacht', 'schlaf'),
        tile(records.movingShare !== null ? `${Math.round(records.movingShare * 100)} %` : '–', 'Fahranteil', 'der wachen Zeit', null),
      );
    }

    // --- Plan-Vergleich (aktueller Stand) ------------------------------------------------
    function progressCard(st) {
      if (!route || !plan) return null;
      // letzter Statuswechsel mit Standort nahe der Route
      const withPos = events
        .filter((e) => e.type === 'status' && !e.voided && e.position && Number.isFinite(e.clientTime))
        .sort((a, b) => b.clientTime - a.clientTime);
      for (const e of withPos) {
        const near = route.nearest(e.position.lat, e.position.lon, NEAR_ROUTE_M);
        if (!near) continue;
        const planned = planKmAt(plan, route, e.clientTime);
        if (planned === null) return null;
        // Breiten per CSSOM (Inline-Styles verbietet die Content-Security-Policy)
        const planBar = h('span', { class: 'progress-plan' });
        const istBar = h('span', { class: 'progress-ist' });
        planBar.style.width = `${(planned / route.totalKm) * 100}%`;
        istBar.style.width = `${(near.km / route.totalKm) * 100}%`;
        return h(
          'section',
          { class: 'card glass stack progress-card' },
          h('div', { class: 'progress-head' }, icon(ICONS.flag), h('span', { class: 'progress-title', text: planDelta(near.km, planned) })),
          h('div', { class: 'progress-track', 'aria-hidden': 'true' }, planBar, istBar),
          h('div', { class: 'chart-legend' }, h('span', { class: 'chart-key key-ist' }, h('span', { class: 'chart-swatch' }), 'Ist'), h('span', { class: 'chart-key key-plan' }, h('span', { class: 'chart-swatch' }), 'Plan')),
          h('p', { class: 'small muted', text: `${route.name}: km ${formatNumber(near.km, 0)} von ${formatNumber(route.totalKm, 0)} (Stand ${formatDayKey(dayKey(e.clientTime, e.tzOffset ?? 0), st.todayKey)} ${formatLocalTime(e.clientTime, e.tzOffset ?? 0)}) · Plan: km ${formatNumber(planned, 0)}` }),
        );
      }
      return null;
    }

    // --- Tagesansicht -------------------------------------------------------------------
    function dayCard(st) {
      const days = st.days;
      const idx = Math.max(0, days.findIndex((d) => d.key === selected));
      const d = days[idx];
      const prev = button('', { iconSvg: ICONS.chevronLeft, onClick: () => select(days[idx - 1]?.key) });
      const next = button('', { iconSvg: ICONS.chevronRight, onClick: () => select(days[idx + 1]?.key) });
      prev.setAttribute('aria-label', 'Tag davor');
      next.setAttribute('aria-label', 'Tag danach');
      prev.disabled = idx === 0;
      next.disabled = idx === days.length - 1;
      prev.classList.add('btn-round');
      next.classList.add('btn-round');
      const label = formatDayKey(d.key, st.todayKey);
      const head = h('div', { class: 'day-nav' }, prev, h('div', { class: 'day-nav-text' }, h('span', { class: 'day-nav-title', text: label.charAt(0).toUpperCase() + label.slice(1) }), h('span', { class: 'row-sub', text: `Tag ${idx + 1} von ${days.length}${d.isToday ? ' · bis jetzt' : ''}` })), next);

      const rows = [];
      if (d.kmKnown) rows.push(kv('Strecke', `${d.kmApprox ? 'ca. ' : ''}${formatNumber(d.km, 0)} km${d.kmMissing ? ' (unvollständig)' : ''}`));
      if (d.endKm !== null && route) {
        const planned = d.lastStop ? planKmAt(plan, route, d.lastStop) : null;
        rows.push(kv(d.isToday ? 'Zuletzt bei' : 'Abends bei', `km ${formatNumber(d.endKm, 0)}${planned !== null ? ` · ${planDelta(d.endKm, planned)}` : ''}`));
      }
      if (d.firstRide !== null) rows.push(kv('Erste Abfahrt', formatLocalTime(d.firstRide, d.tz)));
      if (d.lastStop !== null) rows.push(kv('Letzter Halt', formatLocalTime(d.lastStop, d.tz)));
      rows.push(kv('Fahrten · Stopps', `${d.rides} · ${d.stops}`));
      if (d.longestRide) rows.push(kv('Längste Fahrt', formatHours(d.longestRide)));
      const mood = moodText(d.mood);
      if (mood) rows.push(kv(`Befinden (Ø aus ${d.moods.length})`, mood));

      return h('section', { class: 'card glass stack day-card' }, head, dayBand(d), groupLegend(d.groups), h('div', { class: 'list' }, rows));
    }

    function select(key) {
      if (!key) return;
      selected = key;
      render();
    }

    // --- Alle Tage ------------------------------------------------------------------------
    function allDays(st) {
      return h(
        'section',
        { class: 'card glass stack' },
        groupLegend(),
        h(
          'div',
          { class: 'day-rows' },
          st.days.map((d) => {
            const row = h(
              'button',
              { type: 'button', class: `day-row${d.key === selected ? ' is-selected' : ''}` },
              h('span', { class: 'day-row-head' }, h('span', { class: 'day-row-label', text: formatDayKey(d.key, st.todayKey) }), h('span', { class: 'day-row-value', text: `${formatHours(d.groups.fahren)} Fahrt${d.kmKnown ? ` · ${formatNumber(d.km, 0)} km` : ''}` })),
              stackedBar(d.groups),
            );
            row.addEventListener('click', () => {
              select(d.key);
              page.querySelector('.day-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return row;
          }),
        ),
        h('p', { class: 'small muted', text: 'Balken = 24 Stunden. Antippen zeigt den Tag oben.' }),
      );
    }

    function kmPerDay(st) {
      const days = st.days.filter((d) => d.kmKnown);
      if (!days.length) return null;
      return h(
        'section',
        { class: 'card glass stack' },
        columns(
          st.days.map((d) => ({ label: formatDayKey(d.key, st.todayKey).replace(/^(\S+) .*$/, '$1'), value: d.kmKnown ? d.km : 0, key: d.key })),
          { unit: 'km', onPick: (item) => select(item.key) },
        ),
        st.totals.kmApprox ? h('p', { class: 'small muted', text: 'Teilweise Luftlinie zwischen den Standorten (ohne Route) – eher zu wenig.' }) : null,
      );
    }

    // --- Befinden -------------------------------------------------------------------------
    const charts = [];
    function moodCharts(st) {
      const all = Object.values(st.moodSeries).flat();
      if (!all.length) return h('section', { class: 'card glass' }, h('p', { class: 'muted', text: 'Noch kein Befinden im Zeitraum – im Tab Status erfassen.' }));
      const from = st.days.length ? st.days[0].start : Math.min(...all.map((p) => p.t));
      const to = Math.max(clock.now(), ...all.map((p) => p.t));
      const dayTicks = st.days.map((d) => ({ t: d.start, label: formatDayKey(d.key, st.todayKey).replace(/^(\S+) .*$/, '$1') }));
      return h(
        'section',
        { class: 'card glass stack mood-charts' },
        befinden.DIMENSIONS.map((dim) => {
          const points = st.moodSeries[dim.id].map((p) => ({ ...p, label: `${formatDayKey(dayKey(p.t, p.tz), st.todayKey)} ${formatLocalTime(p.t, p.tz)}` }));
          const chart = lineChart(points, { from, to, dayTicks });
          charts.push(chart);
          const last = points[points.length - 1];
          const avg = points.length ? points.reduce((a, p) => a + p.v, 0) / points.length : null;
          const lvl = last ? befinden.level(dim, last.v) : null;
          return h(
            'div',
            { class: 'mood-chart' },
            h(
              'div',
              { class: 'mood-chart-head' },
              h('span', { class: 'mood-chart-title', text: dim.label }),
              h('span', { class: 'mood-chart-hint', text: dim.higherIsBetter ? '10 = gut' : '0 = gut' }),
              last ? h('span', { class: 'mood-chart-value', dataset: { level: lvl } }, h('span', { class: 'level-dot' }), `zuletzt ${last.v} · Ø ${formatNumber(avg, 1)}`) : h('span', { class: 'mood-chart-value', text: 'keine Werte' }),
            ),
            chart.el,
          );
        }),
        h('p', { class: 'small muted', text: 'Ziehen zeigt Zeitpunkt und Wert.' }),
      );
    }

    // --- Rekorde ----------------------------------------------------------------------------
    function records(st) {
      const r = st.records;
      const rows = [];
      if (r.longestRide) rows.push(kv('Längste Fahrt am Stück', `${formatHours(r.longestRide.ms)} (${formatDayKey(dayKey(r.longestRide.start, r.longestRide.tz), st.todayKey)})`));
      if (r.bestDayRide?.groups.fahren) rows.push(kv('Längster Fahrtag', `${formatHours(r.bestDayRide.groups.fahren)} (${formatDayKey(r.bestDayRide.key, st.todayKey)})`));
      if (r.bestDayKm) rows.push(kv('Weitester Tag', `${formatNumber(r.bestDayKm.km, 0)} km (${formatDayKey(r.bestDayKm.key, st.todayKey)})`));
      if (r.sleepCount) rows.push(kv('Schlaf', `${r.sleepCount}× · Ø ${formatHours(r.sleepAvg)} · kürzeste ${formatHours(r.sleepShortest)}`));
      if (r.stopCount) rows.push(kv('Stopps', `${r.stopCount}× · Ø ${formatHours(r.stopAvg)}`));
      for (const g of GROUPS) if (g.id !== 'fahren' && g.id !== 'schlaf' && st.totals.groups[g.id] > 0) rows.push(kv(g.label, formatHours(st.totals.groups[g.id])));
      if (r.panneCount) rows.push(kv('Pannen', `${r.panneCount}× · ${formatHours(r.panneMs)}`));
      return rows.length ? h('div', { class: 'list glass' }, rows) : null;
    }

    // --- Aufbau ---------------------------------------------------------------------------------
    function render() {
      if (!alive) return;
      if (!loaded) {
        replaceContent(page, h('section', { class: 'card glass' }, h('p', { class: 'muted', text: 'Lade Statistik …' })));
        return;
      }
      const st = computeStats(events, clock.now(), { route, range });
      if (!st.days.length) {
        replaceContent(
          page,
          rangeControl(),
          h('section', { class: 'card glass stack placeholder' }, icon(ICONS.stats), h('h2', { text: 'Noch keine Daten' }), h('p', { class: 'muted', text: range === 'all' ? 'Statuswechsel und Befinden im Tab Status erfassen – hier erscheinen dann Tages- und Gesamtwerte.' : 'Im gewählten Zeitraum gibt es keine Einträge.' })),
        );
        return;
      }
      if (!st.days.some((d) => d.key === selected)) selected = st.days[st.days.length - 1].key;
      charts.length = 0;
      replaceContent(
        page,
        rangeControl(),
        kpis(st),
        progressCard(st),
        sectionTitle('Tag'),
        dayCard(st),
        sectionTitle('Alle Tage'),
        allDays(st),
        st.totals.kmKnown ? sectionTitle('Strecke pro Tag') : null,
        kmPerDay(st),
        sectionTitle('Befinden'),
        moodCharts(st),
        sectionTitle('Rekorde und Durchschnitte'),
        records(st),
        h('p', { class: 'footnote', text: 'Tage nach Ortszeit beim jeweiligen Statuswechsel. Strecke aus den Standorten der Wechsel (entlang der aktiven Route, sonst Luftlinie). Mehr als 48 h ohne Wechsel zählt nicht.' }),
      );
      // Linien erst zeichnen, wenn die Breite bekannt ist
      requestAnimationFrame(() => charts.forEach((c) => c.draw()));
    }

    async function loadRoute() {
      try {
        route = await loadActiveRoute();
        if (route?.isEmpty) route = null;
        const data = route ? await loadPlan(route.id) : null;
        plan = route && data && Number.isFinite(data.settings?.start) ? computePlan(route, data.settings, data.pins) : null;
      } catch {
        route = null;
        plan = null;
      }
      if (loaded) render();
    }

    render();
    loadRoute();
    const unsubscribe = store.subscribeEvents(
      (list) => {
        events = list;
        loaded = true;
        render();
      },
      { limit: 5000 },
    );
    const offRoutes = onRoutesChange(() => loadRoute());
    const offClock = clock.onChange(() => render());
    // laufender Abschnitt ("bis jetzt") jede Minute nachführen
    const timer = setInterval(() => loaded && !page.contains(document.activeElement) && render(), 60_000);
    let resizeTimer = null;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => charts.forEach((c) => c.draw()), 150);
    };
    window.addEventListener('resize', onResize);

    return () => {
      alive = false;
      unsubscribe();
      offRoutes();
      offClock();
      clearInterval(timer);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  },
};
