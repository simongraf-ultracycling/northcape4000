/* Service Worker – Bikepacking-App
 *
 * Version und Firebase-SDK-Version kommen als URL-Parameter (sw.js?v=…&fb=…),
 * gesetzt von js/update.js aus js/version.js – der EINZIGEN Stelle der
 * Versionsnummer. Cache-Name: nc4000-<Version>.
 *
 * - install:  alle App-Dateien (frisch vom Server) und die Firebase-SDK-Dateien
 *             vorab cachen. Danach wartet die neue Version, bis der Benutzer
 *             das Update-Banner antippt (Nachricht SKIP_WAITING).
 * - activate: alte nc4000-Caches löschen.
 * - fetch:    App- und SDK-Dateien aus dem Cache (Cache zuerst), alles andere
 *             (Firestore, Anmeldung) direkt ans Netz.
 *
 * NEUE APP-DATEIEN MÜSSEN IN APP_FILES EINGETRAGEN WERDEN
 * (Prüfung: node tools/check.mjs).
 */

const params = new URL(self.location.href).searchParams;
const VERSION = params.get('v');
const FIREBASE_SDK_VERSION = params.get('fb');
const CACHE_PREFIX = 'nc4000-';
const CACHE = CACHE_PREFIX + VERSION;

const APP_FILES = [
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/boot.js',
  './js/app.js',
  './js/version.js',
  './js/config.js',
  './js/local.js',
  './js/clock.js',
  './js/log.js',
  './js/format.js',
  './js/store.js',
  './js/store/firebase-backend.js',
  './js/store/sim-backend.js',
  './js/store/sim-seed.js',
  './js/update.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/display.js',
  './js/ui/banners.js',
  './js/ui/shell.js',
  './js/ui/router.js',
  './js/ui/views/login.js',
  './js/ui/views/placeholders.js',
  './js/ui/views/more.js',
  './js/ui/views/display-settings.js',
  './js/ui/views/simulation.js',
  './js/ui/views/debug.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
const FIREBASE_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => FIREBASE_BASE + f);

self.addEventListener('install', (event) => {
  event.waitUntil(install());
});

async function install() {
  if (!VERSION || !FIREBASE_SDK_VERSION) throw new Error('sw.js ohne Versionsangabe registriert');
  // Zuerst in einen Zwischen-Cache laden und prüfen; erst danach übernehmen.
  // So bleibt ein bestehender Cache bei einem Fehlschlag unangetastet.
  const stagingName = `${CACHE}-staging`;
  await caches.delete(stagingName);
  const staging = await caches.open(stagingName);
  try {
    // App-Dateien frisch laden: am Browser-Cache vorbei (reload) und dank
    // ?v=<Version> auch am CDN-Cache von GitHub Pages vorbei. Gespeichert wird
    // unter der normalen Adresse (neue Response ohne den Parameter in der URL).
    await Promise.all(
      APP_FILES.map(async (url) => {
        const res = await fetch(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'reload' });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        const body = await res.blob();
        await staging.put(url, new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
      }),
    );

    // Schutz vor gemischten Ständen (z.B. CDN noch nicht aktualisiert)
    const versionFile = await (await staging.match('./js/version.js')).text();
    const servedVersion = /export const VERSION\s*=\s*'([^']+)'/.exec(versionFile)?.[1];
    if (servedVersion !== VERSION) throw new Error(`Server liefert ${servedVersion} statt ${VERSION}`);

    // SDK-Dateien sind unveränderlich (Version in der URL): wenn möglich übernehmen
    for (const url of FIREBASE_FILES) {
      const existing = await caches.match(url, { ignoreVary: true });
      if (existing) await staging.put(url, existing);
      else await staging.add(new Request(url, { mode: 'cors' }));
    }

    const cache = await caches.open(CACHE);
    for (const request of await staging.keys()) await cache.put(request, await staging.match(request));
  } finally {
    await caches.delete(stagingName);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE && !k.endsWith('-staging'));
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.searchParams.has('versionCheck')) return; // Update-Prüfung: immer Netz
    const scopePath = new URL(self.registration.scope).pathname;
    const isAppPage = url.pathname === scopePath || url.pathname === scopePath + 'index.html';
    if (request.mode === 'navigate' && isAppPage) {
      event.respondWith(cacheFirst('./index.html', request));
    } else {
      event.respondWith(cacheFirst(request, request));
    }
    return;
  }

  if (url.href.startsWith('https://www.gstatic.com/firebasejs/')) {
    event.respondWith(cacheFirst(request, request));
  }
  // Alles andere (Firestore, Anmeldung, …) geht unverändert ans Netz.
});

async function cacheFirst(key, request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, { ignoreVary: true, ignoreSearch: typeof key === 'string' });
  if (hit) return hit;
  return fetch(request);
}
