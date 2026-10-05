/* Frühstart – klassisches Skript, läuft vor allen Modulen und vor dem ersten Bild.
 * 1. Darstellung sofort setzen (Design, Hell/Dunkel, Renn-Modus, Sim-Markierung)
 *    – kein Aufblitzen.
 * 2. Frühe Fehler sammeln, bis js/log.js übernimmt.
 * 3. Notfall-Anzeige, falls die App nicht startet (z.B. defektes Update im
 *    Cache): mit Knopf "Cache leeren und neu laden".
 * Liest localStorage direkt; Schlüssel wie in js/local.js (Präfix "nc4000.").
 */
(function () {
  'use strict';
  var root = document.documentElement;

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem('nc4000.' + key));
    } catch (e) {
      return null;
    }
  }

  function media(query) {
    try {
      return matchMedia(query).matches;
    } catch (e) {
      return false;
    }
  }

  // Design und Erscheinungsbild (wie js/ui/display.js; Liste dort = Liste hier)
  var THEMES = ['polarnacht', 'synthwave', 'beton', 'terminal', 'gazzetta', 'plakat', 'topo', 'mondrian', 'holo', 'skizze'];
  var theme = read('theme');
  if (THEMES.indexOf(theme) < 0) theme = 'polarnacht';
  var mode = read('colorMode');
  if (mode === 'auto') mode = media('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  else if (mode !== 'light') mode = 'dark';
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-mode', mode);

  var forced = media('(prefers-reduced-transparency: reduce)') || media('(prefers-contrast: more)');
  root.setAttribute('data-glass', read('raceMode') === true || forced ? 'off' : 'on');
  if (read('simMode') === true) root.classList.add('sim');

  // --- Frühe Fehler sammeln ---
  var early = (window.__ncEarlyErrors = []);
  function onError(event) {
    var target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      early.push({ msg: 'Laden fehlgeschlagen: ' + (target.src || target.href), source: 'boot' });
    } else {
      early.push({
        msg: event.message || String(event.error),
        stack: event.error && event.error.stack,
        source: event.filename ? event.filename + ':' + event.lineno : 'boot',
      });
    }
  }
  function onRejection(event) {
    var r = event.reason;
    early.push({ msg: 'Unbehandelt: ' + (r && r.message ? r.message : String(r)), stack: r && r.stack, source: 'boot' });
  }
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  window.__ncBootCleanup = function () {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
  };

  // --- Notfall-Anzeige ---
  function clearAndReload() {
    var jobs = [];
    if ('serviceWorker' in navigator) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    if ('caches' in window) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k.indexOf('nc4000-') === 0; }).map(function (k) { return caches.delete(k); }));
        })
      );
    }
    Promise.all(jobs).then(reload, reload);
  }
  function reload() {
    window.location.reload();
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  setTimeout(function () {
    if (window.__ncStarted) return;
    var box = document.getElementById('boot-fallback');
    if (!box) return;
    box.textContent = '';
    box.appendChild(el('h1', '', 'Die App startet nicht'));
    box.appendChild(
      el('p', 'muted', 'Vermutlich ist eine Datei im Cache defekt. "Cache leeren" lädt die App neu vom Server (braucht Netz). Erfasste Daten bleiben erhalten.')
    );
    var b1 = el('button', 'btn btn-primary btn-block', 'Cache leeren und neu laden');
    b1.type = 'button';
    b1.onclick = clearAndReload;
    var b2 = el('button', 'btn btn-block', 'Nochmals versuchen');
    b2.type = 'button';
    b2.onclick = reload;
    box.appendChild(b1);
    box.appendChild(b2);
    if (early.length) {
      box.appendChild(el('pre', '', early.map(function (e) { return e.msg + (e.source ? ' (' + e.source + ')' : ''); }).join('\n')));
    }
    box.hidden = false;
  }, 15000);
})();
