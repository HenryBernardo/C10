// Todas as datas/horas são tratadas no fuso local da barbearia:
// datas como 'YYYY-MM-DD' e horários como minutos desde 00:00.

const pad = (n) => String(n).padStart(2, '0');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowMin(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function weekdayOf(str) {
  return parseDate(str).getDay();
}

export function toMin(hhmm) {
  if (hhmm == null || hhmm === '') return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min) {
  if (min == null) return null;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && todayStr(parseDate(str)) === str;
}

/** Minutos absolutos (desde a época local) para comparar data+hora. */
export function absMin(dateStr, min) {
  return Math.round(parseDate(dateStr).getTime() / 60000) + min;
}

export function nowAbsMin() {
  return absMin(todayStr(), nowMin());
}
