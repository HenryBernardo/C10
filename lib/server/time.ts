// Datas como 'YYYY-MM-DD' e horários como minutos desde 00:00, sempre no fuso da cidade
// (APP_TIME_ZONE, padrão America/Sao_Paulo). O servidor da Vercel roda em UTC, então nada
// aqui usa o fuso da máquina.
import { TIME_ZONE } from './db';

const pad = (n: number) => String(n).padStart(2, '0');

function localParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

export function todayStr(): string {
  const p = localParts();
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function nowMin(): number {
  const p = localParts();
  return p.h * 60 + p.min;
}

/** Dia da semana local de agora (0 = domingo). */
export const todayWeekday = () => weekdayOf(todayStr());

const toUtc = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export const addDays = (str: string, n: number) => fromUtc(toUtc(str) + n * 86_400_000);
export const weekdayOf = (str: string) => new Date(toUtc(str)).getUTCDay();

export function isValidDate(str: unknown): str is string {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && fromUtc(toUtc(str)) === str;
}

export function toMin(hhmm: unknown): number | null {
  if (hhmm == null || hhmm === '') return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function fromMin(min: number | null | undefined): string | null {
  if (min == null) return null;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Minutos absolutos para comparar data + hora locais. */
export const absMin = (date: string, min: number) => toUtc(date) / 60_000 + min;
export const nowAbsMin = () => absMin(todayStr(), nowMin());

/* Colunas `date` do banco chegam como Date (meia-noite UTC). Estas funções convertem de/para 'YYYY-MM-DD'. */
export const toDbDate = (str: string) => new Date(`${str}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

/** Data e hora local ('YYYY-MM-DD HH:MM') de um instante, no fuso da cidade. */
export function localDateTime(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
