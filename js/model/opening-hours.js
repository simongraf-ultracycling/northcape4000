// Öffnungszeiten aus OpenStreetMap (Schlüssel opening_hours) auswerten.
//
// Unterstützt die häufigen Formen:
//   "24/7" · "Mo-Fr 08:00-20:00; Sa 08:00-18:00; Su off" · "Mo,We,Fr 07:00-12:00,13:30-18:30"
//   "08:00-20:00" (täglich) · über Mitternacht "Fr-Sa 22:00-03:00" · "PH off" (Feiertage: ignoriert)
// Spätere Regeln überschreiben frühere für dieselben Tage; nicht genannte Tage
// sind geschlossen. Alles andere (Monate, Daten, sunrise …) → "unbekannt".
// Ausgewertet in der Ortszeit des Geräts.

const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_MIN = 1440;

function dayIndex(token) {
  return DAY_NAMES.findIndex((d) => d.toLowerCase() === token.toLowerCase());
}

// "Mo-Fr,Su" → [0,1,2,3,4,6]; null, wenn kein Tagesausdruck
function parseDays(spec) {
  const days = new Set();
  let holidayOnly = true;
  for (const part of spec.split(/\s*,\s*/)) {
    if (/^(PH|SH)$/i.test(part)) continue;
    holidayOnly = false;
    const range = /^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/.exec(part);
    if (range) {
      const a = dayIndex(range[1]);
      const b = dayIndex(range[2]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === b) break;
      }
    } else {
      const d = dayIndex(part);
      if (d < 0) return null;
      days.add(d);
    }
  }
  return { days: [...days], holidayOnly };
}

// Ergebnis: { always: true } | { week: [[[start, end], …] × 7] } | { unknown: true, raw } | null
export function parseOpeningHours(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^24\/7$/.test(s)) return { always: true };
  const week = Array.from({ length: 7 }, () => []);
  let matched = false;
  for (const ruleRaw of s.split(/\s*(?:;|\|\|)\s*/)) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    let days = [0, 1, 2, 3, 4, 5, 6];
    let rest = rule;
    const dm = /^([A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?)*)(?:\s+(.*))?$/.exec(rule);
    if (dm) {
      const parsed = parseDays(dm[1]);
      if (!parsed) return { unknown: true, raw: s };
      if (parsed.holidayOnly) continue; // reine Feiertagsregel
      days = parsed.days;
      rest = (dm[2] || '').trim();
      if (!rest) return { unknown: true, raw: s };
    }
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) week[d] = [];
      matched = true;
      continue;
    }
    const ranges = [];
    for (const part of rest.split(/\s*,\s*/)) {
      const t = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part);
      if (!t) return { unknown: true, raw: s };
      const start = +t[1] * 60 + +t[2];
      const end = +t[3] * 60 + +t[4];
      if (start > DAY_MIN || end > 48 * 60) return { unknown: true, raw: s };
      ranges.push([start, end]);
    }
    for (const d of days) week[d] = [];
    for (const d of days) {
      for (const [start, end] of ranges) {
        if (end > start && end <= DAY_MIN) week[d].push([start, end]);
        else {
          // über Mitternacht (oder bis 24:00+)
          const over = end > DAY_MIN ? end - DAY_MIN : end;
          week[d].push([start, DAY_MIN]);
          if (over > 0) week[(d + 1) % 7].push([0, over]);
        }
      }
    }
    matched = true;
  }
  if (!matched) return { unknown: true, raw: s };
  for (const day of week) day.sort((a, b) => a[0] - b[0]);
  if (week.every((day) => day.some(([a, b]) => a === 0 && b === DAY_MIN))) return { always: true };
  return { week };
}

function local(ms) {
  const d = new Date(ms);
  return { day: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes() };
}

function fmt(min) {
  if (min > 0 && min % DAY_MIN === 0) return '24:00';
  const m = min % DAY_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Offen zum Zeitpunkt ms? { known, open, always, label }
export function openState(oh, ms) {
  if (!oh) return { known: false, open: null, always: false, label: 'Öffnungszeiten unbekannt' };
  if (oh.always) return { known: true, open: true, always: true, label: '24 h geöffnet' };
  if (oh.unknown) return { known: false, open: null, always: false, label: oh.raw };
  const { day, min } = local(ms);
  const current = oh.week[day].find(([a, b]) => min >= a && min < b);
  if (current) {
    // Ende, auch wenn es am nächsten Tag direkt weitergeht
    let end = current[1];
    let d = day;
    let guard = 0;
    while (end === DAY_MIN && guard++ < 7) {
      d = (d + 1) % 7;
      const next = oh.week[d].find(([a]) => a === 0);
      if (!next) break;
      end = next[1] + DAY_MIN * guard;
    }
    return { known: true, open: true, always: false, label: `geöffnet bis ${fmt(end)}` };
  }
  // Nächste Öffnung (heute oder in den nächsten 7 Tagen)
  for (let k = 0; k < 8; k++) {
    const d = (day + k) % 7;
    const next = oh.week[d].find(([a]) => k > 0 || a > min);
    if (next) {
      const when = k === 0 ? fmt(next[0]) : k === 1 ? `morgen ${fmt(next[0])}` : `${DAY_LABELS[d]} ${fmt(next[0])}`;
      return { known: true, open: false, always: false, label: `geschlossen · öffnet ${when}` };
    }
  }
  return { known: true, open: false, always: false, label: 'geschlossen' };
}

export function isAlwaysOpen(raw) {
  return parseOpeningHours(raw)?.always === true;
}
