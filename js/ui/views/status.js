// Status-Tab: aktueller Status mit Dauer, nächste Schritte (grosse Knöpfe) mit
// wählbarem Zeitpunkt ("vor 5 min losgefahren"), Tageswerte, Befinden (Regler)
// und Verlauf mit Korrektur.
//
// Jeder Wechsel und jedes Befinden ist ein Ereignis (store.addEvent) – auch
// offline sofort gespeichert und später nachgeliefert. Die Oberfläche wartet
// nie auf den Server; noch nicht synchronisierte Einträge zeigen ⇅.

import { clock } from '../../clock.js';
import { formatDay, formatElapsed, formatHours, formatTime, fromDateTimeLocalValue, toDateTimeLocalValue } from '../../format.js';
import * as befinden from '../../model/befinden.js';
import { CATEGORIES, STATES, STATE_IDS, actionLabel, currentStatus, durationsBetween, intervals, nextStates, startOfDay } from '../../model/status.js';
import * as location from '../../geo/location.js';
import * as store from '../../store.js';
import { hideBanner, showBanner, toast } from '../banners.js';
import { button, clear, h, icon, sectionTitle } from '../dom.js';
import { ICONS } from '../icons.js';
import { closeSheet, openSheet } from '../sheet.js';

const UNDO_MS = 8000; // so lange lässt sich ein Statuswechsel rückgängig machen
const TAP_LOCK_MS = 1200; // Doppeltipp (Handschuhe) ignorieren
const HISTORY_SHORT = 8;
const HISTORY_LONG = 40;
const FUTURE_TOLERANCE_MS = 60_000;
const MINUTE = 60_000;
const CHOICE_TTL_MS = 5 * MINUTE; // gewählter Zeitpunkt verfällt ohne Wechsel
const POSITION_MAX_BACK_MS = 10 * MINUTE; // älter nachgetragen: Standort passt nicht mehr
const PRESETS = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120]; // "vor … min"

// "14:32" heute, sonst mit Tag davor
function dayTime(ms, now) {
  const day = formatDay(ms, now);
  return day === 'heute' ? formatTime(ms) : `${day} ${formatTime(ms)}`;
}

function stateIcon(stateId, className) {
  return icon(ICONS[STATES[stateId].icon], className);
}

// "−5 min", "−1½ h"
function agoLabel(min) {
  if (min < 60) return `−${min} min`;
  return `−${Math.floor(min / 60)}${min % 60 === 30 ? '½' : ''} h`;
}

// Letzter gültiger Statuswechsel (Zeitpunkt) – früher darf nicht nachgetragen werden
function lastChangeTime(events, now) {
  return currentStatus(events, now)?.since ?? -Infinity;
}

// Standort zum Statuswechsel nachtragen (die Oberfläche wartet nie darauf).
// Eine frische Position wird sofort genommen, sonst bis 20 s gewartet.
function attachPosition(id, backMs = 0) {
  if (store.settings.get('savePosition', true) === false || !location.isSupported()) return;
  if (backMs > POSITION_MAX_BACK_MS) {
    store.updateEvent(id, { positionError: 'backdated' });
    return;
  }
  location
    .getPosition({ maxAge: 120_000, timeout: 20_000 })
    .then((pos) => store.updateEvent(id, { position: location.toEventPosition(pos) }))
    .catch((err) => store.updateEvent(id, { positionError: err?.code || 'unavailable' }));
}

// --- Aktueller Status ----------------------------------------------------------

function statusCard() {
  const iconWrap = h('span', { class: 'status-icon', 'aria-hidden': 'true' });
  const name = h('span', { class: 'status-name', text: 'Lade …' });
  const since = h('span', { class: 'status-since' });
  const sync = h('span', { class: 'status-sync', text: '⇅ noch nicht synchronisiert', hidden: true });
  const el = h('section', { class: 'card glass status-card', dataset: { state: 'none' } }, iconWrap, h('span', { class: 'status-text' }, name, since, sync));
  let shownState;

  const render = (cur, now, loaded) => {
    const state = cur?.state || 'none';
    if (state !== shownState) {
      shownState = state;
      el.dataset.state = state;
      clear(iconWrap).append(cur ? stateIcon(state) : icon(ICONS.status));
    }
    if (!loaded) return;
    name.textContent = cur ? STATES[state].label : 'Noch kein Status';
    since.textContent = cur ? `seit ${dayTime(cur.since, now)} · ${formatElapsed(now - cur.since)}` : 'Tippe auf "Losgefahren", sobald es losgeht.';
    sync.hidden = !cur?.event.pending;
  };
  return { el, render };
}

// --- Zeitpunkt des Wechsels -------------------------------------------------------------
// Pille rechts vom Hauptknopf: "Jetzt" oder z.B. "−5 min · 14:27". Gilt für den
// nächsten Statuswechsel (alle Knöpfe), danach und nach 5 min wieder "Jetzt".

function timeChooser(getEvents) {
  let chosen = null; // { time, at }
  const big = h('span', { class: 'status-time-big', text: 'Jetzt' });
  const small = h('span', { class: 'status-time-small' });
  const el = h('button', { type: 'button', class: 'btn status-time', 'aria-label': 'Zeitpunkt des Wechsels' }, big, small);

  const valid = (now) => chosen && now - chosen.at < CHOICE_TTL_MS && chosen.time > lastChangeTime(getEvents(), now);
  const get = (now) => (valid(now) ? chosen.time : null);
  const reset = () => {
    chosen = null;
    render(clock.now());
  };
  const set = (time) => {
    const now = clock.now();
    chosen = time >= now - 1000 ? null : { time, at: now };
    render(now);
  };

  function render(now) {
    if (chosen && !valid(now)) chosen = null;
    el.classList.toggle('is-set', !!chosen);
    if (!chosen) {
      big.textContent = 'Jetzt';
      small.textContent = formatTime(now);
      return;
    }
    const min = Math.round((now - chosen.time) / MINUTE);
    big.textContent = `−${min < 60 ? `${min} min` : formatHours(now - chosen.time)}`;
    small.textContent = formatTime(chosen.time);
  }

  function openPicker() {
    const now = clock.now();
    const last = lastChangeTime(getEvents(), now);
    const pick = (time) => {
      set(time);
      closeSheet();
      if (chosen) toast(`Nächster Wechsel mit ${formatTime(time)}`);
    };
    const preset = (min) => {
      const time = now - min * MINUTE;
      const btn = button(min ? agoLabel(min) : 'Jetzt', { variant: min ? '' : 'primary', onClick: () => pick(time) });
      btn.classList.add('time-preset');
      if (min && time <= last) btn.disabled = true;
      return btn;
    };
    const input = h('input', { class: 'input', type: 'time', value: toDateTimeLocalValue(chosen?.time ?? now).slice(11, 16) });
    const apply = button('Übernehmen', {
      variant: 'primary',
      onClick: () => {
        const [hh, mm] = String(input.value).split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return toast('Bitte eine Uhrzeit wählen');
        const d = new Date(clock.now());
        d.setHours(hh, mm, 0, 0);
        let time = d.getTime();
        if (time > clock.now() + FUTURE_TOLERANCE_MS) time -= 86_400_000; // z.B. 23:50 kurz nach Mitternacht = gestern
        if (time <= last) return toast(`Liegt vor dem letzten Wechsel (${dayTime(last, clock.now())})`);
        pick(time);
      },
    });
    input.setAttribute('aria-label', 'Uhrzeit');
    openSheet({
      title: 'Zeitpunkt',
      content: [
        h('p', { class: 'small muted', text: 'Wann war der Wechsel? Z.B. vor 5 Minuten losgefahren: "−5 min" wählen, dann "Weiterfahren".' }),
        h('div', { class: 'time-presets' }, preset(0), PRESETS.map(preset)),
        h('p', { class: 'field-label', text: 'Oder Uhrzeit eingeben' }),
        h('div', { class: 'time-entry' }, input, apply),
        Number.isFinite(last) ? h('p', { class: 'footnote', text: `Frühestens nach dem letzten Wechsel (${dayTime(last, now)}). Nach 5 Minuten ohne Wechsel gilt wieder "Jetzt".` }) : null,
      ],
    });
  }

  el.addEventListener('click', openPicker);
  render(clock.now());
  return { el, render, get, reset };
}

// --- Nächste Schritte ---------------------------------------------------------------

function actions(onChoose, timeEl) {
  const main = h('div', { class: 'status-actions' });
  const others = h('div', { class: 'status-actions', hidden: true });
  const toggle = button('Anderer Status …', { variant: 'plain', block: true });
  toggle.addEventListener('click', () => {
    others.hidden = !others.hidden;
    toggle.textContent = others.hidden ? 'Anderer Status …' : 'Weniger anzeigen';
  });
  let shownState;

  const stateButton = (to, from, primary) => {
    const btn = h(
      'button',
      { type: 'button', class: `btn btn-state${primary ? ' btn-primary span-2' : ''}`, dataset: { state: to } },
      stateIcon(to),
      actionLabel(to, from),
    );
    btn.addEventListener('click', () => onChoose(to));
    return btn;
  };

  const render = (cur) => {
    const from = cur?.state || null;
    if (from === shownState) return;
    shownState = from;
    const next = nextStates(from);
    const [first, ...buttons] = next.map((to, i) => stateButton(to, from, i === 0));
    first.classList.remove('span-2');
    // Ungerade Anzahl unter dem Hauptknopf: letzten Knopf über die ganze Breite
    if (buttons.length % 2 === 1) buttons[buttons.length - 1].classList.add('span-2');
    clear(main).append(h('div', { class: 'status-primary span-2' }, first, timeEl), ...buttons);
    const rest = STATE_IDS.filter((id) => id !== from && !next.includes(id));
    clear(others).append(...rest.map((to) => stateButton(to, from, false)));
    toggle.hidden = rest.length === 0;
    others.hidden = true;
    toggle.textContent = 'Anderer Status …';
  };

  return { els: [main, toggle, others], render };
}

// --- Heute -------------------------------------------------------------------------------

function todayTiles() {
  const values = {};
  const tiles = CATEGORIES.map((c) => {
    values[c.id] = h('span', { class: 'tile-value', text: '–' });
    return h('div', { class: 'tile glass', dataset: { category: c.id } }, values[c.id], h('span', { class: 'tile-label', text: c.label }));
  });
  const el = h('div', { class: 'tiles' }, tiles);
  const render = (events, now) => {
    const sums = durationsBetween(events, startOfDay(now), now);
    for (const c of CATEGORIES) values[c.id].textContent = formatHours(sums[c.id]);
  };
  return { el, render };
}

// --- Befinden ----------------------------------------------------------------------

function moodCard() {
  const values = {};
  let dirty = false;
  const last = h('p', { class: 'small muted' });

  const rows = befinden.DIMENSIONS.map((d) => {
    const value = h('span', { class: 'mood-value' });
    const input = h('input', { type: 'range', class: 'range', min: befinden.SCALE.min, max: befinden.SCALE.max, step: 1, 'aria-label': d.label });
    const row = h(
      'div',
      { class: 'mood' },
      h('div', { class: 'mood-head' }, h('span', { class: 'mood-label', text: d.label }), value),
      input,
      h('div', { class: 'mood-scale', 'aria-hidden': 'true' }, h('span', { text: d.low }), h('span', { text: d.high })),
    );
    const paint = () => {
      const v = values[d.id];
      input.value = String(v);
      value.textContent = String(v);
      row.dataset.level = befinden.level(d, v);
      input.style.setProperty('--fill', `${((v - befinden.SCALE.min) / (befinden.SCALE.max - befinden.SCALE.min)) * 100}%`);
      input.setAttribute('aria-valuetext', `${v} von ${befinden.SCALE.max}`);
    };
    input.addEventListener('input', () => {
      values[d.id] = befinden.clampValue(input.value);
      dirty = true;
      paint();
    });
    return { d, row, paint };
  });

  const save = button('Befinden speichern', { variant: 'primary', block: true, iconSvg: ICONS.heart });
  save.addEventListener('click', () => {
    try {
      store.addEvent('befinden', { ...values });
      dirty = false;
      toast('Befinden gespeichert');
    } catch (err) {
      toast(store.describeError(err));
    }
  });

  const el = h('section', { class: 'card glass stack' }, rows.map((r) => r.row), save, last);

  const render = (events, now) => {
    const latest = befinden.latestBefinden(events);
    if (!dirty) {
      for (const { d, paint } of rows) {
        values[d.id] = befinden.clampValue(latest?.data?.[d.id]) ?? d.initial;
        paint();
      }
    }
    last.textContent = latest
      ? `Zuletzt erfasst: ${dayTime(latest.clientTime, now)} (${now - latest.clientTime < 60_000 ? 'gerade eben' : `vor ${formatElapsed(now - latest.clientTime)}`})${latest.pending ? ' · ⇅' : ''}`
      : 'Noch nie erfasst – Regler einstellen und speichern.';
  };
  return { el, render };
}

// --- Verlauf mit Korrektur -------------------------------------------------------------

function history() {
  const list = h('div', { class: 'list glass' });
  const more = button('Mehr anzeigen', { variant: 'plain', block: true });
  let limit = HISTORY_SHORT;
  let openId = null;
  let lastArgs = null;
  more.addEventListener('click', () => {
    limit = limit === HISTORY_SHORT ? HISTORY_LONG : HISTORY_SHORT;
    render(...lastArgs);
  });

  const editor = (e) => {
    const input = h('input', { class: 'input', type: 'datetime-local', value: toDateTimeLocalValue(e.clientTime) });
    const saveTime = button('Zeit speichern', { variant: 'primary' });
    const remove = button('Löschen', { variant: 'danger' });
    let armed = false;
    saveTime.addEventListener('click', () => {
      const time = fromDateTimeLocalValue(input.value);
      if (!Number.isFinite(time)) return toast('Bitte Datum und Uhrzeit wählen');
      if (time > clock.now() + FUTURE_TOLERANCE_MS) return toast('Der Zeitpunkt liegt in der Zukunft');
      store.updateEvent(e.id, { clientTime: time, originalClientTime: e.originalClientTime ?? e.clientTime });
      toast('Zeit korrigiert');
      close();
    });
    remove.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        remove.textContent = 'Wirklich löschen?';
        setTimeout(() => {
          armed = false;
          remove.textContent = 'Löschen';
        }, 4000);
        return;
      }
      store.updateEvent(e.id, { voided: true });
      toast('Eintrag gelöscht');
      close();
    });
    return h(
      'div',
      { class: 'history-editor' },
      h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Zeitpunkt' }), input),
      e.originalClientTime && h('p', { class: 'small muted', text: `Ursprünglich ${formatDay(e.originalClientTime, clock.now())} ${formatTime(e.originalClientTime)}` }),
      h('div', { class: 'btn-row' }, saveTime, remove),
      button('Abbrechen', { variant: 'plain', block: true, onClick: () => close() }),
    );
  };

  const close = () => {
    openId = null;
    render(...lastArgs);
  };

  const row = (e, durations, now) => {
    const isStatus = e.type === 'status';
    const day = formatDay(e.clientTime, now);
    const dur = durations.get(e.id);
    const sub = isStatus ? (dur?.running ? `läuft seit ${formatElapsed(dur.ms)}` : formatElapsed(dur?.ms)) : befinden.summary(e.data);
    const btn = h(
      'button',
      { type: 'button', class: 'row history-row', dataset: { state: isStatus ? e.data.state : 'befinden' }, 'aria-expanded': String(openId === e.id) },
      h('span', { class: 'history-time' }, day !== 'heute' && h('span', { class: 'history-day', text: day }), formatTime(e.clientTime)),
      isStatus ? stateIcon(e.data.state, 'history-icon') : icon(ICONS.heart, 'history-icon'),
      h(
        'span',
        { class: 'row-text' },
        h('span', { class: 'row-label', text: isStatus ? STATES[e.data.state].label : 'Befinden' }),
        h('span', { class: 'row-sub', text: sub }),
      ),
      e.pending && h('span', { class: 'history-pending', text: '⇅', title: 'noch nicht synchronisiert' }),
    );
    btn.addEventListener('click', () => {
      openId = openId === e.id ? null : e.id;
      render(...lastArgs);
    });
    return openId === e.id ? [btn, editor(e)] : [btn];
  };

  // Während der Bearbeitung nicht neu zeichnen (Eingabe bliebe sonst nicht stehen)
  const render = (events, now) => {
    lastArgs = [events, now];
    if (openId && list.querySelector('.history-editor')?.contains(document.activeElement)) return;
    const items = events.filter((e) => (e.type === 'status' && STATES[e.data?.state]) || e.type === 'befinden').filter((e) => !e.voided);
    items.sort((a, b) => b.clientTime - a.clientTime);
    if (openId && !items.some((e) => e.id === openId)) openId = null;
    const durations = new Map();
    for (const part of intervals(events, now)) durations.set(part.event.id, { ms: part.end - part.start, running: part.end === now });
    const shown = items.slice(0, limit);
    clear(list).append(...(shown.length ? shown.flatMap((e) => row(e, durations, now)) : [h('p', { class: 'row muted', text: 'Noch keine Einträge.' })]));
    more.hidden = items.length <= HISTORY_SHORT;
    more.textContent = limit === HISTORY_SHORT ? `Mehr anzeigen (${Math.min(items.length, HISTORY_LONG)})` : 'Weniger anzeigen';
  };

  return { els: [list, more], render };
}

// --- Ansicht ---------------------------------------------------------------------------

export const statusView = {
  title: 'Status',
  render(container) {
    let events = [];
    let loaded = false;
    let tapLocked = false;
    let undoTimer = null;

    const card = statusCard();
    const today = todayTiles();
    const mood = moodCard();
    const hist = history();

    const timeChoice = timeChooser(() => events);
    const choose = (to) => {
      if (tapLocked) return;
      const now = clock.now();
      const at = timeChoice.get(now);
      const from = currentStatus(events, now)?.state || null;
      if (to === from) return;
      tapLocked = true;
      setTimeout(() => (tapLocked = false), TAP_LOCK_MS);
      let id;
      try {
        ({ id } = store.addEvent('status', { state: to, from }, { clientTime: at ?? undefined }));
      } catch (err) {
        toast(store.describeError(err));
        return;
      }
      attachPosition(id, at ? now - at : 0);
      timeChoice.reset();
      clearTimeout(undoTimer);
      showBanner('undo-status', {
        title: `${STATES[to].label} gespeichert${at ? ` (${formatTime(at)})` : ''}`,
        sub: 'Tippen zum Rückgängigmachen',
        iconSvg: ICONS.undo,
        onTap: () => {
          clearTimeout(undoTimer);
          hideBanner('undo-status');
          store.updateEvent(id, { voided: true });
          toast('Rückgängig gemacht');
        },
      });
      undoTimer = setTimeout(() => hideBanner('undo-status'), UNDO_MS);
    };
    const act = actions(choose, timeChoice.el);

    // Schnell veränderliche Teile (Dauer) jede Sekunde, der Rest bei neuen Daten
    const tick = () => {
      const now = clock.now();
      const cur = currentStatus(events, now);
      card.render(cur, now, loaded);
      if (!loaded) return;
      act.render(cur);
      timeChoice.render(now);
      today.render(events, now);
    };
    const renderAll = () => {
      tick();
      if (!loaded) return;
      const now = clock.now();
      mood.render(events, now);
      hist.render(events, now);
    };

    container.append(
      h(
        'div',
        { class: 'stack' },
        card.el,
        ...act.els,
        sectionTitle('Heute'),
        today.el,
        sectionTitle('Befinden'),
        mood.el,
        sectionTitle('Verlauf'),
        ...hist.els,
      ),
    );
    renderAll();

    const unsubscribe = store.subscribeEvents((list) => {
      events = list;
      loaded = true;
      renderAll();
    });
    const timer = setInterval(tick, 1000);
    // Verlauf ("läuft seit …") und "zuletzt erfasst" gelegentlich auffrischen
    const slowTimer = setInterval(() => loaded && (mood.render(events, clock.now()), hist.render(events, clock.now())), 30_000);
    const offClock = clock.onChange(renderAll);

    return () => {
      unsubscribe();
      clearInterval(timer);
      clearInterval(slowTimer);
      offClock();
      clearTimeout(undoTimer);
      hideBanner('undo-status');
    };
  },
};
