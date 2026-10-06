// Karte → Routen: GPX-Routen laden (Gesamtroute oder einzelne Etappen),
// Etappen ordnen, umbenennen, löschen, zusammenfügen; mehrere Routen (eine
// aktiv); Versorgung aus OpenStreetMap laden; Standort-Einstellung.
// Alles liegt ausschliesslich im privaten Bereich.

import { formatDateTime, formatNumber } from '../../format.js';
import { readGpxFile } from '../../geo/import.js';
import { DEFAULTS as POI_DEFAULTS, POI_CATEGORIES, fetchPois, getPoiIndex, loadPois } from '../../model/pois.js';
import * as routes from '../../model/route-store.js';
import { createTestRoute } from '../../model/testroute.js';
import * as store from '../../store.js';
import { toast } from '../banners.js';
import { button, clear, confirmButton, h, icon, replaceContent, sectionTitle, switchRow } from '../dom.js';
import { ICONS } from '../icons.js';
import { openSheet, closeSheet } from '../sheet.js';

const kmText = (km) => `${formatNumber(km, km < 100 ? 1 : 0)} km`;

function select(options, value, onChange) {
  const el = h(
    'select',
    { class: 'select' },
    options.map(([v, label]) => h('option', { value: String(v), text: label, selected: v === value })),
  );
  el.addEventListener('change', () => onChange(Number(el.value)));
  return el;
}

function field(label, input) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), input);
}

export const routesView = {
  title: 'Routen',
  render(container) {
    let alive = true;
    let busy = false;
    let abort = null;
    const page = h('div', { class: 'stack' });
    container.append(page);

    const fileInput = h('input', { type: 'file', accept: '.gpx,application/gpx+xml,application/xml,text/xml', multiple: true, hidden: true });
    fileInput.addEventListener('change', () => importFiles([...fileInput.files]));
    container.append(fileInput);

    async function importFiles(files) {
      if (!files.length || busy) return;
      busy = true;
      let routeId = await routes.getActiveRouteId();
      const results = [];
      toast(files.length > 1 ? `Lese ${files.length} Dateien …` : `Lese ${files[0].name} …`);
      for (const file of files) {
        try {
          const r = await readGpxFile(file);
          results.push(r);
        } catch (err) {
          toast(`${file.name}: ${err.message}`, 4000);
        }
      }
      fileInput.value = '';
      try {
        if (results.length) {
          if (!routeId) routeId = await routes.createRoute(results[0].name || 'Meine Route');
          const stages = results.flatMap((r) => r.stages);
          const waypoints = results.flatMap((r) => r.waypoints);
          await routes.addStages(routeId, stages, waypoints);
          toast(`${stages.length} ${stages.length === 1 ? 'Etappe' : 'Etappen'} hinzugefügt · ${kmText(stages.reduce((s, x) => s + x.km, 0))}`);
        }
      } catch (err) {
        toast(store.describeError(err), 4000);
      } finally {
        busy = false;
        await render();
        if (results.length) window.scrollTo(0, 0);
      }
    }

    // --- Abschnitte ----------------------------------------------------------------------
    function activeRouteCard(meta) {
      const totalKm = meta.stages.reduce((s, x) => s + x.km, 0);
      const ascent = meta.stages.reduce((s, x) => s + (x.ascent || 0), 0);
      const hasEle = meta.stages.some((x) => x.hasEle);
      return h(
        'section',
        { class: 'card glass stack' },
        h('h2', { text: meta.name }),
        h('p', { class: 'muted', text: meta.stages.length ? `${kmText(totalKm)}${hasEle ? ` · +${formatNumber(ascent, 0)} Hm` : ''} · ${meta.stages.length} ${meta.stages.length === 1 ? 'Etappe' : 'Etappen'}${meta.waypoints?.length ? ` · ${meta.waypoints.length} Wegpunkte` : ''}` : 'Noch keine Etappen – GPX-Datei(en) hinzufügen.' }),
        h(
          'div',
          { class: 'btn-row' },
          button('GPX hinzufügen', { variant: 'primary', iconSvg: ICONS.upload, onClick: () => fileInput.click() }),
          meta.stages.length ? button('Auf Karte', { iconSvg: ICONS.map, onClick: () => (window.location.hash = '#karte') }) : null,
        ),
        h('p', { class: 'small muted', text: 'Eine Gesamtroute oder mehrere Etappen (auch mehrere Dateien auf einmal). Die Etappen ergeben zusammen die Route; Lücken dazwischen (z.B. Fähren) zählen nicht als Strecke.' }),
        button('Umbenennen', {
          variant: 'plain',
          block: true,
          onClick: async () => {
            const name = prompt('Name der Route', meta.name);
            if (name && name.trim()) {
              await routes.renameRoute(meta.id, name.trim());
              render();
            }
          },
        }),
      );
    }

    function stageActions(meta, stage, i) {
      openSheet({
        title: stage.name,
        content: h(
          'div',
          { class: 'stack' },
          button('Umbenennen', {
            block: true,
            iconSvg: ICONS.edit,
            onClick: async () => {
              const name = prompt('Name der Etappe', stage.name);
              if (name && name.trim()) await routes.renameStage(meta.id, stage.id, name.trim());
              closeSheet();
              render();
            },
          }),
          i > 0 && button('Nach oben', { block: true, iconSvg: ICONS.arrowUp, onClick: async () => (await routes.moveStage(meta.id, stage.id, -1), closeSheet(), render()) }),
          i < meta.stages.length - 1 && button('Nach unten', { block: true, iconSvg: ICONS.arrowDown, onClick: async () => (await routes.moveStage(meta.id, stage.id, 1), closeSheet(), render()) }),
          confirmButton('Etappe löschen', 'Wirklich löschen?', async () => {
            await routes.removeStage(meta.id, stage.id);
            closeSheet();
            render();
            toast('Etappe gelöscht');
          }),
        ),
      });
    }

    function stagesList(meta, route) {
      if (!meta.stages.length) return [];
      const rows = [];
      meta.stages.forEach((st, i) => {
        const info = route?.stages.find((x) => x.id === st.id);
        if (info && info.gapBeforeKm > 0) rows.push(h('div', { class: 'row gap-row' }, h('span', { class: 'row-sub', text: `Lücke ${formatNumber(info.gapBeforeKm, 1)} km (z.B. Fähre) – zählt nicht als Strecke` })));
        const btn = h(
          'button',
          { type: 'button', class: 'row' },
          h('span', { class: 'stage-num', text: String(i + 1) }),
          h(
            'span',
            { class: 'row-text' },
            h('span', { class: 'row-label', text: st.name }),
            h('span', { class: 'row-sub', text: `${info ? `km ${formatNumber(info.startKm, 0)}–${formatNumber(info.endKm, 0)} · ` : ''}${kmText(st.km)}${st.hasEle ? ` · +${formatNumber(st.ascent, 0)} Hm` : ' · ohne Höhen'}` }),
          ),
          icon(ICONS.more, 'row-chevron'),
        );
        btn.addEventListener('click', () => stageActions(meta, st, i));
        rows.push(btn);
      });
      const merge =
        meta.stages.length > 1 &&
        confirmButton(
          'Etappen zu einer zusammenfügen',
          'Wirklich zusammenfügen?',
          async () => {
            await routes.mergeStages(meta.id);
            render();
            toast('Etappen zusammengefügt');
          },
          '',
        );
      return [
        sectionTitle('Etappen'),
        h('div', { class: 'list glass' }, rows),
        merge,
        merge && h('p', { class: 'footnote', text: 'Zusammenfügen ist nur nötig, wenn du eine einzige Etappe willst – auch getrennte Etappen gelten als eine Route. Lücken werden dabei zur geraden Verbindung.' }),
      ];
    }

    function poiSection(meta, route, index, counts) {
      const status = h('p', { class: 'small muted poi-status' });
      const progress = h('progress', { class: 'progress', max: 1, value: 0, hidden: true });
      let radius = index?.radius || POI_DEFAULTS.radius;
      let radiusStay = index?.radiusStay || POI_DEFAULTS.radiusStay;
      const complete = index && index.done?.length === index.chunks && index.routeUpdated === meta.updated;
      const partial = index && !complete && index.done?.length && index.routeUpdated === meta.updated;
      if (index?.done?.length) {
        status.textContent = `${formatNumber(index.count, 0)} Punkte · ${index.done.length}/${index.chunks} Abschnitte · Stand ${formatDateTime(index.updated)}${index.routeUpdated !== meta.updated ? ' · Route seither geändert – neu laden empfohlen' : ''}`;
      } else status.textContent = 'Noch nicht geladen. Einmal mit Netz laden – danach offline verfügbar.';

      const start = button(complete ? 'Versorgung neu laden' : partial ? 'Laden fortsetzen' : 'Versorgung laden', { variant: complete ? '' : 'primary', block: true, iconSvg: ICONS.download });
      const cancel = button('Abbrechen', { variant: 'plain', block: true });
      cancel.hidden = true;
      cancel.addEventListener('click', () => abort?.abort());
      start.addEventListener('click', async () => {
        if (!route || route.isEmpty || busy) return;
        busy = true;
        abort = new AbortController();
        start.disabled = true;
        cancel.hidden = false;
        progress.hidden = false;
        try {
          await fetchPois(route, {
            radius,
            radiusStay,
            restart: complete,
            signal: abort.signal,
            onProgress: ({ done, total, count }) => {
              progress.max = total;
              progress.value = done;
              status.textContent = `Lade Abschnitt ${Math.min(done + 1, total)} von ${total} · ${formatNumber(count, 0)} Punkte …`;
            },
          });
          toast('Versorgung geladen');
        } catch (err) {
          toast(err.message === 'Abgebrochen' ? 'Abgebrochen – später fortsetzen' : `Versorgung: ${err.message}`, 4000);
        } finally {
          busy = false;
          abort = null;
          if (alive) render();
        }
      });

      const countRows = counts
        ? POI_CATEGORIES.map((c) => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: c.plural }), h('span', { class: 'kv-value', text: `${formatNumber(counts[c.id] || 0, 0)}${counts[`${c.id}24`] ? ` · ${counts[`${c.id}24`]}× 24 h` : ''}` })))
        : [];

      return [
        sectionTitle('Versorgung'),
        h(
          'section',
          { class: 'card glass stack' },
          h('p', { text: 'Supermärkte und Läden, Tankstellen, Bäckereien, Trinkwasser, Velo-Werkstätten und Unterkünfte entlang der Route aus OpenStreetMap – mit Öffnungszeiten (24 h hervorgehoben).' }),
          field('Korridor Versorgung', select([[500, '500 m neben der Route'], [1000, '1 km'], [2000, '2 km'], [3000, '3 km']], radius, (v) => (radius = v))),
          field('Korridor Unterkünfte', select([[1000, '1 km'], [3000, '3 km'], [5000, '5 km'], [10000, '10 km']], radiusStay, (v) => (radiusStay = v))),
          start,
          progress,
          cancel,
          status,
        ),
        countRows.length ? h('div', { class: 'list glass' }, countRows) : null,
      ];
    }

    function routeLibrary(index) {
      const rows = index.routes.map((r) => {
        const input = h('input', { type: 'radio', name: 'active-route', class: 'choice', checked: r.id === index.active });
        input.addEventListener('change', async () => {
          await routes.setActiveRoute(r.id);
          render();
        });
        return h('label', { class: 'row' }, h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: r.name }), h('span', { class: 'row-sub', text: `${kmText(r.km)} · ${r.stages} ${r.stages === 1 ? 'Etappe' : 'Etappen'}` })), input);
      });
      return [
        sectionTitle('Alle Routen'),
        rows.length ? h('div', { class: 'list glass' }, rows) : null,
        h(
          'div',
          { class: 'btn-row' },
          button('Neue Route', {
            iconSvg: ICONS.plus,
            onClick: async () => {
              const name = prompt('Name der neuen Route', 'Neue Route');
              if (name === null) return;
              await routes.createRoute(name.trim() || 'Neue Route');
              render();
            },
          }),
          button('Testroute', {
            iconSvg: ICONS.route,
            onClick: async () => {
              if (busy) return;
              busy = true;
              try {
                const t = createTestRoute();
                const id = await routes.createRoute(t.name);
                await routes.addStages(id, t.stages, t.waypoints);
                toast('Testroute angelegt (7 Etappen, grob über die Gate-Orte)');
              } finally {
                busy = false;
                render();
              }
            },
          }),
        ),
        h('p', { class: 'footnote', text: 'Die Testroute ist selbst erstellt (grob über Rovereto, München, Berlin, Gränna, Rovaniemi, Nordkapp) – nicht die offizielle Route.' }),
      ];
    }

    function settingsSection() {
      const savePos = switchRow({
        label: 'Standort bei Statuswechsel speichern',
        sub: 'Jeder Wechsel (Pause, Hotel …) bekommt die aktuelle Position – für Follower und Statistik. Nur solange die App offen ist.',
        checked: store.settings.get('savePosition', true) !== false,
        onChange: (on) => store.settings.set('savePosition', on),
      });
      return [
        sectionTitle('Standort'),
        h('div', { class: 'list glass' }, savePos.row),
        h('p', { class: 'footnote', text: 'Achtung: Status-Einträge (mit Standort) sind wie alle Einträge ausserhalb des privaten Bereichs für jeden lesbar, der die Tour-ID kennt – und die steht derzeit im öffentlichen Code. Vor der Follower-Seite wird das geändert; bis dahin bei Bedarf hier ausschalten.' }),
      ];
    }

    // --- Aufbau ----------------------------------------------------------------------------
    // Neu aufbauen; überholte Durchläufe (es kam schon ein neuerer) verwerfen
    let renderToken = 0;
    async function render() {
      if (!alive) return;
      const token = ++renderToken;
      const stale = () => !alive || token !== renderToken;
      let index;
      try {
        index = await routes.getRouteIndex();
      } catch (err) {
        if (stale()) return;
        clear(page).append(h('section', { class: 'card glass stack' }, h('h2', { text: 'Routen nicht verfügbar' }), h('p', { class: 'muted', text: `${store.describeError(err)} – beim ersten Laden braucht es Netz.` })));
        return;
      }
      const meta = index.active ? await routes.getRouteMeta(index.active).catch(() => null) : null;
      let route = null;
      let poiIndex = null;
      let counts = null;
      if (meta?.stages.length) {
        try {
          route = await routes.loadRoute(meta.id);
          poiIndex = await getPoiIndex(meta.id).catch(() => null);
          if (poiIndex?.done?.length) {
            const { pois } = await loadPois(route);
            counts = {};
            for (const p of pois) {
              counts[p.cat] = (counts[p.cat] || 0) + 1;
              if (p.always) counts[`${p.cat}24`] = (counts[`${p.cat}24`] || 0) + 1;
            }
          }
        } catch (err) {
          toast(store.describeError(err), 4000);
        }
      }
      if (stale()) return;
      const parts = [];
      if (meta) {
        parts.push(sectionTitle('Aktive Route'), activeRouteCard(meta), ...stagesList(meta, route));
        if (meta.stages.length) parts.push(...poiSection(meta, route, poiIndex, counts));
      } else {
        parts.push(
          h(
            'section',
            { class: 'card glass stack' },
            h('h2', { text: 'Noch keine Route' }),
            h('p', { class: 'muted', text: 'Lade eine GPX-Datei – eine Gesamtroute oder mehrere Etappen auf einmal. Oder lege zum Ausprobieren die Testroute an.' }),
            button('GPX laden', { variant: 'primary', block: true, iconSvg: ICONS.upload, onClick: () => fileInput.click() }),
          ),
        );
      }
      parts.push(...routeLibrary(index), ...settingsSection());
      if (meta) {
        parts.push(
          confirmButton('Diese Route löschen', 'Wirklich löschen? (mit Versorgung und Plan)', async () => {
            await routes.deleteRoute(meta.id);
            toast('Route gelöscht');
            render();
          }),
        );
      }
      parts.push(h('p', { class: 'footnote', text: 'Routen, Versorgung und Plan liegen nur in deinem privaten Bereich (nicht für Follower sichtbar). Offizielle Routen dürfen nicht weitergegeben werden.' }));
      replaceContent(page, ...parts.filter(Boolean));
    }

    render();
    const off = routes.onRoutesChange(() => !busy && render());
    return () => {
      alive = false;
      abort?.abort();
      off();
    };
  },
};
