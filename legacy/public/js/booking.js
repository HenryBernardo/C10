import {
  api, money, fmtDuration, fmtDateLong, fmtMin, addDays, parseDate, WEEKDAYS_SHORT, esc, toast,
  maskPhone, whatsLink, googleCalendarLink, STATUS_LABEL, fmtPhone, loyaltyCardHtml,
} from './common.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const STORE_KEY = 'barbearia:bookings';
const PROFILE_KEY = 'barbearia:perfil';

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
  },
};

let info = null;
// A página de agendamento de cada comércio vem com o id dele em <body data-shop>.
// Sem ele (/meu-horario), a página só consulta/cancela agendamentos pelo código.
const SHOP_ID = document.body.dataset.shop;
const BASE = `/api/public/shops/${SHOP_ID}`;
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const state = { step: 1, service: null, barberId: null, date: null, slot: null };
const $body = document.getElementById('step-body');

async function init() {
  const code = new URLSearchParams(location.search).get('codigo');
  document.getElementById('btn-my').addEventListener('click', () => showLookup());

  if (!SHOP_ID) {
    document.title = 'Meu horário · Cidade 10';
    document.getElementById('shop-name').textContent = 'Meu horário';
    document.getElementById('shop-address').textContent = 'Consulte, confirme ou cancele seu agendamento.';
    for (const id of ['booking', 'shop-whats', 'shop-page', 'btn-my']) document.getElementById(id).hidden = true;
    showLookup(code);
    renderUpcoming();
    return;
  }

  try {
    info = await api(`${BASE}/info`);
  } catch (e) {
    $body.innerHTML = `<p class="empty">Não foi possível carregar a agenda. ${esc(e.message)}</p>`;
    return;
  }
  const s = info.settings;
  document.title = `${s.shop_name} · Agende seu horário`;
  document.getElementById('shop-name').textContent = s.shop_name;
  document.getElementById('shop-address').textContent = `${s.shop_address} · ${info.city_name}`;
  document.getElementById('shop-whats').href = whatsLink(s.shop_phone, `Olá, ${s.shop_name}!`);
  document.getElementById('shop-page').href = info.page_path;

  if (code) showLookup(code);
  renderUpcoming();
  if (!info.services.length || !info.barbers.length) {
    $body.innerHTML = '<p class="empty">A agenda online desta barbearia está sendo configurada. Fale com ela pelo WhatsApp.</p>';
    return;
  }
  render();
}

/* ------------------------------ Etapas ------------------------------ */

function render() {
  document.querySelectorAll('#steps li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === state.step);
    li.classList.toggle('done', n < state.step);
  });
  ({ 1: renderServices, 2: renderBarbers, 3: renderSchedule, 4: renderDetails })[state.step]();
}

function go(step) {
  state.step = step;
  render();
  document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderServices() {
  $body.innerHTML = `
    <h2 class="step-title">Qual serviço?</h2>
    <p class="step-sub muted">Escolha o que você quer fazer hoje.</p>
    ${info.loyalty ? `<div class="loyalty-banner">🎁 <span><b>Cartão fidelidade:</b> ${esc(info.loyalty.summary)}</span></div>` : ''}
    <div class="options">
      ${info.services.map((s) => `
        <button class="option ${state.service?.id === s.id ? 'selected' : ''}" data-id="${s.id}">
          <div class="info">
            <div class="name">${esc(s.name)}</div>
            ${s.description ? `<div class="desc">${esc(s.description)}</div>` : ''}
          </div>
          <div class="price">${money(s.price_cents)}<small>${fmtDuration(s.duration_min)}</small></div>
        </button>`).join('')}
    </div>`;
  $body.querySelectorAll('.option').forEach((el) => el.addEventListener('click', () => {
    state.service = info.services.find((s) => s.id === Number(el.dataset.id));
    state.slot = null;
    go(2);
  }));
}

function renderBarbers() {
  const opt = (id, name, color, sub) => `
    <button class="option ${state.barberId === id ? 'selected' : ''}" data-id="${id ?? ''}">
      ${id ? `<span class="avatar" style="background:${esc(color)}">${esc(name[0])}</span>`
           : '<span class="avatar any">★</span>'}
      <div class="info"><div class="name">${esc(name)}</div><div class="desc">${sub}</div></div>
    </button>`;
  $body.innerHTML = `
    <h2 class="step-title">Com quem?</h2>
    <p class="step-sub muted">Escolha seu barbeiro ou deixe que a gente encaixe no primeiro horário livre.</p>
    <div class="options">
      ${opt(null, 'Sem preferência', null, 'Mais horários disponíveis')}
      ${info.barbers.map((b) => opt(b.id, b.name, b.color, 'Barbeiro')).join('')}
    </div>
    <div class="nav"><button class="btn" id="back">Voltar</button></div>`;
  $body.querySelectorAll('.option').forEach((el) => el.addEventListener('click', () => {
    state.barberId = Number(el.dataset.id) || null;
    state.slot = null;
    go(3);
  }));
  $body.querySelector('#back').addEventListener('click', () => go(1));
}

function worksOn(date) {
  const wd = parseDate(date).getDay();
  const barbers = state.barberId ? info.barbers.filter((b) => b.id === state.barberId) : info.barbers;
  return barbers.some((b) => b.weekdays.includes(wd));
}

function renderSchedule() {
  const days = [];
  for (let i = 0; i <= info.settings.max_days_ahead; i++) days.push(addDays(info.today, i));
  if (!state.date || !worksOn(state.date)) state.date = days.find(worksOn) || days[0];

  $body.innerHTML = `
    <h2 class="step-title">Quando?</h2>
    <p class="step-sub muted">${esc(state.service.name)} · ${fmtDuration(state.service.duration_min)}</p>
    <div class="days" id="days">
      ${days.map((d) => {
        const dt = parseDate(d);
        return `<button class="day ${d === state.date ? 'selected' : ''}" data-date="${d}" ${worksOn(d) ? '' : 'disabled'}>
          <div class="wd">${d === info.today ? 'Hoje' : WEEKDAYS_SHORT[dt.getDay()]}</div>
          <div class="dn">${dt.getDate()}</div>
          <div class="mo">${MONTHS[dt.getMonth()]}</div>
        </button>`;
      }).join('')}
    </div>
    <div id="slots"><div class="spinner"></div></div>
    <div class="nav">
      <button class="btn" id="back">Voltar</button>
      <button class="btn primary" id="next" ${state.slot ? '' : 'disabled'}>Continuar</button>
    </div>`;

  $body.querySelectorAll('.day').forEach((el) => el.addEventListener('click', () => {
    state.date = el.dataset.date;
    state.slot = null;
    $body.querySelectorAll('.day').forEach((d) => d.classList.toggle('selected', d === el));
    $body.querySelector('#next').disabled = true;
    loadSlots();
  }));
  $body.querySelector('#back').addEventListener('click', () => go(2));
  $body.querySelector('#next').addEventListener('click', () => go(4));
  $body.querySelector('.day.selected')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  loadSlots();
}

let slotsRequest = 0;
async function loadSlots() {
  const $slots = document.getElementById('slots');
  $slots.innerHTML = '<div class="spinner"></div>';
  const req = ++slotsRequest;
  let slots;
  try {
    const q = new URLSearchParams({ service: state.service.id, date: state.date });
    if (state.barberId) q.set('barber', state.barberId);
    slots = await api(`${BASE}/availability?${q}`);
  } catch (e) {
    $slots.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  if (req !== slotsRequest) return;

  if (!slots.length) {
    const next = await findNextDayWithSlots();
    $slots.innerHTML = `<div class="empty">Sem horários livres em ${fmtDateLong(state.date)}.
      ${next ? `<br><br><button class="btn sm" id="jump">Próximo dia livre: ${fmtDateLong(next)}</button>` : ''}</div>`;
    $slots.querySelector('#jump')?.addEventListener('click', () => {
      $body.querySelector(`.day[data-date="${next}"]`)?.click();
      $body.querySelector(`.day[data-date="${next}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    return;
  }

  const groups = [['Manhã', 0, 720], ['Tarde', 720, 1080], ['Noite', 1080, 1440]];
  $slots.innerHTML = groups.map(([label, from, to]) => {
    const list = slots.filter((s) => s.start >= from && s.start < to);
    if (!list.length) return '';
    return `<div class="period"><h4>${label}</h4><div class="slots">
      ${list.map((s) => `<button class="slot ${state.slot?.start === s.start ? 'selected' : ''}" data-start="${s.start}">${s.time}</button>`).join('')}
    </div></div>`;
  }).join('');
  $slots.querySelectorAll('.slot').forEach((el) => el.addEventListener('click', () => {
    state.slot = slots.find((s) => s.start === Number(el.dataset.start));
    $slots.querySelectorAll('.slot').forEach((x) => x.classList.toggle('selected', x === el));
    $body.querySelector('#next').disabled = false;
  }));
}

async function findNextDayWithSlots() {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(state.date, i);
    if (d > addDays(info.today, info.settings.max_days_ahead)) return null;
    if (!worksOn(d)) continue;
    const q = new URLSearchParams({ service: state.service.id, date: d });
    if (state.barberId) q.set('barber', state.barberId);
    const slots = await api(`${BASE}/availability?${q}`).catch(() => []);
    if (slots.length) return d;
  }
  return null;
}

function summaryHtml({ service, barberName, date, start, end, price }) {
  return `<div class="summary">
    <div class="line"><span>Serviço</span><span>${esc(service)}</span></div>
    <div class="line"><span>Barbeiro</span><span>${esc(barberName)}</span></div>
    <div class="line"><span>Data</span><span>${fmtDateLong(date)}</span></div>
    <div class="line"><span>Horário</span><span>${fmtMin(start)}${end ? ` – ${fmtMin(end)}` : ''}</span></div>
    <div class="line total"><span>Total</span><span>${money(price)}</span></div>
  </div>`;
}

function renderDetails() {
  const profile = store.get(PROFILE_KEY, {});
  const barber = info.barbers.find((b) => b.id === state.barberId);
  $body.innerHTML = `
    <h2 class="step-title">Quase lá!</h2>
    <p class="step-sub muted">Confira o resumo e informe seus dados.</p>
    ${summaryHtml({
      service: state.service.name,
      barberName: barber ? barber.name : 'Primeiro disponível',
      date: state.date,
      start: state.slot.start,
      end: state.slot.start + state.service.duration_min,
      price: state.service.price_cents,
    })}
    <form id="form">
      <div class="field"><label for="name">Seu nome</label>
        <input class="input" id="name" required autocomplete="name" value="${esc(profile.name || '')}" /></div>
      <div class="field"><label for="phone">WhatsApp (com DDD)</label>
        <input class="input" id="phone" required inputmode="tel" autocomplete="tel" placeholder="(11) 98765-4321" value="${esc(profile.phone || '')}" /></div>
      <div class="field"><label for="notes">Observação (opcional)</label>
        <input class="input" id="notes" maxlength="200" placeholder="Ex.: degradê baixo, tesoura em cima" /></div>
      <p class="small muted">Cancelamentos online até ${info.settings.cancel_limit_hours}h antes do horário.</p>
      <div class="nav">
        <button class="btn" type="button" id="back">Voltar</button>
        <button class="btn primary" type="submit" id="submit">Confirmar agendamento</button>
      </div>
    </form>`;
  maskPhone($body.querySelector('#phone'));
  $body.querySelector('#back').addEventListener('click', () => go(3));
  $body.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $body.querySelector('#name').value.trim();
    const phone = $body.querySelector('#phone').value;
    if (phone.replace(/\D/g, '').length < 10) return toast('Informe um WhatsApp válido com DDD.', 'error');
    const btn = $body.querySelector('#submit');
    btn.disabled = true;
    btn.textContent = 'Agendando…';
    try {
      const appt = await api(`${BASE}/appointments`, {
        method: 'POST',
        body: {
          serviceId: state.service.id,
          barberId: state.barberId,
          date: state.date,
          start: state.slot.start,
          name,
          phone,
          notes: $body.querySelector('#notes').value,
        },
      });
      store.set(PROFILE_KEY, { name, phone });
      const saved = store.get(STORE_KEY, []).filter((x) => x.code !== appt.code);
      saved.push({ code: appt.code, date: appt.date, start: appt.start_min });
      store.set(STORE_KEY, saved);
      renderSuccess(appt);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
      if (err.status === 409 && err.message.includes('ocupado')) {
        state.slot = null;
        go(3);
      }
    }
  });
}

function renderSuccess(appt) {
  document.querySelectorAll('#steps li').forEach((li) => { li.classList.remove('active'); li.classList.add('done'); });
  const s = info.settings;
  const msg = `Olá! Acabei de agendar ${appt.service_name} com ${appt.barber_name} em ${fmtDateLong(appt.date)} às ${appt.start}. Código: ${appt.code}`;
  $body.innerHTML = `
    <div class="success">
      <div class="check">✓</div>
      <h2 class="step-title">Horário reservado!</h2>
      <p class="muted">Guarde seu código para consultar ou cancelar:</p>
      <div class="code">${esc(appt.code)}</div>
      ${summaryHtml({ service: appt.service_name, barberName: appt.barber_name, date: appt.date, start: appt.start_min, end: appt.end_min, price: appt.price_cents })}
      ${loyaltyBlock(appt)}
      <div class="stack">
        <a class="btn primary block" target="_blank" rel="noopener" href="${googleCalendarLink({
          title: `${appt.service_name} - ${s.shop_name}`,
          date: appt.date, startMin: appt.start_min, endMin: appt.end_min,
          details: `Barbeiro: ${appt.barber_name}\nCódigo: ${appt.code}\n${location.origin}/meu-horario?codigo=${appt.code}`,
          location: s.shop_address,
        })}">Adicionar à minha agenda</a>
        <a class="btn whats block" target="_blank" rel="noopener" href="${whatsLink(s.shop_phone, msg)}">Avisar a barbearia no WhatsApp</a>
        <button class="btn block" id="new">Fazer outro agendamento</button>
      </div>
    </div>`;
  $body.querySelector('#new').addEventListener('click', () => {
    Object.assign(state, { service: null, barberId: null, date: null, slot: null });
    go(1);
  });
  renderUpcoming();
}

/** Cartão fidelidade do cliente (só aparece se a barbearia ligou e deixou visível). */
function loyaltyBlock(a) {
  const l = a.loyalty;
  if (!l?.goal) return '';
  return `<div style="margin:14px 0">${loyaltyCardHtml(l, `Seu cartão fidelidade${a.shop_name ? ` · ${a.shop_name}` : ''}`)}
    <p class="small muted" style="margin:6px 0 0;text-align:left">${esc(l.summary)} Cada atendimento concluído vale um selo.</p></div>`;
}

/* ------------------------- Meus horários ------------------------- */

async function renderUpcoming() {
  const $up = document.getElementById('upcoming');
  const saved = store.get(STORE_KEY, []).filter((x) => x.date >= todayLocal());
  if (!saved.length) { $up.hidden = true; return; }
  const appts = (await Promise.all(saved.map((x) => api(`/api/public/appointments/${x.code}`).catch(() => null))))
    .filter((a) => a && ['scheduled', 'confirmed'].includes(a.status));
  store.set(STORE_KEY, appts.map((a) => ({ code: a.code, date: a.date, start: a.start_min })));
  if (!appts.length) { $up.hidden = true; return; }
  $up.hidden = false;
  $up.className = 'card';
  $up.innerHTML = `<h3 style="margin-bottom:8px">Seus próximos horários</h3>
    ${appts.map((a) => `<div class="upcoming-item">
      <span class="avatar" style="background:${esc(a.barber_color)}">${esc(a.barber_name[0])}</span>
      <div style="flex:1"><div><b>${esc(a.service_name)}</b> com ${esc(a.barber_name)}</div>
        <div class="small muted">${esc(a.shop_name || '')}</div>
        <div class="small muted">${fmtDateLong(a.date)} às ${a.start}</div></div>
      <button class="btn sm" data-code="${a.code}">Ver</button></div>`).join('')}`;
  $up.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => showLookup(b.dataset.code)));
}

function showLookup(code) {
  const $l = document.getElementById('lookup');
  $l.hidden = false;
  $l.innerHTML = `
    <h3 style="margin-bottom:10px">Consultar agendamento</h3>
    <form id="lookup-form" class="row">
      <input class="input" id="lookup-code" placeholder="Código (ex.: K7Q2XM)" maxlength="12" value="${esc(code || '')}" style="text-transform:uppercase" />
      <button class="btn primary">Buscar</button>
    </form>
    <div id="lookup-result"></div>`;
  $l.querySelector('#lookup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadLookup($l.querySelector('#lookup-code').value.trim());
  });
  $l.scrollIntoView({ behavior: 'smooth' });
  if (code) loadLookup(code);
}

async function loadLookup(code) {
  const $r = document.getElementById('lookup-result');
  if (!code) return;
  $r.innerHTML = '<div class="spinner"></div>';
  try {
    const a = await api(`/api/public/appointments/${encodeURIComponent(code)}`);
    const active = ['scheduled', 'confirmed'].includes(a.status);
    $r.innerHTML = `
      <div style="margin-top:14px" class="row"><span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span>
        <span class="small muted">${esc(a.shop_name || '')} · código ${esc(a.code)}</span></div>
      <div style="margin-top:10px">${summaryHtml({ service: a.service_name, barberName: a.barber_name, date: a.date, start: a.start_min, end: a.end_min, price: a.price_cents })}</div>
      ${loyaltyBlock(a)}
      ${active ? `<div class="row wrap">
        ${a.status === 'scheduled' ? '<button class="btn ok" id="confirm">Confirmar presença</button>' : ''}
        <button class="btn danger" id="cancel">Cancelar horário</button>
        <a class="btn whats" target="_blank" rel="noopener" href="${whatsLink(a.shop_phone, `Olá! Preciso remarcar meu horário (código ${a.code}).`)}">Remarcar pelo WhatsApp</a>
      </div>` : ''}`;
    $r.querySelector('#confirm')?.addEventListener('click', async () => {
      await api(`/api/public/appointments/${a.code}/confirm`, { method: 'POST' });
      toast('Presença confirmada. Até lá!', 'success');
      loadLookup(a.code);
    });
    $r.querySelector('#cancel')?.addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja cancelar este horário?')) return;
      try {
        await api(`/api/public/appointments/${a.code}/cancel`, { method: 'POST' });
        toast('Horário cancelado.', 'success');
        loadLookup(a.code);
        renderUpcoming();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  } catch (e) {
    $r.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
  }
}

init();
