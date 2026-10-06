// Karte: Route mit Etappen und Lücken (Fähren), km-Marken, Wegpunkte (Gates),
// Schlafstopps aus dem Plan, Versorgung, eigene Punkte und eigener Standort –
// auf vielen Kartenebenen. Lange tippen = "Dieser Ort" (eigenen Punkt speichern). Unten: Lage auf der Route, "Voraus" (nächste Versorgung) und
// Höhenprofil. Ohne Netz bleiben Route, Punkte und Standort sichtbar
// (Hintergrund aus gespeicherten Kacheln oder schlicht).

import { clock } from '../../clock.js';
import { formatElapsed, formatNumber } from '../../format.js';
import { distance } from '../../geo/geo.js';
import * as location from '../../geo/location.js';
import { addMyPoi, deleteMyPoi, loadMyPois, onMyPoisChange, updateMyPoi } from '../../model/my-pois.js';
import { computePlan, loadPlan, movingHours, savePlan } from '../../model/plan.js';
import { POI_CATEGORIES, loadPois, placeNear } from '../../model/pois.js';
import { loadActiveRoute, onRoutesChange } from '../../model/route-store.js';
import * as store from '../../store.js';
import { toast } from '../banners.js';
import { getEffectiveMode, onDisplayChange, schemeOf } from '../display.js';
import { button, clear, confirmButton, h, icon, sectionTitle, switchRow } from '../dom.js';
import { ICONS } from '../icons.js';
import { AUTO_BASE, BASE_LAYERS, TILE_OVERLAYS, baseLayer, tileOptions } from '../map/layers.js';
import { loadLeaflet } from '../map/leaflet.js';
import { catIcon, dayTime, hoursAt, kmLabel, mapsButton, offLabel, poiDetails, poiTitle } from '../map/poi-ui.js';
import { createProfile } from '../map/profile.js';
import { closeSheet, openSheet } from '../sheet.js';

const ON_ROUTE_M = 300; // näher als das gilt als "auf der Route"
const POI_MIN_ZOOM = 9;
const VORAUS_COUNT = 4;

const DEFAULT_SHOW = { km: true, stages: true, waypoints: true, sleep: true, days: false, only24: false, mine: true, pois: Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, true])) };

function getShow() {
  const s = store.settings.get('mapShow', {});
  return { ...DEFAULT_SHOW, ...s, pois: { ...DEFAULT_SHOW.pois, ...(s.pois || {}) } };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// km-Abstand der Marken je nach Zoom
function kmStep(zoom) {
  if (zoom <= 5) return 0; // Übersicht: keine km-Marken
  if (zoom <= 6) return 200;
  if (zoom <= 7) return 100;
  if (zoom <= 8) return 50;
  if (zoom <= 10) return 20;
  if (zoom <= 11) return 10;
  if (zoom <= 13) return 5;
  return 1;
}

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export const mapView = {
  title: 'Karte',
  render(container, params) {
    const cleanups = [];
    let alive = true;
    const s = {
      L: null,
      map: null,
      route: null,
      pois: [],
      places: [],
      poiIndex: null,
      mine: [], // eigene Punkte
      plan: null,
      planData: null,
      pos: null, // letzte Position
      onRoute: null, // { km, dist } der Position
      follow: false,
      locate: store.settings.get('mapLocate', true) !== false,
      layers: {},
      show: getShow(),
    };

    // --- Gerüst ---------------------------------------------------------------
    const mapEl = h('div', { class: 'map-canvas', id: 'map-canvas' });
    const routePill = h('button', { type: 'button', class: 'map-route-pill glass' }, icon(ICONS.route), h('span', { class: 'map-route-name', text: 'Karte wird geladen …' }));
    routePill.addEventListener('click', () => (window.location.hash = '#karte/routen'));

    const ctrl = (svg, label, onClick) => {
      const btn = h('button', { type: 'button', class: 'map-btn', 'aria-label': label }, h('span', { class: 'chip chip-round glass' }, icon(svg)));
      btn.addEventListener('click', onClick);
      return btn;
    };
    const locateBtn = ctrl(ICONS.locate, 'Mein Standort', () => toggleLocate());
    const controls = h(
      'div',
      { class: 'map-controls' },
      ctrl(ICONS.layers, 'Kartenebenen', () => openLayerSheet()),
      locateBtn,
      ctrl(ICONS.fit, 'Ganze Route zeigen', () => fitRoute()),
      ctrl(ICONS.plus, 'Hineinzoomen', () => s.map?.zoomIn()),
      ctrl(ICONS.minus, 'Herauszoomen', () => s.map?.zoomOut()),
    );

    // Unten: Lage, Voraus, Profil
    const summary = h('div', { class: 'map-summary' });
    const panelBody = h('div', { class: 'map-panel-body' });
    const tabVoraus = h('button', { type: 'button', class: 'map-tab', text: 'Voraus' });
    const tabProfil = h('button', { type: 'button', class: 'map-tab', text: 'Profil' });
    const panel = h('section', { class: 'map-panel glass' }, h('div', { class: 'map-panel-head' }, summary, h('div', { class: 'map-tabs' }, tabVoraus, tabProfil)), panelBody);
    let panelMode = store.settings.get('mapPanel', 'voraus');
    const setPanel = (mode) => {
      panelMode = panelMode === mode ? 'klein' : mode;
      store.settings.set('mapPanel', panelMode);
      renderPanel();
    };
    tabVoraus.addEventListener('click', () => setPanel('voraus'));
    tabProfil.addEventListener('click', () => setPanel('profil'));
    const profile = createProfile({ onSelect: (km) => markKm(km, false) });

    const message = h('div', { class: 'map-message glass', hidden: true });
    const page = h('div', { class: 'map-page' }, mapEl, routePill, controls, message, panel);
    container.append(page);
    document.body.classList.add('page-map');
    cleanups.push(() => document.body.classList.remove('page-map'));

    const showMessage = (text, action) => {
      clear(message).append(h('p', { text }), action || '');
      message.hidden = false;
    };

    // --- Hilfen ------------------------------------------------------------------
    // Verdeckter Bereich unten (Panel, Tab-Leiste) in Pixeln der Karte
    const bottomCover = () => {
      const mapRect = mapEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return Math.max(0, mapRect.bottom - panelRect.top);
    };
    // Punkt in die Mitte des SICHTBAREN Kartenteils setzen
    const focusOn = (lat, lon, zoom, animate = false) => {
      if (!s.map) return;
      const z = zoom ?? s.map.getZoom();
      const offset = bottomCover() / 2 - 20; // Route-Pille oben
      const target = s.map.project([lat, lon], z).add([0, offset]);
      s.map.setView(s.map.unproject(target, z), z, { animate });
    };

    const planSettings = () => s.planData?.settings || null;
    // Ankunft ab jetzt (reine Fahrzeit) bzw. geplante Ankunft
    const etaFromNow = (km) => {
      if (!s.route || !s.onRoute) return null;
      const st = planSettings() || { speed: 22, climbRate: 700 };
      return clock.now() + movingHours(s.route, s.onRoute.km, km, st) * 3_600_000;
    };
    const plannedEta = (km) => s.plan?.eta(km) ?? null;

    // --- Karte -------------------------------------------------------------------
    async function init() {
      try {
        s.L = await loadLeaflet();
      } catch (err) {
        routePill.querySelector('.map-route-name').textContent = 'Karte nicht verfügbar';
        showMessage('Die Kartenbibliothek konnte nicht geladen werden. Beim ersten Öffnen braucht die Karte einmal Netz.', button('Neu laden', { onClick: () => window.location.reload() }));
        return;
      }
      if (!alive) return;
      const { L } = s;
      // tapHold: langes Tippen auf iOS (auch als Home-Screen-App) = contextmenu
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
      const map = (s.map = L.map(mapEl, { zoomControl: false, minZoom: 3, maxZoom: 19, worldCopyJump: false, zoomSnap: 0.5, tapHold: ios || L.Map.prototype.options.tapHold }));
      map.attributionControl.setPrefix(false);
      map.attributionControl.setPosition('topright');
      map.setView([52, 10], 4);
      s.layers.base = null;
      s.layers.overlays = new Map();
      s.layers.route = L.layerGroup().addTo(map);
      s.layers.km = L.layerGroup().addTo(map);
      s.layers.stages = L.layerGroup().addTo(map);
      s.layers.waypoints = L.layerGroup().addTo(map);
      s.layers.sleep = L.layerGroup().addTo(map);
      s.layers.poiRenderer = L.canvas({ padding: 0.3, tolerance: 10 });
      s.layers.pois = new Map(POI_CATEGORIES.map((c) => [c.id, L.layerGroup()]));
      s.layers.mine = L.layerGroup().addTo(map);
      s.layers.pick = L.layerGroup().addTo(map);
      s.layers.me = L.layerGroup().addTo(map);
      s.layers.mark = L.layerGroup().addTo(map);
      applyBase();
      applyOverlays();

      const zoomClass = () => mapEl.classList.toggle('map-zoom-low', map.getZoom() < 7);
      map.on('zoomend', zoomClass);
      zoomClass();
      map.on('zoomend moveend', () => {
        updateKmMarks();
        updatePoiVisibility();
        saveViewport();
      });
      map.on('dragstart', () => setFollow(false));
      map.on('click', (e) => onMapClick(e));
      map.on('contextmenu', (e) => onLongPress(e));
      cleanups.push(() => map.remove());
      if (store.isSimMode()) window.__ncMap = s; // nur für Tests im Sim-Modus

      await loadData(true);
      if (s.locate) startLocate();
    }

    function applyBase() {
      const { L, map } = s;
      if (!map) return;
      const layer = baseLayer(store.settings.get('mapBase', AUTO_BASE.id), schemeOf(getEffectiveMode()));
      if (s.layers.base?._def === layer) return;
      if (s.layers.base) map.removeLayer(s.layers.base);
      s.layers.base = null;
      mapEl.classList.toggle('map-blank', !layer.url);
      mapEl.classList.toggle('map-dark', !!layer.dark);
      if (layer.url) {
        const tl = L.tileLayer(layer.url, tileOptions(layer));
        tl._def = layer;
        tl.addTo(map);
        tl.bringToBack();
        s.layers.base = tl;
      }
    }

    function applyOverlays() {
      const { L, map } = s;
      if (!map) return;
      const wanted = new Set(store.settings.get('mapOverlays', []));
      for (const def of TILE_OVERLAYS) {
        const existing = s.layers.overlays.get(def.id);
        if (wanted.has(def.id) && !existing) {
          const tl = L.tileLayer(def.url, tileOptions(def)).addTo(map);
          s.layers.overlays.set(def.id, tl);
        } else if (!wanted.has(def.id) && existing) {
          map.removeLayer(existing);
          s.layers.overlays.delete(def.id);
        }
      }
    }

    // Route, Plan und Versorgung laden (auch nach Änderungen)
    async function loadData(initial) {
      try {
        s.route = await loadActiveRoute();
      } catch (err) {
        s.route = null;
        showMessage(`Route konnte nicht geladen werden: ${store.describeError(err)}`);
      }
      if (!alive) return;
      await loadMine();
      if (!alive) return;
      const name = routePill.querySelector('.map-route-name');
      if (!s.route || s.route.isEmpty) {
        name.textContent = s.route ? `${s.route.name} – noch ohne Etappen` : 'Noch keine Route';
        showMessage('Lade eine GPX-Route (Gesamtroute oder einzelne Etappen) oder lege die Testroute an.', button('Routen verwalten', { variant: 'primary', onClick: () => (window.location.hash = '#karte/routen') }));
        drawAll();
        renderPanel();
        return;
      }
      message.hidden = true;
      name.textContent = `${s.route.name} · ${formatNumber(s.route.totalKm, 0)} km`;
      try {
        s.planData = await loadPlan(s.route.id);
        s.plan = computePlan(s.route, s.planData.settings, s.planData.pins);
      } catch {
        s.planData = null;
        s.plan = null;
      }
      try {
        const loaded = await loadPois(s.route);
        s.pois = loaded.pois;
        s.places = loaded.places;
        s.poiIndex = loaded.index;
      } catch {
        s.pois = [];
        s.places = [];
      }
      if (!alive) return;
      drawAll();
      if (initial) initialView();
      updatePosition();
      renderPanel();
    }

    async function loadMine() {
      try {
        s.mine = await loadMyPois(s.route);
      } catch {
        s.mine = [];
      }
    }

    function initialView() {
      const kmParam = params?.get('km');
      const km = kmParam ? Number(kmParam) : NaN;
      if (Number.isFinite(km) && s.route) {
        const p = s.route.pointAtKm(km);
        focusOn(p.lat, p.lon, 13);
        markKm(km, false);
        return;
      }
      const saved = store.settings.get('mapViewport', null);
      if (saved && saved.route === s.route.id) s.map.setView([saved.lat, saved.lon], saved.zoom);
      else fitRoute();
    }

    let viewportTimer = null;
    function saveViewport() {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => {
        if (!s.map || !s.route) return;
        const c = s.map.getCenter();
        store.settings.set('mapViewport', { route: s.route.id, lat: c.lat, lon: c.lng, zoom: s.map.getZoom() });
      }, 800);
    }

    function fitRoute() {
      if (!s.map || !s.route || s.route.isEmpty) return;
      setFollow(false);
      s.map.fitBounds(s.route.bounds(), { paddingTopLeft: [24, 80], paddingBottomRight: [72, bottomCover() + 24] });
    }

    // --- Zeichnen ----------------------------------------------------------------
    function drawAll() {
      if (!s.map) return;
      drawRoute();
      drawStages();
      drawWaypoints();
      drawSleep();
      drawPois();
      drawMine();
      updateKmMarks();
      updatePoiVisibility();
    }

    function drawRoute() {
      const { L } = s;
      s.layers.route.clearLayers();
      if (!s.route || s.route.isEmpty) return;
      const casing = cssVar('--map-route-casing');
      const colorA = cssVar('--map-route');
      const colorB = cssVar('--map-route-alt');
      const gapColor = cssVar('--map-gap');
      const lines = [];
      if (s.show.days && s.plan?.days.length) {
        s.plan.days.forEach((d, i) => {
          for (const part of s.route.slice(d.startKm, d.endKm)) lines.push({ latlngs: part, color: i % 2 ? colorB : colorA });
        });
      } else {
        for (const { latlngs } of s.route.stageLines()) lines.push({ latlngs, color: colorA });
      }
      for (const l of lines) L.polyline(l.latlngs, { color: casing, weight: 9, opacity: 0.85, interactive: false }).addTo(s.layers.route);
      for (const l of lines) L.polyline(l.latlngs, { color: l.color, weight: 5, opacity: 1, interactive: false }).addTo(s.layers.route);
      for (const g of s.route.gapLines()) L.polyline(g, { color: gapColor, weight: 3, dashArray: '6 8', opacity: 0.9, interactive: false }).addTo(s.layers.route);
    }

    const divIcon = (el, size = [0, 0], anchor) => s.L.divIcon({ html: el, className: 'map-div', iconSize: size, iconAnchor: anchor || [size[0] / 2, size[1] / 2] });

    function drawStages() {
      const { L } = s;
      s.layers.stages.clearLayers();
      if (!s.route || !s.show.stages || s.route.stages.length < 2) return;
      s.route.stages.forEach((st, i) => {
        if (i === 0) return;
        const p = s.route.pointAtKm(st.startKm + 0.001);
        const el = h('span', { class: 'map-stage', text: String(i + 1), title: st.name });
        L.marker([p.lat, p.lon], { icon: divIcon(el, [26, 26]), interactive: false, keyboard: false }).addTo(s.layers.stages);
      });
    }

    function drawWaypoints() {
      const { L } = s;
      s.layers.waypoints.clearLayers();
      if (!s.route || !s.show.waypoints) return;
      for (const w of s.route.waypoints) {
        const el = h('span', { class: 'map-flag' }, icon(ICONS.flag), h('span', { text: w.name }));
        const m = L.marker([w.lat, w.lon], { icon: divIcon(el, [0, 0], [0, 0]), keyboard: false, bubblingMouseEvents: false });
        m.on('click', () => openWaypointSheet(w));
        m.addTo(s.layers.waypoints);
      }
    }

    function drawSleep() {
      const { L } = s;
      s.layers.sleep.clearLayers();
      if (!s.route || !s.show.sleep || !s.plan) return;
      for (const d of s.plan.days) {
        if (d.last) continue;
        const p = s.route.pointAtKm(d.endKm);
        const el = h('span', { class: `map-sleep${d.pinned ? ' is-pinned' : ''}` }, icon(ICONS.moon), h('span', { text: String(d.day) }));
        const m = L.marker([p.lat, p.lon], { icon: divIcon(el, [44, 30]), keyboard: false, bubblingMouseEvents: false, zIndexOffset: 500 });
        m.on('click', () => openSleepSheet(d));
        m.addTo(s.layers.sleep);
      }
    }

    function drawPois() {
      const { L } = s;
      for (const group of s.layers.pois.values()) group.clearLayers();
      if (!s.pois.length) return;
      const ring24 = cssVar('--poi-24h');
      const colors = Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, cssVar(`--poi-${c.id}`)]));
      for (const p of s.pois) {
        if (s.show.only24 && !p.always) continue;
        const group = s.layers.pois.get(p.cat);
        if (!group) continue;
        const m = L.circleMarker([p.lat, p.lon], {
          renderer: s.layers.poiRenderer,
          radius: p.always ? 8 : 7,
          color: p.always ? ring24 : '#ffffff',
          weight: p.always ? 3.5 : 2,
          fillColor: colors[p.cat],
          fillOpacity: 1,
          bubblingMouseEvents: false,
        });
        m.on('click', () => openPoiSheet(p));
        m.addTo(group);
      }
    }

    function drawMine() {
      const { L } = s;
      s.layers.mine.clearLayers();
      if (!s.show.mine) return;
      for (const p of s.mine) {
        const el = h('span', { class: 'map-mine' }, icon(ICONS.star), h('span', { text: p.name }));
        const m = L.marker([p.lat, p.lon], { icon: divIcon(el, [0, 0], [0, 0]), keyboard: false, bubblingMouseEvents: false, zIndexOffset: 600 });
        m.on('click', () => openMineSheet(p));
        m.addTo(s.layers.mine);
      }
    }

    function updatePoiVisibility() {
      if (!s.map) return;
      const visible = s.map.getZoom() >= POI_MIN_ZOOM;
      for (const [cat, group] of s.layers.pois) {
        const on = visible && s.show.pois[cat];
        if (on && !s.map.hasLayer(group)) group.addTo(s.map);
        if (!on && s.map.hasLayer(group)) s.map.removeLayer(group);
      }
    }

    function updateKmMarks() {
      const { L, map, route } = s;
      if (!map) return;
      s.layers.km.clearLayers();
      if (!route || route.isEmpty || !s.show.km) return;
      const step = kmStep(map.getZoom());
      if (!step) return;
      const bounds = map.getBounds().pad(0.2);
      let count = 0;
      for (let km = step; km < route.totalKm && count < 400; km += step) {
        const p = route.pointAtKm(km);
        if (!bounds.contains([p.lat, p.lon])) continue;
        count++;
        const el = h('span', { class: 'map-km', text: formatNumber(km, 0) });
        L.marker([p.lat, p.lon], { icon: divIcon(el, [0, 0], [0, 0]), interactive: false, keyboard: false }).addTo(s.layers.km);
      }
    }

    // Hervorhebung eines km (Profil, Plan "Auf Karte")
    function markKm(km, pan) {
      const { L } = s;
      if (!s.route || !s.map) return;
      s.layers.mark.clearLayers();
      const p = s.route.pointAtKm(km);
      L.circleMarker([p.lat, p.lon], { radius: 9, color: '#ffffff', weight: 3, fillColor: cssVar('--map-route'), fillOpacity: 1, interactive: false }).addTo(s.layers.mark);
      if (pan) focusOn(p.lat, p.lon, undefined, true);
    }

    // --- Standort ---------------------------------------------------------------
    let unwatch = null;
    let errorShown = false;

    function startLocate() {
      if (unwatch) return;
      unwatch = location.watchPosition((pos, err) => {
        if (pos) {
          s.pos = pos;
          updatePosition();
          if (s.follow) focusOn(pos.lat, pos.lon, Math.max(s.map.getZoom(), 14), true);
        } else if (err && s.locate && !errorShown) {
          errorShown = true; // nur einmal melden
          toast(err.text, 3500);
          if (err.code === 'denied') {
            unwatch?.();
            unwatch = null;
            locateBtn.classList.remove('is-on', 'is-follow');
          }
        }
      });
      locateBtn.classList.add('is-on');
    }

    function stopLocate() {
      unwatch?.();
      unwatch = null;
      s.pos = null;
      s.onRoute = null;
      s.layers.me?.clearLayers();
      locateBtn.classList.remove('is-on', 'is-follow');
      renderPanel();
    }
    cleanups.push(() => unwatch?.());

    function setFollow(on) {
      s.follow = on;
      locateBtn.classList.toggle('is-follow', on);
    }

    // Tippen: Standort an → zentrieren und folgen → folgen aus
    function toggleLocate() {
      if (!s.locate || !unwatch) {
        s.locate = true;
        errorShown = false;
        store.settings.set('mapLocate', true);
        startLocate();
        setFollow(true);
        if (s.pos) focusOn(s.pos.lat, s.pos.lon, Math.max(s.map.getZoom(), 14), true);
        return;
      }
      if (!s.follow) {
        setFollow(true);
        if (s.pos) focusOn(s.pos.lat, s.pos.lon, Math.max(s.map.getZoom(), 14), true);
        else toast('Standort wird gesucht …');
        return;
      }
      setFollow(false);
      s.locate = false;
      store.settings.set('mapLocate', false);
      stopLocate();
    }

    function updatePosition() {
      const { L } = s;
      if (!L || !s.map) return;
      s.layers.me.clearLayers();
      const pos = s.pos;
      if (!pos) {
        renderPanel();
        return;
      }
      L.circle([pos.lat, pos.lon], { radius: Math.max(pos.acc || 0, 5), color: cssVar('--map-me'), weight: 1, fillOpacity: 0.12, interactive: false }).addTo(s.layers.me);
      const el = h('span', { class: `map-me${pos.simulated ? ' is-sim' : ''}` }, Number.isFinite(pos.heading) && pos.speed > 1 ? h('span', { class: 'map-me-heading', dataset: { deg: Math.round(pos.heading) } }) : null);
      const heading = el.querySelector('.map-me-heading');
      if (heading) heading.style.setProperty('--heading', `${Math.round(pos.heading)}deg`);
      L.marker([pos.lat, pos.lon], { icon: divIcon(el, [22, 22]), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(s.layers.me);
      s.onRoute = s.route && !s.route.isEmpty ? s.route.nearest(pos.lat, pos.lon, 100_000) : null;
      renderPanel();
    }

    // Lange tippen: "Dieser Ort" (eigener Punkt, Google Maps; im Sim-Modus
    // auch Position simulieren). Doppelte Meldungen (Browser + Leaflet) abfangen.
    let lastPress = 0;
    function onLongPress(e) {
      const t = performance.now();
      if (t - lastPress < 800) return;
      lastPress = t;
      openPlaceSheet(e.latlng.lat, e.latlng.lng);
    }

    function simulateHere(lat, lon) {
      location.setSimulatedPosition(lat, lon);
      if (!unwatch) {
        s.locate = true;
        startLocate();
      }
      toast('Position simuliert (Sim-Modus)');
    }

    // Tippen nahe der Route: km-Info
    function onMapClick(e) {
      if (!s.route || s.route.isEmpty) return;
      const tolerance = 28 * metersPerPixel(e.latlng.lat, s.map.getZoom());
      const near = s.route.nearest(e.latlng.lat, e.latlng.lng, tolerance);
      if (near) openKmSheet(near.km);
    }

    // --- Unterer Bereich ---------------------------------------------------------
    function renderSummary() {
      clear(summary);
      if (!s.route || s.route.isEmpty) {
        summary.append(h('span', { class: 'map-summary-main', text: 'Keine Route geladen' }));
        return;
      }
      const r = s.route;
      if (s.onRoute && s.onRoute.dist <= ON_ROUTE_M) {
        const stage = r.stageAt(s.onRoute.km);
        summary.append(
          h('span', { class: 'map-summary-main', text: `${kmLabel(s.onRoute.km)} · noch ${formatNumber(r.totalKm - s.onRoute.km, 0)} km` }),
          h('span', { class: 'map-summary-sub', text: r.stages.length > 1 && stage ? stage.name : `${formatNumber((s.onRoute.km / r.totalKm) * 100, 0)} % geschafft` }),
        );
      } else if (s.onRoute) {
        summary.append(
          h('span', { class: 'map-summary-main', text: `${offLabel(s.onRoute.dist)}` }),
          h('span', { class: 'map-summary-sub', text: `nächster Routenpunkt ${kmLabel(s.onRoute.km)}` }),
        );
      } else {
        summary.append(
          h('span', { class: 'map-summary-main', text: `${formatNumber(r.totalKm, 0)} km${r.hasEle ? ` · +${formatNumber(r.ascent, 0)} Hm` : ''}` }),
          h('span', { class: 'map-summary-sub', text: s.pos ? 'Standort weit weg von der Route' : r.stages.length > 1 ? `${r.stages.length} Etappen` : 'Standort aus' }),
        );
      }
    }

    function renderVoraus() {
      const list = h('div', { class: 'map-voraus' });
      const mine = s.show.mine ? s.mine.filter((p) => Number.isFinite(p.km) && p.off <= 5000) : [];
      if (!s.pois.length && !mine.length) {
        list.append(
          h('p', { class: 'small muted', text: s.poiIndex ? 'Keine Versorgungspunkte entlang der Route gefunden.' : 'Noch keine Versorgung geladen.' }),
          button('Versorgung laden', { variant: 'plain', block: true, onClick: () => (window.location.hash = '#karte/routen') }),
        );
        return list;
      }
      const fromKm = s.onRoute && s.onRoute.dist <= 5000 ? s.onRoute.km : 0;
      const pois = s.pois.filter((p) => p.km >= fromKm - 0.05 && s.show.pois[p.cat] && (!s.show.only24 || p.always)).slice(0, VORAUS_COUNT);
      const items = [...pois, ...mine.filter((p) => p.km >= fromKm - 0.05)].sort((a, b) => a.km - b.km).slice(0, VORAUS_COUNT);
      if (!items.length) list.append(h('p', { class: 'small muted', text: 'Keine weiteren Punkte voraus (Filter unter Ebenen).' }));
      const now = clock.now();
      for (const p of items) {
        const eta = s.onRoute ? etaFromNow(p.km) : plannedEta(p.km);
        const at = p.mine ? { open: null, text: p.note || 'Eigener Punkt' } : eta ? hoursAt(p, eta) : hoursAt(p, now);
        const dist = s.onRoute ? `in ${formatNumber(p.km - fromKm, 1)} km` : kmLabel(p.km, 0);
        const row = h(
          'button',
          { type: 'button', class: 'row map-voraus-row', dataset: { cat: p.cat } },
          catIcon(p.cat, 'map-voraus-icon'),
          h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: poiTitle(p) }), h('span', { class: `row-sub ${at.open === true ? 'is-ok' : at.open === false ? 'is-danger' : ''}`, text: p.always ? '24 h geöffnet' : at.text })),
          h('span', { class: 'map-voraus-dist', text: dist }, eta && s.onRoute ? h('span', { class: 'map-voraus-eta', text: `~${formatElapsed(eta - now)}` }) : null),
        );
        row.addEventListener('click', () => (p.mine ? openMineSheet(p) : openPoiSheet(p)));
        list.append(row);
      }
      return list;
    }

    function renderProfil() {
      const r = s.route;
      const marks = [];
      if (r) {
        r.stages.forEach((st, i) => i && marks.push({ km: st.startKm, kind: 'stage' }));
        s.plan?.days.forEach((d) => !d.last && marks.push({ km: d.endKm, kind: 'sleep' }));
      }
      const posKm = s.onRoute && s.onRoute.dist <= 5000 ? s.onRoute.km : null;
      const range = Number.isFinite(posKm) ? { fromKm: Math.max(0, posKm - 5), toKm: Math.min(r.totalKm, posKm + 100) } : { fromKm: 0, toKm: r?.totalKm || 0 };
      queueMicrotask(() => profile.render(r, { ...range, posKm, marks }));
      return profile.el;
    }

    function renderPanel() {
      renderSummary();
      tabVoraus.classList.toggle('is-active', panelMode === 'voraus');
      tabProfil.classList.toggle('is-active', panelMode === 'profil');
      const hasRoute = s.route && !s.route.isEmpty;
      tabVoraus.hidden = !hasRoute;
      tabProfil.hidden = !hasRoute;
      clear(panelBody);
      panelBody.hidden = !hasRoute || panelMode === 'klein';
      if (panelBody.hidden) return;
      panelBody.append(panelMode === 'profil' ? renderProfil() : renderVoraus());
    }

    // --- Sheets ----------------------------------------------------------------------
    function stayAction(poi) {
      if (!s.plan || poi.cat !== 'unterkunft') return null;
      const day = s.plan.days.filter((d) => !d.last).reduce((best, d) => (!best || Math.abs(d.endKm - poi.km) < Math.abs(best.endKm - poi.km) ? d : best), null);
      if (!day || Math.abs(day.endKm - poi.km) > 80) return null;
      return {
        label: `Als Schlafstopp für Tag ${day.day}`,
        onClick: () => {
          s.planData.pins = { ...s.planData.pins, [day.day]: Math.round(poi.km * 100) / 100 };
          savePlan(s.route.id, s.planData);
          s.plan = computePlan(s.route, s.planData.settings, s.planData.pins);
          drawSleep();
          drawRoute();
          renderPanel();
          closeSheet();
          toast(`Schlafstopp Tag ${day.day}: ${poiTitle(poi)}`);
        },
      };
    }

    function openPoiSheet(p) {
      openSheet({
        title: poiTitle(p),
        content: poiDetails(p, { now: clock.now(), posKm: s.onRoute && s.onRoute.dist <= 5000 ? s.onRoute.km : null, etaFromNow, plannedEta, stayAction: stayAction(p) }),
      });
    }

    // Eigener Punkt: Details, Bearbeiten, Löschen
    function openMineSheet(p) {
      const posKm = s.onRoute && s.onRoute.dist <= 5000 ? s.onRoute.km : null;
      const sheet = openSheet({
        title: p.name,
        content: poiDetails(p, {
          now: clock.now(),
          posKm,
          etaFromNow,
          plannedEta,
          onEdit: () => {
            const name = prompt('Name des Punktes', p.name);
            if (name === null) return;
            const note = prompt('Notiz (optional)', p.note || '');
            if (note === null) return;
            sheet.close();
            updateMyPoi(p.id, { name: name.trim() || p.name, note: note.trim() });
            toast('Punkt gespeichert');
          },
          onDelete: confirmButton('Punkt löschen', 'Wirklich löschen?', () => {
            sheet.close();
            deleteMyPoi(p.id);
            toast('Punkt gelöscht');
          }),
        }),
      });
    }

    // Lange getippter Ort
    function openPlaceSheet(lat, lon) {
      const { L } = s;
      s.layers.pick.clearLayers();
      const el = h('span', { class: 'map-pick' }, icon(ICONS.pin));
      L.marker([lat, lon], { icon: divIcon(el, [30, 30], [15, 28]), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(s.layers.pick);
      const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: k }), h('span', { class: 'kv-value', text: v }));
      const rows = [kv('Koordinaten', `${lat.toFixed(5)}, ${lon.toFixed(5)}`)];
      const near = s.route && !s.route.isEmpty ? s.route.nearest(lat, lon, 50_000) : null;
      if (near) {
        rows.push(kv('Route', `${kmLabel(near.km)} · ${offLabel(near.dist)}`));
        const place = placeLabel(near.km);
        if (place && near.dist < 3000) rows.push(kv('Ort', place));
      }
      if (s.pos) rows.push(kv('Von dir', `${formatNumber(distance(s.pos.lat, s.pos.lon, lat, lon) / 1000, 1)} km Luftlinie`));
      const actions = [
        button('Eigenen Punkt hier speichern', {
          variant: 'primary',
          block: true,
          iconSvg: ICONS.star,
          onClick: async () => {
            const name = prompt('Name des Punktes (z.B. Brunnen, Freunde, Velo-Laden)', '');
            if (name === null) return;
            sheet.close();
            try {
              await addMyPoi({ lat, lon, name: name.trim() });
              toast('Eigener Punkt gespeichert');
            } catch (err) {
              toast(store.describeError(err), 4000);
            }
          },
        }),
        mapsButton(lat, lon),
      ];
      if (store.isSimMode()) actions.push(button('Position hierher simulieren', { block: true, iconSvg: ICONS.simulation, onClick: () => (sheet.close(), simulateHere(lat, lon)) }));
      const sheet = openSheet({
        title: 'Dieser Ort',
        content: [h('div', { class: 'list glass' }, rows), h('div', { class: 'stack' }, actions)],
        onClose: () => s.layers.pick.clearLayers(),
      });
    }

    function placeLabel(km) {
      const place = placeNear(s.places, km);
      return place ? `bei ${place.name}` : '';
    }

    function openKmSheet(km) {
      markKm(km, false);
      const r = s.route;
      const p = r.pointAtKm(km);
      const now = clock.now();
      const stage = r.stageAt(km);
      const eta = s.onRoute ? (km >= s.onRoute.km ? etaFromNow(km) : null) : plannedEta(km);
      const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: k }), h('span', { class: 'kv-value', text: v }));
      const rows = [kv('Position', `${kmLabel(km)} von ${formatNumber(r.totalKm, 0)} km`)];
      const place = placeLabel(km);
      if (place) rows.push(kv('Ort', place));
      if (Number.isFinite(p.ele)) rows.push(kv('Höhe', `${Math.round(p.ele)} m ü. M.`));
      if (stage && r.stages.length > 1) rows.push(kv('Etappe', stage.name));
      if (eta) rows.push(kv(s.onRoute ? 'Ankunft ca.' : 'Geplante Ankunft', dayTime(eta, now)));
      if (s.onRoute && km > s.onRoute.km) rows.push(kv('Bis dorthin', `${formatNumber(km - s.onRoute.km, 1)} km · +${formatNumber(r.ascentBetween(s.onRoute.km, km), 0)} Hm`));
      openSheet({
        title: kmLabel(km),
        content: [h('div', { class: 'list glass' }, rows), mapsButton(p.lat, p.lon)],
        onClose: () => s.layers.mark.clearLayers(),
      });
    }

    function openWaypointSheet(w) {
      const now = clock.now();
      const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: k }), h('span', { class: 'kv-value', text: v }));
      const rows = [];
      if (w.type) rows.push(kv('Art', w.type));
      if (Number.isFinite(w.km)) rows.push(kv('Position', kmLabel(w.km)));
      const eta = Number.isFinite(w.km) ? (s.onRoute ? (w.km >= s.onRoute.km ? etaFromNow(w.km) : null) : plannedEta(w.km)) : null;
      if (eta) rows.push(kv(s.onRoute ? 'Ankunft ca.' : 'Geplante Ankunft', dayTime(eta, now)));
      openSheet({ title: w.name, content: [rows.length ? h('div', { class: 'list glass' }, rows) : null, mapsButton(w.lat, w.lon)] });
    }

    function openSleepSheet(d) {
      const now = clock.now();
      const p = s.route.pointAtKm(d.endKm);
      const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: k }), h('span', { class: 'kv-value', text: v }));
      const place = placeLabel(d.endKm);
      openSheet({
        title: `Schlafstopp Tag ${d.day}`,
        content: [
          h(
            'div',
            { class: 'list glass' },
            kv('Position', `${kmLabel(d.endKm, 0)}${place ? ` · ${place}` : ''}`),
            kv('Tagesetappe', `${formatNumber(d.km, 0)} km · +${formatNumber(d.ascent, 0)} Hm`),
            kv('Ankunft', dayTime(d.arrive, now)),
            kv('Weiter', d.depart ? dayTime(d.depart, now) : '–'),
            kv('Festgelegt', d.pinned ? 'ja' : 'nein (automatisch)'),
          ),
          mapsButton(p.lat, p.lon),
          button('Im Plan bearbeiten', { block: true, onClick: () => (window.location.hash = '#plan') }),
        ],
      });
    }

    function openLayerSheet() {
      const baseId = store.settings.get('mapBase', AUTO_BASE.id);
      const baseRows = [AUTO_BASE, ...BASE_LAYERS].map((l) => {
        const input = h('input', { type: 'radio', name: 'map-base', class: 'choice', value: l.id, checked: l.id === baseId });
        input.addEventListener('change', () => {
          store.settings.set('mapBase', l.id);
          applyBase();
        });
        return h('label', { class: 'row' }, h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: l.name }), h('span', { class: 'row-sub', text: l.description })), input);
      });
      const overlays = new Set(store.settings.get('mapOverlays', []));
      const overlayRows = TILE_OVERLAYS.map(
        (o) =>
          switchRow({
            label: o.name,
            sub: o.description,
            checked: overlays.has(o.id),
            onChange: (on) => {
              const set = new Set(store.settings.get('mapOverlays', []));
              if (on) set.add(o.id);
              else set.delete(o.id);
              store.settings.set('mapOverlays', [...set]);
              applyOverlays();
            },
          }).row,
      );
      const setShow = (patch) => {
        s.show = { ...s.show, ...patch, pois: { ...s.show.pois, ...(patch.pois || {}) } };
        store.settings.set('mapShow', s.show);
      };
      const showRow = (label, sub, key, redraw) =>
        switchRow({
          label,
          sub,
          checked: !!s.show[key],
          onChange: (on) => {
            setShow({ [key]: on });
            redraw();
          },
        }).row;
      const poiRows = POI_CATEGORIES.map((c) => {
        const row = switchRow({
          label: c.plural,
          checked: !!s.show.pois[c.id],
          onChange: (on) => {
            setShow({ pois: { [c.id]: on } });
            updatePoiVisibility();
            renderPanel();
          },
        }).row;
        row.prepend(h('span', { class: 'poi-dot', dataset: { cat: c.id } }, catIcon(c.id)));
        return row;
      });
      const mineRow = showRow('Eigene Punkte', s.mine.length ? `${s.mine.length} gespeichert · lange auf die Karte tippen` : 'Lange auf die Karte tippen, um einen Punkt zu speichern', 'mine', () => (drawMine(), renderPanel()));
      mineRow.prepend(h('span', { class: 'poi-dot', dataset: { cat: 'eigen' } }, catIcon('eigen')));
      openSheet({
        title: 'Kartenebenen',
        content: [
          sectionTitle('Hintergrund'),
          h('div', { class: 'list glass' }, baseRows),
          sectionTitle('Überlagerungen'),
          h('div', { class: 'list glass' }, overlayRows),
          sectionTitle('Route'),
          h(
            'div',
            { class: 'list glass' },
            showRow('km-Marken', 'Kilometer entlang der Route', 'km', updateKmMarks),
            showRow('Etappen', 'Nummern am Etappenbeginn', 'stages', drawStages),
            showRow('Wegpunkte', 'Gates und Punkte aus den GPX-Dateien', 'waypoints', drawWaypoints),
            showRow('Schlafstopps', 'Aus dem Plan (Tagesetappen)', 'sleep', drawSleep),
            showRow('Tagesetappen färben', 'Route abwechselnd je Tag', 'days', drawRoute),
          ),
          sectionTitle('Versorgung'),
          h('div', { class: 'list glass' }, ...poiRows, showRow('Nur 24 h geöffnet', 'z.B. Tankstellen in der Nacht', 'only24', () => (drawPois(), updatePoiVisibility(), renderPanel()))),
          sectionTitle('Eigene Punkte'),
          h('div', { class: 'list glass' }, mineRow),
          h('p', { class: 'footnote', text: `Versorgung ab Zoomstufe ${POI_MIN_ZOOM} sichtbar. Eigene Punkte: lange auf die Karte tippen. Ohne Netz zeigt die Karte gespeicherte Ausschnitte – oder wähle "Ohne Hintergrund".` }),
          h('p', { class: 'footnote attribution', text: `Quellen: ${[baseLayer(store.settings.get('mapBase', AUTO_BASE.id), schemeOf(getEffectiveMode())), ...TILE_OVERLAYS.filter((o) => overlays.has(o.id))].map((l) => (l.attribution || '').replace(/<[^>]+>/g, '').replace(/&copy;/g, '©')).filter(Boolean).join(' · ')}. Versorgung: © OpenStreetMap-Mitwirkende (ODbL).` }),
        ],
      });
    }

    // --- Reaktionen ------------------------------------------------------------------------
    cleanups.push(onRoutesChange(() => loadData(false)));
    cleanups.push(
      onMyPoisChange(async () => {
        await loadMine();
        if (!alive || !s.map) return;
        drawMine();
        renderPanel();
      }),
    );
    cleanups.push(onDisplayChange(() => applyBase()));
    const resize = () => s.map?.invalidateSize();
    window.addEventListener('resize', resize);
    cleanups.push(() => window.removeEventListener('resize', resize));

    renderPanel();
    init();

    return () => {
      alive = false;
      clearTimeout(viewportTimer);
      for (const fn of cleanups.reverse()) {
        try {
          fn();
        } catch {
          // Aufräumen nie abbrechen
        }
      }
    };
  },
};
