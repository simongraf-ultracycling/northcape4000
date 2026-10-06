// Lädt die Kartenbibliothek Leaflet (ES-Modul + CSS) vom CDN – Version fest in
// js/version.js. Der Service Worker speichert beide Dateien vorab, die Karte
// startet darum auch offline.

import { LEAFLET_VERSION } from '../../version.js';

export const LEAFLET_BASE = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/`;

let loading = null;

function loadCss(href) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-leaflet]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.leaflet = LEAFLET_VERSION;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error('Karten-Stil konnte nicht geladen werden'));
    };
    // Vor app.css einfügen, damit eigene Regeln Vorrang haben
    const appCss = document.querySelector('link[href$="css/app.css"]');
    document.head.insertBefore(link, appCss || null);
  });
}

export function loadLeaflet() {
  if (!loading) {
    loading = Promise.all([loadCss(`${LEAFLET_BASE}leaflet.css`), import(`${LEAFLET_BASE}leaflet-src.esm.js`)])
      .then(([, L]) => L)
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}
