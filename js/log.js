// Fehlerprotokoll: fängt window.onerror, unhandledrejection sowie
// console.error/console.warn ab und speichert die letzten 200 Einträge lokal.
// Zeitstempel in echter Gerätezeit (clock.realNow), auch im Sim-Modus.

import { clock } from './clock.js';
import { readLocal, writeLocal } from './local.js';
import { VERSION } from './version.js';

const KEY = 'errorLog';
const MAX_ENTRIES = 200;
const listeners = new Set();

let entries = readLocal(KEY, []);
if (!Array.isArray(entries)) entries = [];

function save() {
  if (!writeLocal(KEY, entries)) {
    // Speicher voll: ältere Hälfte verwerfen und nochmals versuchen
    entries = entries.slice(-Math.floor(MAX_ENTRIES / 2));
    writeLocal(KEY, entries);
  }
  for (const cb of listeners) cb(entries);
}

function toText(value) {
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Für das Zusammenfassen: Zeitstempel und wechselnde Kennungen ignorieren
// (z.B. Firebase-Wiederholungen "stream 0x1a2b…").
const sameKind = (a, b) => a.replace(/0x[0-9a-f]+|\d+/gi, '#') === b.replace(/0x[0-9a-f]+|\d+/gi, '#');

// level: 'error' | 'warn' | 'info'
export function logEntry(level, message, { stack, source } = {}) {
  // Eigener Zeitstempel genügt: "[2026-…Z]  " von Firebase-Meldungen entfernen
  const msg = String(message || '(ohne Meldung)')
    .replace(/^\[\d{4}-\d\d-\d\dT[\d:.]+Z\]\s*/, '')
    .slice(0, 2000);
  const last = entries[entries.length - 1];
  // Gleichartige Meldungen direkt hintereinander zusammenfassen (z.B. Wiederholungen)
  if (last && last.level === level && sameKind(last.msg, msg)) {
    last.msg = msg;
    last.count = (last.count || 1) + 1;
    last.t = clock.realNow();
  } else {
    entries.push({
      t: clock.realNow(),
      level,
      msg,
      stack: stack ? String(stack).slice(0, 4000) : undefined,
      source,
      v: VERSION,
      sim: clock.isSimulated() || undefined,
    });
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  }
  save();
}

export function getLog() {
  return entries.slice();
}

export function clearLog() {
  entries = [];
  save();
}

export function onLogChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function formatLogText() {
  const lines = [`NorthCape 4000 – Fehlerprotokoll (App ${VERSION})`, `Gerät: ${navigator.userAgent}`, ''];
  for (const e of entries) {
    const time = new Date(e.t).toISOString();
    const count = e.count > 1 ? ` (${e.count}×)` : '';
    lines.push(`${time} [${e.level}] v${e.v}${e.sim ? ' SIM' : ''}${e.source ? ' ' + e.source : ''}: ${e.msg}${count}`);
    if (e.stack) lines.push('    ' + e.stack.split('\n').join('\n    '));
  }
  return lines.join('\n');
}

let installed = false;

export function installErrorHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target && target !== window && (target.src || target.href)) {
        logEntry('error', `Laden fehlgeschlagen: ${target.src || target.href}`, { source: 'resource' });
        return;
      }
      const base = window.location.href.split('#')[0].replace(/[^/]*$/, '');
      const where = event.filename ? `${event.filename.replace(base, '')}:${event.lineno}:${event.colno}` : undefined;
      logEntry('error', event.message || toText(event.error), { stack: event.error?.stack, source: where || 'onerror' });
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logEntry('error', `Unbehandelt: ${toText(reason)}`, { stack: reason?.stack, source: 'promise' });
  });

  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try {
        const err = args.find((a) => a instanceof Error);
        logEntry(level, args.map(toText).join(' '), { stack: err?.stack, source: 'console' });
      } catch {
        // Protokoll darf nie selbst Fehler auslösen
      }
    };
  }

  // Frühe Fehler übernehmen, die js/boot.js vor dem Modulstart gesammelt hat
  const early = window.__ncEarlyErrors;
  if (Array.isArray(early)) {
    for (const e of early) logEntry('error', e.msg, { stack: e.stack, source: e.source || 'boot' });
    early.length = 0;
  }
  if (typeof window.__ncBootCleanup === 'function') window.__ncBootCleanup();
}
