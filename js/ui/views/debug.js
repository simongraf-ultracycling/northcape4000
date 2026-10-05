// Mehr → Debug: Zustand, Tests, Fehlerprotokoll.

import { clock } from '../../clock.js';
import { formatBytes, formatDateTime, formatDuration, formatTime } from '../../format.js';
import { clearLog, formatLogText, getLog, onLogChange } from '../../log.js';
import * as store from '../../store.js';
import { checkForUpdate, clearCacheAndReload, getUpdateState, onUpdateStateChange } from '../../update.js';
import { FIREBASE_SDK_VERSION, VERSION } from '../../version.js';
import { toast } from '../banners.js';
import { button, clear, h, kv, sectionTitle } from '../dom.js';
import { ICONS } from '../icons.js';
import { connectionView } from '../shell.js';

const MARKS = { wait: '⏳', ok: '✓', fail: '✗', info: '•' };
const MARK_CLASSES = { wait: 'is-warn', ok: 'is-ok', fail: 'is-danger', info: 'is-muted' };
const LOCAL_TIMEOUT_MS = 10_000;

// Ergebnis-Kasten mit Zeilen, deren Zustand sich ändern kann
function resultBox() {
  const el = h('div', { class: 'result', hidden: true });
  return {
    el,
    reset() {
      clear(el);
      el.hidden = false;
    },
    line(text, state = 'wait') {
      const mark = h('span', { class: 'mark' });
      const label = h('span');
      const set = (t, s) => {
        label.textContent = t;
        mark.textContent = MARKS[s];
        mark.className = `mark ${MARK_CLASSES[s]}`;
      };
      set(text, state);
      el.append(h('div', { class: 'result-line' }, mark, label));
      return { set };
    },
  };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { class: 'input', readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// --- Zustand -----------------------------------------------------------------

function connectionText(s) {
  if (!s.ready) return 'startet …';
  if (s.mode === 'sim') return s.connection === 'sim' ? 'Simulator verbunden' : 'Simulator offline';
  switch (s.connection) {
    case 'connected':
      return 'Firebase verbunden';
    case 'connecting':
      return 'verbinde … (noch keine Serverantwort)';
    case 'offline':
      return s.offlineSimulated ? 'getrennt (Offline simuliert)' : 'offline – Einträge werden lokal gesammelt';
    case 'error':
      return `Fehler: ${s.connectionDetail}`;
    default:
      return s.connection;
  }
}

function statusSection(cleanups) {
  const rows = {
    version: kv('App-Version'),
    mode: kv('Modus'),
    network: kv('Netz'),
    sw: kv('Service Worker'),
    connection: kv('Datenverbindung'),
    login: kv('Anmeldung'),
    pending: kv('Nicht synchronisiert'),
    cache: kv('Offline-Datenspeicher'),
    storage: kv('Speicherbelegung'),
    persisted: kv('Speicher dauerhaft'),
    time: kv('Gerätezeit'),
    appTime: clock.isSimulated() ? kv('App-Zeit (simuliert)') : null,
  };

  const persistButton = button('Dauerhaften Speicher anfordern', {
    block: true,
    onClick: async () => {
      const granted = await store.requestPersistentStorage();
      toast(granted ? 'Speicher ist jetzt dauerhaft' : 'Vom Browser (noch) nicht gewährt');
      renderStorage();
    },
  });
  persistButton.hidden = true;

  rows.version.set(VERSION, '', `Firebase SDK ${FIREBASE_SDK_VERSION}`);

  function renderStatus(s = store.getStatus()) {
    rows.mode.set(s.mode === 'sim' ? 'Sim (lokaler Simulator)' : 'Firebase', s.mode === 'sim' ? 'is-sim' : '');
    if (!s.online) rows.network.set('Offline', 'is-offline');
    else if (s.offlineSimulated) rows.network.set('Online, Offline simuliert', 'is-sim');
    else rows.network.set('Online', 'is-ok');
    rows.connection.set(connectionText(s), connectionView(s).cls);
    if (s.mode === 'sim') rows.login.set('nicht nötig (Sim)', 'is-sim');
    else if (!s.user) rows.login.set('nicht angemeldet', 'is-danger');
    else rows.login.set(s.user.email, s.user.isOwner ? 'is-ok' : 'is-danger', s.user.isOwner ? 'Besitzer' : 'NICHT der Besitzer');
  }

  function renderSw(u = getUpdateState()) {
    if (!u.supported) return rows.sw.set('nicht unterstützt', 'is-danger');
    if (u.error) return rows.sw.set(`Fehler: ${u.error}`, 'is-danger');
    const text = u.activeVersion ? `aktiv, v${u.activeVersion}` : u.installingVersion ? `installiert v${u.installingVersion} …` : 'nicht registriert';
    let sub = '';
    if (u.updateReady) sub = `v${u.waitingVersion} wartet auf Aktivierung`;
    else if (u.installingVersion && u.activeVersion) sub = `lädt v${u.installingVersion}`;
    else if (u.activeVersion && !u.controlled) sub = 'gilt ab nächstem Start';
    rows.sw.set(text, u.updateReady ? 'is-warn' : u.activeVersion ? 'is-ok' : 'is-warn', sub);
  }

  async function renderStorage() {
    const info = await store.getStorageInfo();
    const session = store.getStatus().pendingSession;
    const queued = info.queuedWrites;
    const total = Math.max(session, queued ?? 0);
    rows.pending.set(String(total), total ? 'is-warn' : 'is-ok', `Sitzung ${session} · Speicher ${queued ?? 'unbekannt'}`);
    if (info.persistentCache === true) rows.cache.set('aktiv', 'is-ok', info.cacheKind);
    else if (info.persistentCache === false) rows.cache.set('nicht aktiv!', 'is-danger', 'Daten nur im Arbeitsspeicher');
    else rows.cache.set('unbekannt');
    rows.storage.set(Number.isFinite(info.usage) ? formatBytes(info.usage) : 'unbekannt', '', Number.isFinite(info.quota) ? `von ${formatBytes(info.quota)}` : '');
    rows.persisted.set(info.persisted === true ? 'ja' : info.persisted === false ? 'nein' : 'unbekannt', info.persisted ? 'is-ok' : 'is-warn');
    persistButton.hidden = info.persisted !== false;
  }

  function renderTime() {
    rows.time.set(formatDateTime(clock.realNow(), { seconds: true }));
    rows.appTime?.set(formatDateTime(clock.now(), { seconds: true }), 'is-sim');
  }

  renderStatus();
  renderSw();
  renderTime();
  renderStorage();
  cleanups.push(store.onStatusChange(renderStatus), onUpdateStateChange(renderSw));
  const timeTimer = setInterval(renderTime, 1000);
  const storageTimer = setInterval(renderStorage, 4000);
  cleanups.push(() => clearInterval(timeTimer), () => clearInterval(storageTimer));

  return [
    sectionTitle('Zustand'),
    h(
      'div',
      { class: 'list glass' },
      Object.values(rows)
        .filter(Boolean)
        .map((r) => r.row),
    ),
    persistButton,
  ];
}

// --- Tests -----------------------------------------------------------------------

function pingTest(cleanups) {
  const result = resultBox();
  const recent = h('div', { class: 'result' });

  const run = () => {
    result.reset();
    const started = clock.realNow();
    let write;
    try {
      write = store.debug.writePing();
    } catch (err) {
      result.line(store.describeError(err), 'fail');
      return;
    }
    result.line(`Test-Eintrag ${write.id.slice(0, 6)}… in races/{raceId}/debug`, 'info');
    const local = result.line('wird lokal gespeichert …');
    const server = result.line('wartet auf Server …');
    withTimeout(write.local, LOCAL_TIMEOUT_MS).then(
      () => local.set(`lokal gespeichert (${formatTime(clock.realNow(), { seconds: true })})`, 'ok'),
      (err) => local.set(`lokal NICHT gespeichert: ${store.describeError(err)}`, 'fail'),
    );
    write.server.then(
      () => server.set(`beim Server angekommen nach ${formatDuration(clock.realNow() - started)}`, 'ok'),
      (err) => server.set(`vom Server abgelehnt: ${store.describeError(err)}`, 'fail'),
    );
  };

  const renderRecent = (pings) => {
    clear(recent);
    recent.append(h('div', { class: 'result-line muted', text: 'Letzte Test-Einträge (auch aus früheren Sitzungen):' }));
    if (!pings.length) recent.append(h('div', { class: 'result-line muted', text: 'noch keine' }));
    for (const p of pings) {
      const synced = !p.pending && p.serverTime;
      const text = synced
        ? `${formatDateTime(p.clientTime, { seconds: true })} → Server ${formatTime(p.serverTime, { seconds: true })}`
        : `${formatDateTime(p.clientTime, { seconds: true })} – noch nicht beim Server`;
      recent.append(
        h(
          'div',
          { class: 'result-line' },
          h('span', { class: `mark ${synced ? 'is-ok' : 'is-warn'}`, text: synced ? MARKS.ok : MARKS.wait }),
          h('span', { text }),
        ),
      );
    }
  };
  cleanups.push(store.debug.subscribePings(renderRecent, { limit: 5 }));

  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'Test-Eintrag' }),
    h('p', { class: 'muted small', text: 'Schreibt einen Ping und zeigt, ob er lokal gespeichert und ob er beim Server angekommen ist. Offline bleibt er "ausstehend" und wird später nachgeliefert.' }),
    button('Test-Eintrag schreiben', { variant: 'primary', block: true, onClick: run }),
    result.el,
    recent,
  );
}

function privateTest() {
  const result = resultBox();

  const run = async () => {
    result.reset();
    const token = store.newId();
    let write;
    try {
      write = store.setPrivate('test', { text: 'Privat-Test', token });
    } catch (err) {
      result.line(store.describeError(err), 'fail');
      return;
    }
    const local = result.line('Schreiben: lokal speichern …');
    const server = result.line('Schreiben: wartet auf Server …');
    const read = result.line('Lesen: wartet …');

    const readBack = async () => {
      try {
        const doc = await store.debug.readPrivate('test');
        const matches = doc.value?.token === token;
        const source = doc.fromCache ? 'lokaler Speicher' : 'Server';
        read.set(matches ? `Lesen: Inhalt stimmt (Quelle: ${source})` : `Lesen: anderer Inhalt (Quelle: ${source})`, matches ? 'ok' : 'fail');
      } catch (err) {
        read.set(`Lesen fehlgeschlagen: ${store.describeError(err)}`, 'fail');
      }
    };

    try {
      await withTimeout(write.local, LOCAL_TIMEOUT_MS);
      local.set('Schreiben: lokal gespeichert', 'ok');
      await readBack();
    } catch (err) {
      local.set(`Schreiben: lokal NICHT gespeichert – ${store.describeError(err)}`, 'fail');
    }
    write.server.then(
      () => {
        server.set('Schreiben: beim Server angekommen', 'ok');
        readBack();
      },
      (err) => server.set(`Schreiben: vom Server abgelehnt – ${store.describeError(err)}`, 'fail'),
    );
  };

  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'Privat-Test' }),
    h('p', { class: 'muted small', text: 'Schreibt und liest races/{raceId}/private/test. Dieser Bereich ist nur für den Besitzer lesbar und bleibt nach dem Laden offline verfügbar.' }),
    button('Privat-Test', { variant: 'primary', block: true, onClick: run }),
    result.el,
  );
}

function followerTest() {
  const result = resultBox();
  const run = async () => {
    result.reset();
    if (!navigator.onLine) {
      result.line('Braucht Netz – bitte online nochmals versuchen.', 'fail');
      return;
    }
    const busy = result.line('prüfe ohne Login …');
    try {
      const checks = await store.debug.checkFollowerAccess();
      result.reset();
      for (const c of checks) result.line(`${c.label}: ${c.actual} (erwartet: ${c.expected})`, c.ok ? 'ok' : 'fail');
      const allOk = checks.every((c) => c.ok);
      result.line(allOk ? 'Regeln wirken wie vorgesehen.' : 'Abweichung! Regeln in der Firebase-Konsole prüfen.', allOk ? 'ok' : 'fail');
    } catch (err) {
      busy.set(`Fehler: ${store.describeError(err)}`, 'fail');
    }
  };
  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'Follower-Sicht prüfen' }),
    h('p', { class: 'muted small', text: 'Fragt Firestore ohne Anmeldung ab – wie ein Follower mit raceId. Privates muss verboten sein. Braucht Netz.' }),
    button('Follower-Sicht prüfen', { block: true, onClick: run }),
    result.el,
  );
}

function appTools() {
  const result = resultBox();
  const check = async () => {
    result.reset();
    const line = result.line('suche nach Update …');
    const r = await checkForUpdate();
    const texts = {
      current: [`Aktuell (Server: v${r.server})`, 'ok'],
      update: [`Neue Version v${r.server} wird geladen – Banner erscheint, sobald bereit.`, 'ok'],
      offline: ['Offline – keine Prüfung möglich.', 'fail'],
      unsupported: ['Service Worker nicht aktiv.', 'fail'],
      error: [`Fehler: ${r.error}`, 'fail'],
    };
    line.set(...(texts[r.status] || [r.status, 'info']));
  };
  const clearCache = () => {
    const warning = navigator.onLine ? '' : '\n\nACHTUNG: Kein Netz! Ohne Netz startet die App danach nicht mehr.';
    if (!window.confirm(`App-Cache leeren und neu laden? Erfasste Daten bleiben erhalten.${warning}`)) return;
    clearCacheAndReload();
  };
  return h(
    'section',
    { class: 'card glass stack' },
    h('h2', { text: 'App' }),
    button('Nach Update suchen', { block: true, iconSvg: ICONS.refresh, onClick: check }),
    result.el,
    button('Cache leeren und neu laden', { variant: 'danger', block: true, onClick: clearCache }),
  );
}

// --- Fehlerprotokoll ------------------------------------------------------------

function logSection(cleanups) {
  const list = h('div', { class: 'log-list' });
  const count = h('span', { class: 'muted small' });

  const render = (entries = getLog()) => {
    clear(list);
    count.textContent = `${entries.length} von max. 200 Einträgen`;
    if (!entries.length) list.append(h('p', { class: 'muted small', text: 'Keine Einträge.' }));
    for (const e of entries.slice().reverse()) {
      list.append(
        h(
          'div',
          { class: `log-entry level-${e.level}` },
          h(
            'div',
            { class: 'log-meta' },
            h('span', { class: 'log-level', text: e.level.toUpperCase() }),
            ` · ${formatDateTime(e.t, { seconds: true })} · v${e.v}${e.sim ? ' · SIM' : ''}${e.count > 1 ? ` · ${e.count}×` : ''}${e.source ? ` · ${e.source}` : ''}`,
          ),
          h('div', { text: e.msg }),
          e.stack && h('details', {}, h('summary', { text: 'Details' }), h('pre', { text: e.stack })),
        ),
      );
    }
  };
  render();
  cleanups.push(onLogChange(render));

  const copy = async () => toast((await copyText(formatLogText())) ? 'Protokoll kopiert' : 'Kopieren nicht möglich');
  const wipe = () => {
    if (window.confirm('Fehlerprotokoll leeren?')) clearLog();
  };
  const testError = () =>
    setTimeout(() => {
      throw new Error('Testfehler (absichtlich ausgelöst)');
    });

  return [
    sectionTitle('Fehlerprotokoll'),
    h(
      'section',
      { class: 'card glass stack' },
      button('Protokoll kopieren', { variant: 'primary', block: true, iconSvg: ICONS.copy, onClick: copy }),
      h('div', { class: 'btn-row' }, button('Leeren', { onClick: wipe }), button('Testfehler', { onClick: testError })),
      count,
      list,
    ),
  ];
}

export const debugView = {
  title: 'Debug',
  render(container) {
    const cleanups = [];
    const firebase = store.getMode() === 'firebase';
    container.append(
      h(
        'div',
        { class: 'stack' },
        ...statusSection(cleanups),
        sectionTitle('Tests'),
        pingTest(cleanups),
        privateTest(),
        firebase && followerTest(),
        appTools(),
        ...logSection(cleanups),
      ),
    );
    return () => cleanups.forEach((fn) => fn());
  },
};
