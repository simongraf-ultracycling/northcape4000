// Formatierung für die Oberfläche: Deutsch (Schweiz), 24-Stunden-Format,
// metrische Einheiten. Zeiten in der Zeitzone des Geräts.

const LOCALE = 'de-CH';

const fmtTime = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtTimeSec = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const fmtDate = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const fmtNumber1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

export function formatTime(ms, { seconds = false } = {}) {
  if (!Number.isFinite(ms)) return '–';
  return (seconds ? fmtTimeSec : fmtTime).format(new Date(ms));
}

export function formatDate(ms) {
  if (!Number.isFinite(ms)) return '–';
  return fmtDate.format(new Date(ms));
}

export function formatDateTime(ms, { seconds = false, weekday = false } = {}) {
  if (!Number.isFinite(ms)) return '–';
  const parts = [formatDate(ms), formatTime(ms, { seconds })];
  if (weekday) parts.unshift(fmtWeekday.format(new Date(ms)));
  return parts.join(' ');
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '–';
  return digits === 1 ? fmtNumber1.format(value) : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(value);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${formatNumber(bytes / 1024 ** 2)} MB`;
  return `${formatNumber(bytes / 1024 ** 3)} GB`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${formatNumber(ms / 1000)} s`;
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

// Verstrichene Zeit für die Oberfläche: unter einer Minute "< 1 min"
export function formatElapsed(ms) {
  if (!Number.isFinite(ms)) return '–';
  return ms < 60_000 ? '< 1 min' : formatDuration(ms);
}

// Dauer als Stunden:Minuten, z.B. "6:05 h" (für kompakte Anzeigen)
export function formatHours(ms) {
  if (!Number.isFinite(ms)) return '–';
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')} h`;
}

function localMidnight(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Tag relativ zu "now": "heute", "gestern", Wochentag (bis 6 Tage) oder Datum
export function formatDay(ms, now) {
  if (!Number.isFinite(ms)) return '–';
  const days = Math.round((localMidnight(now) - localMidnight(ms)) / 86_400_000);
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days > 1 && days < 7) return fmtWeekday.format(new Date(ms));
  return formatDate(ms);
}

// Wert für <input type="datetime-local"> (Ortszeit des Geräts).
export function toDateTimeLocalValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
