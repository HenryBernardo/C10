// Formatação usada nas telas (servidor e navegador).

export const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function parseDate(str: string) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const dateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const today = () => dateStr(new Date());

export function addDays(str: string, n: number) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

/** "terça, 3 de nov" */
export function fmtDateLong(str: string) {
  const d = parseDate(str);
  return `${WEEKDAYS[d.getDay()].toLowerCase()}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "03/11" */
export function fmtDateShort(str: string) {
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}

export const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function fmtDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function fmtPhone(phone: string | null | undefined) {
  const p = String(phone || '').replace(/^55/, '');
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
  return phone || '';
}

/** Máscara de telefone para usar no onChange de um input. */
export function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length > 7) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d;
}

export const whatsLink = (phone: string | null | undefined, text: string) => `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;

export const STATUS_LABEL = { scheduled: 'Agendado', confirmed: 'Confirmado', done: 'Concluído', cancelled: 'Cancelado', no_show: 'Faltou' } as const;
export const PAYMENT_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', nao_informado: 'Não informado' };

export function googleCalendarLink({ title, date, startMin, endMin, details, location }:
  { title: string; date: string; startMin: number; endMin: number; details?: string; location?: string }) {
  const stamp = (min: number) => `${date.replace(/-/g, '')}T${fmtMin(min).replace(':', '')}00`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(startMin)}/${stamp(endMin)}`, details: details || '', location: location || '' });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
