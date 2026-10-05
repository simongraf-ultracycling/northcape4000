// App-Hülle: Kopfzeile (Titel, Zurück- und Verbindungs-Pille), Sim-Leiste,
// Update-Banner und Hinweis bei gestörtem lokalem Speicher.

import { clock } from '../clock.js';
import { APP_NAME } from '../config.js';
import { formatDateTime, formatNumber } from '../format.js';
import { onLogChange } from '../log.js';
import * as store from '../store.js';
import { applyUpdate, getUpdateState, onUpdateStateChange } from '../update.js';
import { hideBanner, showBanner } from './banners.js';
import { clear, h, icon } from './dom.js';
import { ICONS } from './icons.js';

const QUEUE_POLL_MS = 20_000;
// iOS: Verbindung zu IndexedDB kann nach langem Hintergrund verloren gehen
const FATAL_STORAGE = /Indexed ?Database server lost|IndexedDB.*(closed|lost)|Connection to Indexed Database/i;

let queuedWrites = 0;
let refreshing = false;

export function connectionView(s) {
  if (s.offlineSimulated) return { cls: 'is-sim', text: 'Offline' };
  if (!s.online) return { cls: 'is-offline', text: 'Offline' };
  switch (s.connection) {
    case 'connected':
    case 'sim':
      return { cls: 'is-ok', text: 'Online' };
    case 'error':
      return { cls: 'is-danger', text: 'Fehler' };
    case 'offline':
      return { cls: 'is-offline', text: 'Offline' };
    default:
      return { cls: 'is-warn', text: 'Verbinde …' };
  }
}

function renderStatus(s) {
  const btn = document.getElementById('header-status');
  const conn = connectionView(s);
  const pending = Math.max(s.pendingSession, queuedWrites);
  const pills = [h('span', { class: `pill ${conn.cls}` }, h('span', { class: 'dot' }), h('span', { class: 'label', text: conn.text }))];
  if (pending > 0) pills.push(h('span', { class: 'pill is-warn' }, h('span', { class: 'label', text: `⇅ ${pending}` })));
  clear(btn).append(h('span', { class: 'chip glass' }, ...pills));
  btn.setAttribute('aria-label', `${conn.text}${s.offlineSimulated ? ' (simuliert)' : ''}${pending ? `, ${pending} Einträge nicht synchronisiert` : ''} – Details im Debug-Bereich`);
  // Simuliertes Offline deutlich markieren (wie der Sim-Modus)
  document.documentElement.classList.toggle('offline-sim', s.offlineSimulated);
}

// Warteschlange im lokalen Speicher (auch Einträge aus früheren Sitzungen)
async function refreshQueue() {
  if (refreshing || !store.getStatus().ready || document.visibilityState !== 'visible') return;
  refreshing = true;
  try {
    const info = await store.getStorageInfo();
    queuedWrites = info.queuedWrites || 0;
    renderStatus(store.getStatus());
  } catch {
    // Anzeige ist nur Zusatz
  } finally {
    refreshing = false;
  }
}

function renderSimBar() {
  const el = document.getElementById('sim-bar-time');
  const sim = clock.getSimulation();
  el.textContent = sim
    ? `· ${formatDateTime(clock.now(), { weekday: true })} · ×${formatNumber(sim.factor, 2)}`
    : '· Echtzeit';
}

export function setHeader({ title, back }) {
  document.getElementById('header-title').textContent = title;
  document.title = `${store.isSimMode() ? 'SIM · ' : ''}${title} – ${APP_NAME}`;
  const header = document.getElementById('app-header');
  const backBtn = document.getElementById('header-back');
  header.classList.toggle('has-back', !!back);
  backBtn.hidden = !back;
  if (back) {
    clear(backBtn).append(h('span', { class: 'chip chip-round glass' }, icon(ICONS.chevronLeft)));
    backBtn.setAttribute('aria-label', `Zurück zu ${back.label}`);
    backBtn.onclick = () => {
      window.location.hash = back.href;
    };
  }
}

export function initShell() {
  // Feine Linie unter dem Titel, sobald Inhalt darunter scrollt
  const onScroll = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 2);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  document.getElementById('header-status').addEventListener('click', () => {
    window.location.hash = '#mehr/debug';
  });
  store.onStatusChange((s) => {
    renderStatus(s);
    if (s.ready) refreshQueue();
  });
  renderStatus(store.getStatus());
  setInterval(refreshQueue, QUEUE_POLL_MS);
  document.addEventListener('visibilitychange', refreshQueue);

  if (store.isSimMode()) {
    renderSimBar();
    clock.onChange(renderSimBar);
    setInterval(renderSimBar, 1000);
  }

  const renderUpdate = (u) => {
    if (u.updateReady) {
      showBanner('update', {
        title: 'Neue Version – tippen zum Laden',
        sub: `Version ${u.waitingVersion} ist bereit`,
        iconSvg: ICONS.download,
        onTap: applyUpdate,
      });
    } else {
      hideBanner('update');
    }
  };
  onUpdateStateChange(renderUpdate);
  renderUpdate(getUpdateState());

  onLogChange((entries) => {
    const last = entries[entries.length - 1];
    if (last && last.level !== 'info' && FATAL_STORAGE.test(last.msg)) {
      showBanner('fatal', {
        title: 'Datenspeicher gestört – tippen zum Neuladen',
        sub: 'Erfasste Einträge bleiben erhalten.',
        iconSvg: ICONS.warning,
        variant: 'danger',
        onTap: () => window.location.reload(),
      });
    }
  });
}
