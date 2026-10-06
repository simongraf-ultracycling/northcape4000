// Kartenebenen: Grundkarten (genau eine aktiv) und Overlays (beliebig viele).
// Nur frei nutzbare Anbieter ohne Schlüssel; Quellenangaben sind Pflicht.
// Neue Hosts: Content-Security-Policy (index.html, img-src) und TILE_HOSTS in
// sw.js ergänzen – tools/check.mjs prüft das.

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';
const ESRI = 'Kacheln &copy; Esri';
const CARTO = `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const SWISSTOPO = '&copy; <a href="https://www.swisstopo.admin.ch/">swisstopo</a>';
const CH_BOUNDS = [
  [45.398181, 5.140242],
  [48.230651, 11.47757],
];

export const BASE_LAYERS = [
  {
    id: 'cyclosm',
    name: 'Velo (CyclOSM)',
    description: 'Velowege, Steigungen, Wasser, Velo-Service',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 20,
    attribution: `<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | ${OSM}`,
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    description: 'Standardkarte',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: OSM,
  },
  {
    id: 'osmde',
    name: 'OpenStreetMap DE',
    description: 'Deutscher Stil, ruhigere Farben',
    url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    maxZoom: 18,
    attribution: OSM,
  },
  {
    id: 'osmfr',
    name: 'OpenStreetMap FR',
    description: 'Französischer Stil, viele Details',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 20,
    attribution: `&copy; OpenStreetMap France | ${OSM}`,
  },
  {
    id: 'hot',
    name: 'Humanitarian',
    description: 'Klare Strassen und Orte',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: `${OSM}, Stil: Humanitarian OpenStreetMap Team, OpenStreetMap France`,
  },
  {
    id: 'topo',
    name: 'OpenTopoMap',
    description: 'Topografisch mit Höhenlinien',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 17,
    attribution: `${OSM}, SRTM | Stil: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
  },
  {
    id: 'esritopo',
    name: 'Esri Topo',
    description: 'Topografisch, weltweit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: `${ESRI} — Esri, HERE, Garmin, USGS, Intermap, NRCAN, Kadaster NL, Ordnance Survey u.a.`,
  },
  {
    id: 'esristreet',
    name: 'Esri Strassen',
    description: 'Strassenkarte, weltweit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: `${ESRI} — Esri, HERE, Garmin, USGS, NRCAN, TomTom u.a.`,
  },
  {
    id: 'satellit',
    name: 'Satellit (Esri)',
    description: 'Luftbilder, weltweit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: `${ESRI} — Esri, Maxar, Earthstar Geographics, GIS User Community`,
    dark: true,
  },
  {
    id: 'voyager',
    name: 'CARTO Voyager',
    description: 'Hell und farbig, gut lesbar',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: CARTO,
  },
  {
    id: 'positron',
    name: 'CARTO Hell',
    description: 'Sehr ruhig, die Route sticht hervor',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: CARTO,
  },
  {
    id: 'darkmatter',
    name: 'CARTO Dunkel',
    description: 'Dunkel – angenehm in der Nacht',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: CARTO,
    dark: true,
  },
  {
    id: 'swisstopo',
    name: 'swisstopo Landeskarte',
    description: 'Nur Schweiz',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    maxZoom: 18,
    bounds: CH_BOUNDS,
    attribution: SWISSTOPO,
  },
  {
    id: 'swissimage',
    name: 'swisstopo Luftbild',
    description: 'Nur Schweiz',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    maxZoom: 19,
    bounds: CH_BOUNDS,
    attribution: SWISSTOPO,
    dark: true,
  },
  {
    id: 'none',
    name: 'Ohne Hintergrund',
    description: 'Nur Route und Punkte – braucht kein Netz',
    url: null,
    maxZoom: 19,
  },
];

// Overlays auf Kacheln (zusätzlich gibt es eigene Overlays: Route, Punkte …)
export const TILE_OVERLAYS = [
  {
    id: 'velorouten',
    name: 'Velorouten',
    description: 'Ausgeschilderte Velorouten (Waymarked Trails)',
    url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
    maxZoom: 18,
    opacity: 0.8,
    attribution: `${OSM} | Stil: &copy; <a href="https://waymarkedtrails.org">waymarkedtrails.org</a> (CC-BY-SA)`,
  },
  {
    id: 'relief',
    name: 'Relief',
    description: 'Schattiertes Gelände',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
    maxNativeZoom: 16,
    opacity: 0.35,
    className: 'tiles-multiply',
    attribution: `${ESRI} — Esri, USGS, NGA, NASA u.a.`,
  },
  {
    id: 'beschriftung',
    name: 'Orte und Grenzen',
    description: 'Beschriftung, z.B. über dem Satellitenbild',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: ESRI,
  },
];

// "Automatisch": Velokarte bei hellen, dunkle Karte bei dunklen Farbmodi
export const AUTO_BASE = { id: 'auto', name: 'Automatisch', description: 'Hell: Velo (CyclOSM) · Dunkel: CARTO Dunkel', light: 'cyclosm', dark: 'darkmatter' };

export function baseLayer(id, scheme) {
  const resolved = id === AUTO_BASE.id ? AUTO_BASE[scheme === 'light' ? 'light' : 'dark'] : id;
  return BASE_LAYERS.find((l) => l.id === resolved) || BASE_LAYERS[0];
}

export function tileOptions(layer) {
  const options = { maxZoom: 20, maxNativeZoom: layer.maxNativeZoom || layer.maxZoom, attribution: layer.attribution || '' };
  if (layer.subdomains) options.subdomains = layer.subdomains;
  if (layer.bounds) options.bounds = layer.bounds;
  if (layer.opacity) options.opacity = layer.opacity;
  if (layer.className) options.className = layer.className;
  return options;
}
