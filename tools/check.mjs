#!/usr/bin/env node
// Prüft die festen Regeln des Projekts – nur Node-Bordmittel, kein npm.
// Aufruf im Repository-Hauptordner:  node tools/check.mjs
//
// - Jede App-Datei steht in APP_FILES von sw.js (sonst fehlt sie offline)
// - Alle JS-Dateien sind syntaktisch gültig
// - Zeit nur über clock.now(): kein Date.now() / new Date() ausserhalb von js/clock.js
// - Firebase nur in js/store/firebase-backend.js
// - Kein Tracking (Google Analytics & Co.)
// - Keine GPX/FIT-Dateien im Repository
// - Schweizer Schreibweise ("ss" statt "ß") in der Oberfläche
// - CHANGELOG.md hat einen Eintrag für die aktuelle Version

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

// --- Precache-Liste ----------------------------------------------------------
const sw = read('sw.js');
const listed = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));
const appFiles = ['index.html', 'manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('icons')];
for (const f of appFiles) if (!listed.has(f)) fail(`sw.js: ${f} fehlt in APP_FILES`);
for (const f of listed) if (!existsSync(join(root, f))) fail(`sw.js: APP_FILES enthält ${f}, Datei existiert nicht`);

// --- Syntax ---------------------------------------------------------------------
const jsFiles = walk('js').filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
  const isModule = f !== 'js/boot.js';
  const res = spawnSync(process.execPath, ['--check', ...(isModule ? ['--input-type=module'] : [])], { input: read(f), encoding: 'utf8' });
  if (res.status !== 0) fail(`${f}: Syntaxfehler\n${res.stderr}`);
}
for (const f of ['sw.js', 'tools/check.mjs']) {
  const res = spawnSync(process.execPath, ['--check', join(root, f)], { encoding: 'utf8' });
  if (res.status !== 0) fail(`${f}: Syntaxfehler\n${res.stderr}`);
}

// --- Regeln im Code ------------------------------------------------------------
const codeFiles = [...jsFiles, 'sw.js', 'index.html'];
for (const f of codeFiles) {
  const src = read(f);
  if (f !== 'js/clock.js' && /Date\.now\(|new Date\(\s*\)/.test(src)) fail(`${f}: Zeit nur über clock.now() (kein Date.now / new Date())`);
  if (f !== 'js/store/firebase-backend.js' && f !== 'sw.js' && /firebasejs|firebase-(app|auth|firestore)/.test(src)) {
    fail(`${f}: Firebase nur in js/store/firebase-backend.js verwenden`);
  }
  if (/google-analytics|googletagmanager|gtag\(|analytics\.js|firebase-analytics/i.test(src)) fail(`${f}: Tracking/Analyse ist verboten`);
}
for (const f of [...jsFiles, 'index.html', 'manifest.webmanifest']) {
  if (read(f).includes('ß')) fail(`${f}: Schweizer Schreibweise – "ss" statt "ß"`);
}

// --- Farbmodi: js/ui/display.js ↔ js/boot.js ↔ css/tokens.css ---------------------
const displaySrc = read('js/ui/display.js');
const bootSrc = read('js/boot.js');
const tokensSrc = read('css/tokens.css');
// Inhalt des CSS-Blocks, der genau mit diesem Selektor beginnt
const cssBlock = (selector) => {
  const start = tokensSrc.indexOf(`${selector} {`);
  return start < 0 ? null : tokensSrc.slice(start, tokensSrc.indexOf('}', start));
};

const modes = [...displaySrc.matchAll(/\{ id: '([a-z]+)', name: '[^']+', scheme: '(light|dark)' \}/g)].map((m) => ({ id: m[1], scheme: m[2] }));
if (!modes.length) fail('js/ui/display.js: MODES nicht gefunden');
const MODE_TOKENS = ['--bg-base', '--surface', '--surface-2', '--surface-bar', '--text', '--text-muted', '--separator', '--separator-strong', '--pressed', '--field-fill', '--field-border', '--switch-off'];
for (const { id, scheme } of modes) {
  if (!bootSrc.includes(`${id}: '${scheme}'`)) fail(`js/boot.js: Farbmodus "${id}" (${scheme}) fehlt in MODES`);
  const block = cssBlock(`[data-mode="${id}"]`);
  if (!block) fail(`css/tokens.css: Block [data-mode="${id}"] fehlt`);
  else for (const token of MODE_TOKENS) if (!block.includes(`${token}:`)) fail(`css/tokens.css: [data-mode="${id}"] definiert ${token} nicht`);
}

// --- Kartenkacheln: js/ui/map/layers.js ↔ index.html (CSP) ↔ sw.js (TILE_HOSTS) ---
{
  const layersSrc = read('js/ui/map/layers.js');
  const swSrc = read('sw.js');
  const csp = /Content-Security-Policy"\s*content="([^"]+)"/.exec(read('index.html'))?.[1] || '';
  const imgSrc = (/img-src ([^;]+)/.exec(csp)?.[1] || '').split(/\s+/);
  const hostAllowed = (host) =>
    imgSrc.some((src) => {
      const m = /^https:\/\/(\*\.)?(.+)$/.exec(src);
      return m && (m[1] ? host.endsWith('.' + m[2]) : host === m[2]);
    });
  const hosts = new Set([...layersSrc.matchAll(/url: '(https:\/\/[^/']+)/g)].map((m) => new URL(m[1].replace('{s}', 'a')).hostname));
  if (!hosts.size) fail('js/ui/map/layers.js: keine Kachel-URLs gefunden');
  for (const host of hosts) {
    if (!hostAllowed(host)) fail(`index.html: Kachel-Host ${host} fehlt in img-src der CSP`);
    const tileHosts = [...(/const TILE_HOSTS = \[([^\]]*)\]/.exec(swSrc)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (!tileHosts.some((h) => host === h || host.endsWith('.' + h))) fail(`sw.js: Kachel-Host ${host} fehlt in TILE_HOSTS`);
  }
  if (!/export const LEAFLET_VERSION\s*=\s*'[^']+'/.test(read('js/version.js'))) fail('js/version.js: LEAFLET_VERSION fehlt');
  if (!/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/.test(csp) || !/style-src[^;]*https:\/\/cdn\.jsdelivr\.net/.test(csp)) fail('index.html: cdn.jsdelivr.net fehlt in script-src/style-src (Leaflet)');
}

// --- Repository-Hygiene --------------------------------------------------------------
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
for (const f of tracked) if (/\.(gpx|fit)$/i.test(f) || /(^|\/)private\//.test(f)) fail(`${f}: darf nicht ins Repository`);

// --- Version & CHANGELOG -----------------------------------------------------------
const version = /export const VERSION\s*=\s*'([^']+)'/.exec(read('js/version.js'))?.[1];
if (!version) fail('js/version.js: VERSION nicht gefunden');
else if (!read('CHANGELOG.md').includes(`## [${version}]`)) fail(`CHANGELOG.md: Eintrag "## [${version}]" fehlt`);

// --- Ergebnis --------------------------------------------------------------------------
if (problems.length) {
  console.error(`✗ ${problems.length} Problem(e):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`✓ Alles in Ordnung (Version ${version}, ${appFiles.length} App-Dateien)`);
