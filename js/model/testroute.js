// Selbst erstellte Testroute über die Gate-Orte des NorthCape 4000
// (Rovereto – München – Berlin – Gränna – Rovaniemi – Nordkapp).
// Erlaubt: KEINE offizielle Route – nur grob über bekannte Orte entlang
// grosser Strassen, mit künstlichem Kurvenverlauf und Höhenprofil.
// Fähren (Rostock–Gedser, Helsingør–Helsingborg) sind Lücken zwischen Etappen.

import { trackToStage } from '../geo/gpx.js';
import { distance } from '../geo/geo.js';

// [Breite, Länge, Höhe m, Name]
const STAGES = [
  {
    name: 'Rovereto – München',
    points: [
      [45.8903, 11.04, 204, 'Rovereto'], [46.0679, 11.1211, 194, 'Trento'], [46.2433, 11.1919, 224, 'Salurn'],
      [46.4983, 11.3548, 262, 'Bozen'], [46.638, 11.565, 523, 'Klausen'], [46.715, 11.656, 560, 'Brixen'],
      [46.893, 11.43, 948, 'Sterzing'], [47.002, 11.505, 1372, 'Brenner'], [47.128, 11.452, 993, 'Matrei'],
      [47.2692, 11.4041, 574, 'Innsbruck'], [47.35, 11.709, 545, 'Schwaz'], [47.389, 11.778, 563, 'Jenbach'],
      [47.525, 11.707, 916, 'Achenkirch'], [47.568, 11.699, 941, 'Achenpass'], [47.68, 11.573, 679, 'Lenggries'],
      [47.76, 11.557, 658, 'Bad Tölz'], [47.885, 11.699, 667, 'Holzkirchen'], [48.1374, 11.5755, 519, 'München'],
    ],
  },
  {
    name: 'München – Berlin',
    points: [
      [48.1374, 11.5755, 519, 'München'], [48.4029, 11.7488, 448, 'Freising'], [48.5372, 12.1522, 393, 'Landshut'],
      [49.0134, 12.1016, 343, 'Regensburg'], [49.326, 12.11, 365, 'Schwandorf'], [49.6769, 12.1561, 397, 'Weiden'],
      [50.004, 12.086, 539, 'Marktredwitz'], [50.3135, 11.9128, 495, 'Hof'], [50.497, 12.137, 412, 'Plauen'],
      [50.7189, 12.4964, 267, 'Zwickau'], [51.3397, 12.3731, 113, 'Leipzig'], [51.623, 12.327, 80, 'Bitterfeld'],
      [51.8664, 12.6464, 67, 'Wittenberg'], [51.993, 13.073, 70, 'Jüterbog'], [52.087, 13.168, 49, 'Luckenwalde'],
      [52.52, 13.405, 34, 'Berlin'],
    ],
  },
  {
    name: 'Berlin – Rostock',
    points: [
      [52.52, 13.405, 34, 'Berlin'], [52.754, 13.237, 36, 'Oranienburg'], [53.364, 13.063, 73, 'Neustrelitz'],
      [53.557, 13.261, 19, 'Neubrandenburg'], [53.79, 12.58, 30, 'Teterow'], [54.0924, 12.0991, 13, 'Rostock'],
      [54.176, 12.085, 2, 'Warnemünde'],
    ],
  },
  {
    name: 'Gedser – Helsingør',
    points: [
      [54.574, 11.926, 3, 'Gedser'], [54.769, 11.874, 5, 'Nykøbing F'], [55.008, 11.911, 10, 'Vordingborg'],
      [55.458, 12.182, 5, 'Køge'], [55.6761, 12.5683, 10, 'København'], [56.036, 12.613, 10, 'Helsingør'],
    ],
  },
  {
    name: 'Helsingborg – Gränna',
    points: [
      [56.0465, 12.6945, 10, 'Helsingborg'], [56.243, 12.862, 20, 'Ängelholm'], [56.6745, 12.8578, 15, 'Halmstad'],
      [56.905, 13.6, 160, 'Ljungby'], [57.186, 14.04, 155, 'Värnamo'], [57.7826, 14.1618, 95, 'Jönköping'],
      [58.025, 14.465, 95, 'Gränna'],
    ],
  },
  {
    name: 'Gränna – Rovaniemi',
    points: [
      [58.025, 14.465, 95, 'Gränna'], [58.228, 14.653, 130, 'Ödeshög'], [58.4108, 15.6214, 48, 'Linköping'],
      [58.5877, 16.1924, 10, 'Norrköping'], [58.753, 17.008, 15, 'Nyköping'], [59.196, 17.625, 10, 'Södertälje'],
      [59.3293, 18.0686, 28, 'Stockholm'], [59.8586, 17.6389, 15, 'Uppsala'], [60.6749, 17.1413, 20, 'Gävle'],
      [61.729, 17.105, 10, 'Hudiksvall'], [62.3908, 17.3069, 10, 'Sundsvall'], [62.632, 17.938, 15, 'Härnösand'],
      [63.29, 18.715, 10, 'Örnsköldsvik'], [63.8258, 20.263, 15, 'Umeå'], [64.7507, 20.9528, 20, 'Skellefteå'],
      [65.317, 21.479, 10, 'Piteå'], [65.5848, 22.1547, 10, 'Luleå'], [65.853, 23.143, 10, 'Kalix'],
      [65.835, 24.137, 10, 'Haparanda'], [65.848, 24.146, 10, 'Tornio'], [65.736, 24.564, 10, 'Kemi'],
      [66.5039, 25.7294, 85, 'Rovaniemi'],
    ],
  },
  {
    name: 'Rovaniemi – Nordkapp',
    points: [
      [66.5039, 25.7294, 85, 'Rovaniemi'], [67.417, 26.589, 180, 'Sodankylä'], [68.658, 27.54, 120, 'Ivalo'],
      [68.906, 27.028, 120, 'Inari'], [69.398, 25.844, 140, 'Karigasniemi'], [69.472, 25.511, 130, 'Karasjok'],
      [70.051, 24.972, 10, 'Lakselv'], [70.473, 25.055, 10, 'Olderfjord'], [70.982, 25.97, 10, 'Honningsvåg'],
      [71.1695, 25.7836, 307, 'Nordkapp'],
    ],
  },
];

const GATES = [
  ['Rovereto', 'Start'],
  ['München', 'Gate'],
  ['Berlin', 'Gate'],
  ['Gränna', 'Gate'],
  ['Rovaniemi', 'Gate'],
  ['Nordkapp', 'Ziel'],
];

const STEP_M = 400;

// Dichte Spur zwischen den Orten: leicht geschwungen, mit Hügeln
function densify(points) {
  const lat = [];
  const lon = [];
  const ele = [];
  let s = 0; // Gesamtstrecke für Wellen
  for (let k = 0; k < points.length - 1; k++) {
    const [la0, lo0, e0] = points[k];
    const [la1, lo1, e1] = points[k + 1];
    const len = distance(la0, lo0, la1, lo1);
    const steps = Math.max(1, Math.round(len / STEP_M));
    // Querrichtung (Grad) für den Kurvenverlauf
    const cos = Math.cos((la0 * Math.PI) / 180);
    const nx = -(la1 - la0);
    const ny = (lo1 - lo0) * cos;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = k === 0 ? 0 : 1; i <= steps; i++) {
      const t = i / steps;
      const taper = Math.sin(Math.PI * t); // an den Orten keine Abweichung
      const d = s + t * len;
      const wiggle = taper * (260 * Math.sin(d / 1100) + 120 * Math.sin(d / 370)); // Meter quer
      const offDeg = wiggle / 111_320;
      lat.push(la0 + (la1 - la0) * t + (ny / nl) * offDeg);
      lon.push(lo0 + (lo1 - lo0) * t + ((nx / nl) * offDeg) / cos);
      const hills = taper * (35 * Math.sin(d / 2300) + 12 * Math.sin(d / 640));
      ele.push(Math.max(0, e0 + (e1 - e0) * t + hills));
    }
    s += len;
  }
  return { lat, lon, ele };
}

// Grobe Linie über die Orte (ohne Kurven) – z.B. für Sim-Testdaten mit Standort
export function testRouteLine() {
  return STAGES.flatMap((st) => st.points.map(([lat, lon]) => [lat, lon]));
}

export function createTestRoute() {
  const stages = STAGES.map((st) => trackToStage(densify(st.points), { name: st.name, file: 'Testroute' }));
  const byName = new Map(STAGES.flatMap((st) => st.points.map((p) => [p[3], p])));
  const waypoints = GATES.map(([name, type]) => {
    const p = byName.get(name);
    return { lat: p[0], lon: p[1], name, type };
  });
  return { name: 'Testroute NorthCape (grob)', stages, waypoints };
}
