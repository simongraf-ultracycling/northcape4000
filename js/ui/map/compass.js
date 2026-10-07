// Kompass-Modus der Karte: Die Karte dreht sich nach der Blickrichtung des
// iPhones. Leaflet selbst kann nicht drehen – darum dreht sich der ganze
// Karten-Container per CSS um den eigenen Standort. Er ist dafür übergross
// (Quadrat, das den sichtbaren Bereich in jeder Drehung deckt). Marker drehen
// gegen (Hülle .map-rot, CSS-Variable --map-bearing), ebenso die Leaflet-
// Bedienelemente (Quellenangabe) – Text bleibt aufrecht.

// Blickrichtung des Geräts in Grad (0 = Norden, im Uhrzeigersinn).
export function headingSource() {
  let cb = null;
  let received = false;
  const onOrientation = (e) => {
    let heading = null;
    if (Number.isFinite(e.webkitCompassHeading)) heading = e.webkitCompassHeading; // iOS
    else if (e.absolute && Number.isFinite(e.alpha)) heading = 360 - e.alpha; // andere
    if (heading === null) return;
    const screenAngle = Number(screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    received = true;
    cb?.((((heading + screenAngle) % 360) + 360) % 360);
  };
  const stop = () => {
    window.removeEventListener('deviceorientationabsolute', onOrientation);
    window.removeEventListener('deviceorientation', onOrientation);
    cb = null;
  };
  return {
    // Direkt im Tipp-Ereignis aufrufen: iOS fragt dann um Erlaubnis.
    // → Promise 'granted' | 'denied' | 'unsupported'
    start(onHeading) {
      stop();
      received = false;
      cb = onHeading;
      const listen = () => {
        window.addEventListener('deviceorientationabsolute', onOrientation);
        window.addEventListener('deviceorientation', onOrientation);
      };
      const D = window.DeviceOrientationEvent;
      if (!D) return Promise.resolve('unsupported');
      if (typeof D.requestPermission === 'function') {
        return D.requestPermission().then(
          (r) => (r === 'granted' ? (listen(), 'granted') : 'denied'),
          () => 'denied',
        );
      }
      listen();
      return Promise.resolve('granted');
    },
    stop,
    get received() {
      return received;
    },
  };
}

// Kürzeste Drehung von a nach b (−180…180)
function delta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

// Drehung des Karten-Containers.
// area(): sichtbarer Kartenbereich { left, top, width, height } (Bildschirm)
// pivotY: Drehpunkt (= eigener Standort) als Anteil der Höhe, z.B. 0.6
export function createRotator({ map, el, area, pivotY = 0.6, onBearing }) {
  const controls = el.querySelector('.leaflet-control-container');
  let enabled = false;
  let bearing = 0;
  let target = 0;
  let raf = 0;
  let box = null;

  function apply() {
    el.style.transform = `rotate(${-bearing}deg)`;
    el.style.setProperty('--map-bearing', `${bearing}deg`);
    if (controls) controls.style.transform = `rotate(${bearing}deg)`;
    onBearing?.(bearing);
  }

  function layout() {
    const a = area();
    const ox = a.left + a.width / 2;
    const oy = a.top + a.height * pivotY;
    const corners = [
      [a.left, a.top],
      [a.left + a.width, a.top],
      [a.left, a.top + a.height],
      [a.left + a.width, a.top + a.height],
    ];
    const r = Math.ceil(Math.max(...corners.map(([x, y]) => Math.hypot(x - ox, y - oy)))) + 2;
    box = { left: ox - r, top: oy - r, size: 2 * r };
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.size}px`, height: `${box.size}px`, right: 'auto', bottom: 'auto' });
    if (controls) {
      Object.assign(controls.style, {
        position: 'absolute',
        zIndex: '1000', // mit Drehung eigene Ebene – sonst unter den Kacheln
        left: `${a.left - box.left}px`,
        top: `${a.top - box.top}px`,
        width: `${a.width}px`,
        height: `${a.height}px`,
        transformOrigin: `${ox - a.left}px ${oy - a.top}px`,
      });
    }
  }

  function step() {
    raf = 0;
    const d = delta(bearing, target);
    if (Math.abs(d) < 0.3) return;
    bearing = (bearing + d * (Math.abs(d) > 60 ? 0.35 : 0.2) + 360) % 360;
    apply();
    raf = requestAnimationFrame(step);
  }

  return {
    get enabled() {
      return enabled;
    },
    get bearing() {
      return bearing;
    },
    // Drehung einschalten; center = Standort (kommt auf den Drehpunkt)
    enable(center, zoom) {
      if (!enabled) {
        enabled = true;
        el.classList.add('map-compass');
        map.dragging.disable();
        map.doubleClickZoom.disable();
        map.options.touchZoom = 'center';
      }
      layout();
      map.invalidateSize({ pan: false });
      if (center) map.setView(center, zoom ?? map.getZoom(), { animate: false });
      apply();
    },
    disable() {
      if (!enabled) return;
      enabled = false;
      cancelAnimationFrame(raf);
      raf = 0;
      bearing = 0;
      target = 0;
      const center = map.getCenter();
      el.classList.remove('map-compass');
      for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom', 'transform']) el.style[k] = '';
      el.style.removeProperty('--map-bearing');
      if (controls) for (const k of ['position', 'zIndex', 'left', 'top', 'width', 'height', 'transform', 'transformOrigin']) controls.style[k] = '';
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.options.touchZoom = true;
      map.invalidateSize({ pan: false });
      map.setView(center, map.getZoom(), { animate: false });
      onBearing?.(0);
    },
    // Neue Blickrichtung (Grad) – weich nachgeführt
    setTarget(deg) {
      target = deg;
      if (enabled && !raf) raf = requestAnimationFrame(step);
    },
    relayout() {
      if (!enabled) return;
      const center = map.getCenter();
      layout();
      map.invalidateSize({ pan: false });
      map.setView(center, map.getZoom(), { animate: false });
    },
    // Bildschirmpunkt → Kartenkoordinate (Leaflet rechnet ohne Drehung)
    latLngAt(clientX, clientY) {
      const rect = el.getBoundingClientRect();
      const vx = clientX - (rect.left + rect.width / 2);
      const vy = clientY - (rect.top + rect.height / 2);
      const b = (bearing * Math.PI) / 180;
      const half = el.offsetWidth / 2;
      const x = half + vx * Math.cos(b) - vy * Math.sin(b);
      const y = half + vx * Math.sin(b) + vy * Math.cos(b);
      return map.containerPointToLatLng([x, y]);
    },
  };
}
