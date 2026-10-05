// Einstieg der App.

import { clock } from './clock.js';
import { installErrorHandlers, logEntry } from './log.js';
import * as store from './store.js';
import { initDisplay } from './ui/display.js';
import { button, clear, h } from './ui/dom.js';
import { startRouter, stopRouter } from './ui/router.js';
import { initShell } from './ui/shell.js';
import { renderLogin } from './ui/views/login.js';
import { initServiceWorker } from './update.js';

installErrorHandlers();

// iOS zeigt :active-Stile (Druck-Feedback) nur mit einem Touch-Listener
document.addEventListener('touchstart', () => {}, { passive: true });

let loginCleanup = null;

function startSimMode() {
  store.setSimMode(true);
  window.location.hash = '#status';
  window.location.reload();
}

function showApp() {
  loginCleanup?.();
  loginCleanup = null;
  const login = document.getElementById('login');
  login.hidden = true;
  clear(login);
  document.body.classList.remove('logged-out');
  startRouter();
}

function showLogin() {
  stopRouter();
  document.body.classList.add('logged-out');
  const login = clear(document.getElementById('login'));
  login.hidden = false;
  loginCleanup?.();
  loginCleanup = renderLogin(login, { onSimMode: startSimMode });
}

function route() {
  if (store.getMode() === 'firebase' && !store.getUser()) showLogin();
  else showApp();
}

function showStarting() {
  clear(document.getElementById('view')).append(h('section', { class: 'card glass' }, h('p', { class: 'muted', text: 'Starte …' })));
}

function showStartError(err) {
  const firstStart = !navigator.onLine;
  clear(document.getElementById('view')).append(
    h(
      'section',
      { class: 'card glass stack' },
      h('h2', { text: 'Datenverbindung konnte nicht starten' }),
      h('p', {
        class: 'muted',
        text: firstStart
          ? 'Das Gerät ist offline und die Firebase-Dateien sind noch nicht gespeichert. Beim allerersten Start braucht die App Netz.'
          : 'Firebase konnte nicht geladen werden. Details unter Mehr → Debug (nach Neustart).',
      }),
      h('p', { class: 'small muted', text: err?.message || String(err) }),
      button('Neu laden', { variant: 'primary', block: true, onClick: () => window.location.reload() }),
      store.getMode() === 'firebase' && button('Sim-Modus starten', { block: true, onClick: startSimMode }),
    ),
  );
}

async function main() {
  initDisplay();
  clock.setSimEnabled(store.isSimMode());
  initShell();
  showStarting();

  // Hülle steht → Notfall-Anzeige von js/boot.js nicht mehr nötig
  window.__ncStarted = true;
  document.getElementById('boot-fallback').hidden = true;

  initServiceWorker();

  try {
    await store.initStore();
  } catch (err) {
    logEntry('error', `Datenschicht konnte nicht starten: ${err?.message || err}`, { stack: err?.stack, source: 'app' });
    showStartError(err);
    return;
  }

  store.onAuthChange(route);
  route();
}

main();
