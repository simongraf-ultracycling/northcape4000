// Navigation über den Hash (#status, #karte, #plan, #statistik, #mehr,
// #mehr/darstellung, #mehr/simulation, #mehr/debug).
// Eine Ansicht ist ein Objekt { title, render(container) → Aufräum-Funktion? }.

import { clear } from './dom.js';
import { setHeader } from './shell.js';
import { displaySettingsView } from './views/display-settings.js';
import { debugView } from './views/debug.js';
import { moreView } from './views/more.js';
import { mapView, planView, statsView, statusView } from './views/placeholders.js';
import { simulationView } from './views/simulation.js';

const BACK_TO_MORE = { href: '#mehr', label: 'Mehr' };

const ROUTES = {
  status: { tab: 'status', view: statusView },
  karte: { tab: 'karte', view: mapView },
  plan: { tab: 'plan', view: planView },
  statistik: { tab: 'statistik', view: statsView },
  mehr: { tab: 'mehr', view: moreView },
  'mehr/darstellung': { tab: 'mehr', view: displaySettingsView, back: BACK_TO_MORE },
  'mehr/simulation': { tab: 'mehr', view: simulationView, back: BACK_TO_MORE },
  'mehr/debug': { tab: 'mehr', view: debugView, back: BACK_TO_MORE },
};

let cleanup = null;
let started = false;

function currentKey() {
  const key = window.location.hash.replace(/^#\/?/, '');
  return ROUTES[key] ? key : 'status';
}

function render() {
  const route = ROUTES[currentKey()];
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
  cleanup = route.view.render(main) || null;
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
