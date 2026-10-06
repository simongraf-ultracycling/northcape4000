// Navigation über den Hash (#status, #karte, #karte/routen, #plan, #statistik,
// #mehr, #mehr/darstellung, #mehr/simulation, #mehr/debug), optional mit
// Parametern: #karte?km=412.
// Eine Ansicht ist ein Objekt { title, render(container, params) → Aufräum-Funktion? }.

import { clear } from './dom.js';
import { setHeader } from './shell.js';
import { closeSheet } from './sheet.js';
import { displaySettingsView } from './views/display-settings.js';
import { debugView } from './views/debug.js';
import { moreView } from './views/more.js';
import { mapView } from './views/map.js';
import { statsView } from './views/placeholders.js';
import { planView } from './views/plan.js';
import { routesView } from './views/routes.js';
import { simulationView } from './views/simulation.js';
import { statusView } from './views/status.js';

const BACK_TO_MORE = { href: '#mehr', label: 'Mehr' };
const BACK_TO_MAP = { href: '#karte', label: 'Karte' };

const ROUTES = {
  status: { tab: 'status', view: statusView },
  karte: { tab: 'karte', view: mapView },
  'karte/routen': { tab: 'karte', view: routesView, back: BACK_TO_MAP },
  plan: { tab: 'plan', view: planView },
  statistik: { tab: 'statistik', view: statsView },
  mehr: { tab: 'mehr', view: moreView },
  'mehr/darstellung': { tab: 'mehr', view: displaySettingsView, back: BACK_TO_MORE },
  'mehr/simulation': { tab: 'mehr', view: simulationView, back: BACK_TO_MORE },
  'mehr/debug': { tab: 'mehr', view: debugView, back: BACK_TO_MORE },
};

let cleanup = null;
let started = false;

function current() {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { key: ROUTES[path] ? path : 'status', params: new URLSearchParams(query) };
}

function render() {
  const { key, params } = current();
  const route = ROUTES[key];
  closeSheet();
  try {
    cleanup?.();
  } catch (err) {
    console.error('Aufräumen der Ansicht fehlgeschlagen', err);
  }
  cleanup = null;

  const main = clear(document.getElementById('view'));
  setHeader({ title: route.view.title, back: route.back });
  for (const tab of document.querySelectorAll('#tabbar .tab')) {
    if (tab.dataset.tab === route.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  document.body.dataset.view = key;
  cleanup = route.view.render(main, params) || null;
}

export function startRouter() {
  if (!started) {
    started = true;
    window.addEventListener('hashchange', render);
  }
  render();
}

export function stopRouter() {
  try {
    cleanup?.();
  } finally {
    cleanup = null;
  }
}
