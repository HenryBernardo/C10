// Utilitários compartilhados entre a página do cliente e o painel.

const extraHeaders = {};

/** Painel da barbearia aberto por um admin: diz ao servidor qual comércio está sendo gerenciado. */
export function setShopHeader(shopId) {
  if (shopId) extraHeaders['X-Shop-Id'] = String(shopId);
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { ...extraHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Algo deu errado.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const money = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

/** "terça, 3 de nov" */
export function fmtDateLong(str) {
  const d = parseDate(str);
  return `${WEEKDAYS[d.getDay()].toLowerCase()}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "03/11" */
export function fmtDateShort(str) {
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}

export const fmtMin = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function fmtPhone(phone) {
  const p = String(phone || '').replace(/^55/, '');
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
  return phone || '';
}

/** Máscara de telefone enquanto digita. */
export function maskPhone(input) {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    input.value = v;
  });
}

export const whatsLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

export const STATUS_LABEL = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  done: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Faltou',
};

export const PAYMENT_LABEL = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', nao_informado: 'Não informado' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/** Abre um modal; `render(el, close)` preenche o conteúdo. */
export function openModal(render) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  backdrop.appendChild(modal);
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  render(modal, close);
  return close;
}

export function googleCalendarLink({ title, date, startMin, endMin, details, location }) {
  const stamp = (min) => `${date.replace(/-/g, '')}T${fmtMin(min).replace(':', '')}00`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(startMin)}/${stamp(endMin)}`,
    details: details || '',
    location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Cartão fidelidade com os selos (`l` vem da API: stamps, goal, available, missing, reward_label). */
export function loyaltyCardHtml(l, title = 'Cartão fidelidade') {
  const filled = l.available ? l.goal : l.stamps % l.goal;
  const dots = Array.from({ length: l.goal }, (_, i) =>
    i < filled ? '<span class="stamp on">✂</span>' : i === l.goal - 1 ? '<span class="stamp prize">🎁</span>' : '<span class="stamp"></span>').join('');
  const status = l.available
    ? `🎁 ${l.available > 1 ? `${l.available} prêmios disponíveis` : 'Prêmio disponível'}: ${esc(l.reward_label)}`
    : `Faltam ${l.missing} para ganhar ${esc(l.reward_label)}`;
  return `<div class="loyalty-card"><div class="head"><b>${esc(title)}</b><span class="count">${filled}/${l.goal}</span></div>
    <div class="stamps">${dots}</div><div class="status ${l.available ? 'ready' : ''}">${status}</div></div>`;
}
