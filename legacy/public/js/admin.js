import {
  api, money, fmtDuration, fmtDateLong, fmtDateShort, fmtMin, addDays, dateStr, parseDate, WEEKDAYS, esc,
  toast, openModal, maskPhone, whatsLink, fmtPhone, STATUS_LABEL, PAYMENT_LABEL, setShopHeader, loyaltyCardHtml,
} from './common.js';

const $view = document.getElementById('view');
const today = () => dateStr(new Date());
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

let settings = null;
let services = [];
let barbers = [];
let agendaTimer = null;
let context = null;

/* ================================================================== */
/* Login / navegação                                                   */
/* ================================================================== */

async function boot() {
  const me = await api('/api/auth/me');
  if (!me.authenticated) return goLogin();
  // Admin da cidade / geral abre o painel de um comércio pelo link /admin?loja=ID.
  const loja = new URLSearchParams(location.search).get('loja');
  if (me.user.role !== 'shop') {
    if (!loja) { location.href = '/painel'; return; }
    setShopHeader(loja);
    const back = document.getElementById('back-panel');
    back.hidden = false;
  }
  context = await api('/api/admin/context');
  document.getElementById('app').hidden = false;
  document.getElementById('who').textContent = `${context.user.name} · ${context.user.role_label}`;
  document.getElementById('see-page').href = context.shop.booking_path;
  await loadBase();
  route();
}

// Com ?loja= quem está aqui é um admin abrindo a agenda de uma barbearia: entra pela cidade.
const loginArea = () => (new URLSearchParams(location.search).has('loja') ? '/entrar/cidade' : '/entrar/barbearia');

function goLogin() {
  location.href = loginArea() + '?volta=' + encodeURIComponent(location.pathname + location.search);
}

document.getElementById('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = loginArea();
});

const bookingUrl = () => location.origin + context.shop.booking_path;

document.getElementById('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(bookingUrl());
    toast('Link copiado! Coloque na bio do Instagram e no WhatsApp.', 'success');
  } catch {
    prompt('Copie o link:', bookingUrl());
  }
});

async function loadBase() {
  [settings, services, barbers] = await Promise.all([
    api('/api/admin/settings'), api('/api/admin/services'), api('/api/admin/barbers'),
  ]);
  document.getElementById('brand').textContent = settings.shop_name;
  document.title = `Painel · ${settings.shop_name}`;
}

const VIEWS = {
  agenda: viewAgenda, lembretes: viewReminders, clientes: viewClients, fidelidade: viewLoyalty, financeiro: viewFinance, config: viewConfig,
};

function route() {
  clearInterval(agendaTimer);
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  const [name, arg] = (location.hash.slice(1) || 'agenda').split('/');
  const view = VIEWS[name] ? name : 'agenda';
  document.querySelectorAll('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  VIEWS[view](arg || undefined).catch(handleError);
}

window.addEventListener('hashchange', route);

function handleError(err) {
  if (err.status === 401) return goLogin();
  console.error(err);
  toast(err.message, 'error');
}

/* ================================================================== */
/* Agenda                                                              */
/* ================================================================== */

const PX = 1.6; // pixels por minuto na linha do tempo

async function viewAgenda(date = today()) {
  $view.innerHTML = `
    <div class="page-head">
      <h1>Agenda</h1>
      <div class="date-nav">
        <button class="btn sm" id="prev" title="Dia anterior">‹</button>
        <button class="btn sm" id="today">Hoje</button>
        <button class="btn sm" id="next" title="Próximo dia">›</button>
        <input type="date" class="input" id="date" value="${date}" />
      </div>
      <div class="spacer"></div>
      <button class="btn" id="block">Bloquear horário</button>
      <button class="btn primary" id="new">+ Agendamento</button>
    </div>
    <h3 class="day-title">${fmtDateLong(date)}</h3>
    <div class="kpis" id="kpis"></div>
    <div id="tl"><div class="spinner"></div></div>
    <div class="legend">
      <span><span class="badge scheduled">Agendado</span></span>
      <span><span class="badge confirmed">Confirmado</span></span>
      <span><span class="badge done">Concluído</span></span>
      <span><span class="badge no_show">Faltou</span></span>
      <span>Clique num espaço vazio para encaixar um cliente.</span>
    </div>`;

  const goDate = (d) => { location.hash = `agenda/${d}`; };
  $view.querySelector('#prev').onclick = () => goDate(addDays(date, -1));
  $view.querySelector('#next').onclick = () => goDate(addDays(date, 1));
  $view.querySelector('#today').onclick = () => goDate(today());
  $view.querySelector('#date').onchange = (e) => e.target.value && goDate(e.target.value);
  $view.querySelector('#new').onclick = () => newAppointmentModal({ date });
  $view.querySelector('#block').onclick = () => blockModal({ date });

  let lastOnlineIds = null;
  const refresh = async () => {
    const data = await api(`/api/admin/agenda?date=${date}`);
    const onlineIds = data.appointments.filter((a) => a.source === 'online').map((a) => a.id);
    if (lastOnlineIds && onlineIds.some((id) => !lastOnlineIds.includes(id))) {
      toast('Novo agendamento online recebido!', 'success');
    }
    lastOnlineIds = onlineIds;
    renderAgendaKpis(data);
    renderTimeline(data);
  };
  await refresh();
  agendaTimer = setInterval(() => refresh().catch(handleError), 30000);
}

function renderAgendaKpis({ appointments }) {
  const active = appointments.filter((a) => a.status !== 'cancelled');
  const done = active.filter((a) => a.status === 'done');
  const noShow = active.filter((a) => a.status === 'no_show');
  const pending = active.filter((a) => a.status === 'scheduled');
  const expected = active.filter((a) => a.status !== 'no_show').reduce((s, a) => s + a.price_cents, 0);
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="label">Atendimentos</div><div class="value">${active.length}</div>
      <div class="hint">${done.length} concluído(s)</div></div>
    <div class="kpi"><div class="label">A confirmar</div><div class="value">${pending.length}</div>
      <div class="hint"><a href="#lembretes/${appointments[0]?.date || ''}">enviar lembretes</a></div></div>
    <div class="kpi gold"><div class="label">Faturado</div><div class="value">${money(done.reduce((s, a) => s + a.price_cents, 0))}</div>
      <div class="hint">previsto ${money(expected)}</div></div>
    <div class="kpi ${noShow.length ? 'bad' : ''}"><div class="label">Faltas</div><div class="value">${noShow.length}</div>
      <div class="hint">${money(noShow.reduce((s, a) => s + a.price_cents, 0))} perdidos</div></div>`;
}

function renderTimeline(data) {
  const { barbers: cols, appointments, blocks, date } = data;
  const $tl = document.getElementById('tl');
  if (!cols.length) {
    $tl.innerHTML = '<div class="card empty">Cadastre um barbeiro em Configurações.</div>';
    return;
  }

  // Faixa visível: do primeiro expediente/agendamento ao último, com folga.
  let from = 8 * 60, to = 20 * 60;
  const starts = [...cols.filter((c) => c.hours).map((c) => c.hours.start_min), ...appointments.map((a) => a.start_min)];
  const ends = [...cols.filter((c) => c.hours).map((c) => c.hours.end_min), ...appointments.map((a) => a.end_min)];
  if (starts.length) from = Math.floor(Math.min(...starts) / 60) * 60;
  if (ends.length) to = Math.ceil(Math.max(...ends) / 60) * 60;
  const height = (to - from) * PX;
  const y = (min) => (min - from) * PX;

  const hourLabels = [];
  for (let m = from; m <= to; m += 60) hourLabels.push(`<div style="top:${y(m)}px">${fmtMin(m)}</div>`);

  const isToday = date === today();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const colHtml = cols.map((b) => {
    const h = b.hours;
    const parts = [];
    for (let m = from; m < to; m += 30) parts.push(`<div class="gridline ${m % 60 ? 'half' : ''}" style="top:${y(m)}px"></div>`);
    if (!h) parts.push(`<div class="closed" style="top:0;height:${height}px"></div>`);
    else {
      if (h.start_min > from) parts.push(`<div class="closed" style="top:0;height:${y(h.start_min)}px"></div>`);
      if (h.end_min < to) parts.push(`<div class="closed" style="top:${y(h.end_min)}px;height:${(to - h.end_min) * PX}px"></div>`);
      if (h.break_start != null) {
        parts.push(`<div class="closed" style="top:${y(h.break_start)}px;height:${(h.break_end - h.break_start) * PX}px"></div>`);
      }
    }
    for (const bl of blocks.filter((x) => !x.barber_id || x.barber_id === b.id)) {
      const s = Math.max(bl.start_min, from), e = Math.min(bl.end_min, to);
      if (e <= s) continue;
      parts.push(`<div class="blocked" data-block="${bl.id}" style="top:${y(s)}px;height:${(e - s) * PX}px">
        🚫 ${esc(bl.reason || 'Bloqueado')}</div>`);
    }
    for (const a of appointments.filter((x) => x.barber_id === b.id && x.status !== 'cancelled')) {
      const hpx = (a.end_min - a.start_min) * PX;
      const tag = a.status === 'confirmed' ? '✔' : a.status === 'done' ? '💈' : a.status === 'no_show' ? '✖' : '';
      parts.push(`<div class="appt ${a.status}" data-appt="${a.id}" style="--c:${esc(b.color)};top:${y(a.start_min) + 1}px;height:${hpx - 2}px"
        title="${esc(a.client_name)} · ${esc(a.service_name)} · ${STATUS_LABEL[a.status]}">
        <span class="tag">${tag}${a.source === 'online' ? ' 🌐' : ''}</span>
        <div class="t">${fmtMin(a.start_min)}–${fmtMin(a.end_min)}</div>
        <div class="n">${esc(a.client_name)}</div>
        ${hpx > 50 ? `<div class="s">${esc(a.service_name)} · ${money(a.price_cents)}</div>` : ''}
      </div>`);
    }
    if (isToday && nowMin >= from && nowMin <= to) parts.push(`<div class="now" style="top:${y(nowMin)}px"></div>`);
    return `<div class="tl-col" data-barber="${b.id}" style="height:${height}px">${parts.join('')}</div>`;
  }).join('');

  $tl.innerHTML = `<div class="timeline"><div class="tl-scroll" style="--cols:${cols.length}">
    <div class="tl-head"><div></div>${cols.map((b) => `<div><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}
      ${b.hours ? '' : '<span class="off">folga</span>'}</div>`).join('')}</div>
    <div class="tl-body"><div class="tl-hours" style="height:${height}px">${hourLabels.join('')}</div>${colHtml}</div>
  </div></div>`;

  $tl.querySelectorAll('[data-appt]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    appointmentModal(appointments.find((a) => a.id === Number(el.dataset.appt)));
  }));
  $tl.querySelectorAll('[data-block]').forEach((el) => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Remover este bloqueio?')) return;
    await api(`/api/admin/blocks/${el.dataset.block}`, { method: 'DELETE' });
    toast('Bloqueio removido.', 'success');
    route();
  }));
  $tl.querySelectorAll('.tl-col').forEach((col) => col.addEventListener('click', (e) => {
    const rect = col.getBoundingClientRect();
    const step = Number(settings.slot_interval) || 15;
    const min = from + Math.floor((e.clientY - rect.top) / PX / step) * step;
    newAppointmentModal({ date, barberId: Number(col.dataset.barber), start: min });
  }));
}

/* ---------------------- Modal de agendamento ---------------------- */

function fillTemplate(a) {
  return settings.reminder_template
    .replaceAll('{cliente}', a.client_name.split(' ')[0])
    .replaceAll('{barbearia}', settings.shop_name)
    .replaceAll('{servico}', a.service_name)
    .replaceAll('{barbeiro}', a.barber_name)
    .replaceAll('{data}', fmtDateLong(a.date))
    .replaceAll('{hora}', fmtMin(a.start_min))
    .replaceAll('{link}', `${location.origin}/meu-horario?codigo=${a.code}`);
}

async function appointmentModal(a) {
  const client = await api(`/api/admin/clients/${a.client_id}`);
  openModal((m, close) => {
    const done = async (body, msg) => {
      try {
        await api(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body });
        toast(msg, 'success');
        close();
        route();
      } catch (err) { handleError(err); }
    };
    const active = ['scheduled', 'confirmed'].includes(a.status);
    m.innerHTML = `
      <div class="detail-head">
        <span class="avatar" style="background:${esc(a.barber_color)};width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#111;font-weight:700">${esc(a.client_name[0])}</span>
        <div style="flex:1"><h3 style="margin:0">${esc(a.client_name)}</h3>
          <a href="${whatsLink(a.client_phone, `Olá ${a.client_name.split(' ')[0]}!`)}" target="_blank" class="small">${fmtPhone(a.client_phone)}</a></div>
        <span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span>
      </div>
      ${client.no_shows ? `<div class="alert">⚠ Este cliente já faltou ${client.no_shows} vez(es) sem avisar.</div>` : ''}
      ${client.loyalty ? `<div style="margin-bottom:12px">${loyaltyCardHtml(client.loyalty)}
        ${client.loyalty.available && !['cancelled', 'no_show'].includes(a.status)
          ? '<button class="btn primary block" id="use-prize" style="margin-top:8px">🎁 Usar prêmio neste atendimento</button>' : ''}</div>` : ''}
      <dl class="detail-grid">
        <dt>Serviço</dt><dd>${esc(a.service_name)}</dd>
        <dt>Barbeiro</dt><dd>${esc(a.barber_name)}</dd>
        <dt>Quando</dt><dd>${fmtDateLong(a.date)}, ${fmtMin(a.start_min)}–${fmtMin(a.end_min)}</dd>
        <dt>Valor</dt><dd>${money(a.price_cents)}${a.payment ? ` · ${PAYMENT_LABEL[a.payment]}` : ''}</dd>
        <dt>Origem</dt><dd>${a.source === 'online' ? 'Agendamento online' : 'Pelo painel'} · código ${esc(a.code)}</dd>
        <dt>Histórico</dt><dd>${client.visits} visita(s) · ${money(client.total_spent)} gastos</dd>
        ${a.notes ? `<dt>Obs.</dt><dd>${esc(a.notes)}</dd>` : ''}
      </dl>
      ${active ? `
        <a class="btn whats block" id="remind" target="_blank" href="${whatsLink(a.client_phone, fillTemplate(a))}">
          ${a.reminded ? 'Reenviar lembrete' : 'Enviar lembrete no WhatsApp'}</a>
        <div class="field" style="margin:14px 0 6px"><label>Concluir atendimento — forma de pagamento</label>
          <div class="pay-row">
            ${['pix', 'dinheiro', 'cartao'].map((p) => `<button class="btn ok sm" data-pay="${p}">✓ ${PAYMENT_LABEL[p]}</button>`).join('')}
          </div></div>
        <div class="btn-grid" style="margin-top:10px">
          ${a.status === 'scheduled' ? '<button class="btn" id="confirm">Marcar confirmado</button>' : ''}
          <button class="btn" id="resched">Remarcar</button>
          <button class="btn danger" id="noshow">Faltou</button>
          <button class="btn danger" id="cancel">Cancelar</button>
        </div>` : `
        <div class="btn-grid">
          <button class="btn" id="reopen">Reabrir agendamento</button>
          ${a.status === 'done' ? `<div class="pay-row">${['pix', 'dinheiro', 'cartao'].map((p) =>
            `<button class="btn sm ${a.payment === p ? 'sel' : ''}" data-setpay="${p}">${PAYMENT_LABEL[p]}</button>`).join('')}</div>` : ''}
        </div>`}
      <div class="actions">
        <a class="btn ghost" href="#clientes/${a.client_id}" id="see-client">Ficha do cliente</a>
        <button class="btn" id="close">Fechar</button>
      </div>`;

    m.querySelector('#close').onclick = close;
    m.querySelector('#see-client').onclick = close;
    m.querySelector('#remind')?.addEventListener('click', () => {
      api(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { reminded: true } }).catch(handleError);
    });
    m.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => done({ status: 'done', payment: b.dataset.pay }, 'Atendimento concluído.')));
    m.querySelectorAll('[data-setpay]').forEach((b) => (b.onclick = () => done({ payment: b.dataset.setpay }, 'Pagamento atualizado.')));
    m.querySelector('#confirm')?.addEventListener('click', () => done({ status: 'confirmed' }, 'Confirmado.'));
    m.querySelector('#noshow')?.addEventListener('click', () => confirm('Marcar que o cliente faltou?') && done({ status: 'no_show' }, 'Falta registrada.'));
    m.querySelector('#cancel')?.addEventListener('click', () => confirm('Cancelar este agendamento? O horário volta a ficar livre.') && done({ status: 'cancelled' }, 'Agendamento cancelado.'));
    m.querySelector('#reopen')?.addEventListener('click', () => done({ status: 'confirmed' }, 'Agendamento reaberto.'));
    m.querySelector('#resched')?.addEventListener('click', () => { close(); newAppointmentModal({ editing: a }); });
    m.querySelector('#use-prize')?.addEventListener('click', async () => {
      if (!confirm(`Usar o prêmio "${client.loyalty.reward_label}" neste atendimento? O valor é ajustado e o cartão volta a contar.`)) return;
      try {
        await api(`/api/admin/clients/${a.client_id}/loyalty/redeem`, { method: 'POST', body: { appointmentId: a.id } });
        toast('Prêmio aplicado!', 'success');
        close();
        route();
      } catch (err) { handleError(err); }
    });
  });
}

/** Cria (ou remarca, com `editing`) um agendamento pelo painel. */
function newAppointmentModal({ date = today(), barberId, start, editing } = {}) {
  const activeServices = services.filter((s) => s.active);
  const activeBarbers = barbers.filter((b) => b.active);
  const init = editing
    ? { date: editing.date, barberId: editing.barber_id, serviceId: editing.service_id, start: editing.start_min }
    : { date, barberId: barberId || activeBarbers[0]?.id, serviceId: activeServices[0]?.id, start };

  openModal((m, close) => {
    m.innerHTML = `
      <h3>${editing ? `Remarcar · ${esc(editing.client_name)}` : 'Novo agendamento'}</h3>
      <form id="f">
        ${editing ? '' : `
        <div class="grid-2">
          <div class="field"><label>Cliente</label><input class="input" id="name" list="clients-dl" required autocomplete="off" placeholder="Nome" /></div>
          <div class="field"><label>WhatsApp</label><input class="input" id="phone" required inputmode="tel" placeholder="(11) 98765-4321" /></div>
        </div>
        <datalist id="clients-dl"></datalist>`}
        <div class="grid-2">
          <div class="field"><label>Serviço</label><select class="input" id="service">
            ${activeServices.map((s) => `<option value="${s.id}" ${s.id === init.serviceId ? 'selected' : ''}>${esc(s.name)} · ${fmtDuration(s.duration_min)} · ${money(s.price_cents)}</option>`).join('')}
          </select></div>
          <div class="field"><label>Barbeiro</label><select class="input" id="barber">
            ${activeBarbers.map((b) => `<option value="${b.id}" ${b.id === init.barberId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Data</label><input class="input" type="date" id="date" value="${init.date}" required /></div>
          <div class="field"><label>Horário</label><input class="input" type="time" id="time" step="300" value="${init.start != null ? fmtMin(init.start) : ''}" required /></div>
        </div>
        <div class="field"><label>Horários livres</label><div class="pay-row" id="free"><span class="small muted">Carregando…</span></div></div>
        ${editing ? '' : '<div class="field"><label>Observação</label><input class="input" id="notes" /></div>'}
        <label class="check small"><input type="checkbox" id="force" /> Encaixe fora do expediente (ignora horário de trabalho e almoço)</label>
        <div class="actions">
          <button type="button" class="btn" id="cancel">Cancelar</button>
          <button class="btn primary">${editing ? 'Salvar novo horário' : 'Agendar'}</button>
        </div>
      </form>`;

    const $ = (id) => m.querySelector('#' + id);
    $('cancel').onclick = close;

    if (!editing) {
      maskPhone($('phone'));
      let found = [];
      $('name').addEventListener('input', async () => {
        const q = $('name').value.trim();
        const match = found.find((c) => c.name === q);
        if (match) { $('phone').value = fmtPhone(match.phone); return; }
        if (q.length < 2) return;
        found = await api(`/api/admin/clients?q=${encodeURIComponent(q)}`);
        $('clients-dl').innerHTML = found.slice(0, 8).map((c) => `<option value="${esc(c.name)}">${fmtPhone(c.phone)}</option>`).join('');
      });
    }

    const loadFree = async () => {
      const $free = $('free');
      try {
        const slots = await api(`/api/admin/availability?service=${$('service').value}&barber=${$('barber').value}&date=${$('date').value}&exclude=${editing?.id || ''}`);
        const list = slots.slice(0, 40);
        $free.innerHTML = list.length
          ? list.map((s) => `<button type="button" class="btn sm" data-t="${s.time}">${s.time}</button>`).join('')
          : '<span class="small muted">Nenhum horário livre neste dia (use o encaixe se necessário).</span>';
        $free.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
          $('time').value = b.dataset.t;
          $free.querySelectorAll('.btn').forEach((x) => x.classList.toggle('sel', x === b));
        }));
      } catch (err) { $free.innerHTML = `<span class="small muted">${esc(err.message)}</span>`; }
    };
    ['service', 'barber', 'date'].forEach((id) => $(id).addEventListener('change', loadFree));
    loadFree();

    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        serviceId: Number($('service').value),
        barberId: Number($('barber').value),
        date: $('date').value,
        start: $('time').value,
        force: $('force').checked,
      };
      try {
        if (editing) {
          await api(`/api/admin/appointments/${editing.id}`, { method: 'PATCH', body });
          toast('Horário remarcado. Avise o cliente pelo WhatsApp.', 'success');
        } else {
          await api('/api/admin/appointments', {
            method: 'POST',
            body: { ...body, name: $('name').value, phone: $('phone').value, notes: $('notes').value },
          });
          toast('Agendamento criado.', 'success');
        }
        close();
        if (location.hash.startsWith('#agenda') && body.date !== (location.hash.split('/')[1] || today())) {
          location.hash = `agenda/${body.date}`;
        } else route();
      } catch (err) { handleError(err); }
    });
  });
}

function blockModal({ date = today() } = {}) {
  openModal((m, close) => {
    m.innerHTML = `
      <h3>Bloquear horário</h3>
      <p class="small muted" style="margin-top:-6px">Folga, férias, médico, curso… Clientes não conseguirão agendar nesse período.</p>
      <form id="f">
        <div class="field"><label>Quem</label><select class="input" id="barber">
          <option value="">Barbearia inteira</option>
          ${barbers.filter((b) => b.active).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
        </select></div>
        <div class="grid-2">
          <div class="field"><label>De</label><input class="input" type="date" id="ds" value="${date}" required /></div>
          <div class="field"><label>Até</label><input class="input" type="date" id="de" value="${date}" required /></div>
        </div>
        <label class="check small" style="margin-bottom:12px"><input type="checkbox" id="allday" checked /> Dia inteiro</label>
        <div class="grid-2" id="times" hidden>
          <div class="field"><label>Das</label><input class="input" type="time" id="ts" value="12:00" /></div>
          <div class="field"><label>Até</label><input class="input" type="time" id="te" value="14:00" /></div>
        </div>
        <div class="field"><label>Motivo</label><input class="input" id="reason" placeholder="Ex.: Folga, Férias, Médico" /></div>
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Bloquear</button></div>
      </form>`;
    const $ = (id) => m.querySelector('#' + id);
    $('cancel').onclick = close;
    $('allday').onchange = () => ($('times').hidden = $('allday').checked);
    $('ds').onchange = () => { if ($('de').value < $('ds').value) $('de').value = $('ds').value; };
    $('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/admin/blocks', {
          method: 'POST',
          body: {
            barber_id: $('barber').value || null,
            date_start: $('ds').value,
            date_end: $('de').value,
            start: $('allday').checked ? null : $('ts').value,
            end: $('allday').checked ? null : $('te').value,
            reason: $('reason').value,
          },
        });
        toast('Horário bloqueado.', 'success');
        close();
        route();
      } catch (err) { handleError(err); }
    });
  });
}

/* ================================================================== */
/* Lembretes (combate às faltas)                                       */
/* ================================================================== */

async function viewReminders(date = addDays(today(), 1)) {
  const list = await api(`/api/admin/reminders?date=${date}`);
  const pending = list.filter((a) => !a.reminded);
  $view.innerHTML = `
    <div class="page-head">
      <h1>Lembretes</h1>
      <div class="date-nav">
        <button class="btn sm ${date === today() ? 'primary' : ''}" data-d="${today()}">Hoje</button>
        <button class="btn sm ${date === addDays(today(), 1) ? 'primary' : ''}" data-d="${addDays(today(), 1)}">Amanhã</button>
        <input type="date" class="input" id="date" value="${date}" />
      </div>
    </div>
    <p class="muted" style="margin-top:-6px">Mandar lembrete na véspera reduz muito as faltas. Clique em cada botão para abrir o WhatsApp com a mensagem pronta —
      o cliente recebe um link para <b>confirmar ou cancelar</b> sozinho, liberando o horário para outra pessoa.</p>
    <div class="kpis">
      <div class="kpi"><div class="label">Agendamentos</div><div class="value">${list.length}</div><div class="hint">${fmtDateLong(date)}</div></div>
      <div class="kpi ${pending.length ? 'gold' : ''}"><div class="label">Falta lembrar</div><div class="value">${pending.length}</div></div>
      <div class="kpi"><div class="label">Confirmados</div><div class="value">${list.filter((a) => a.status === 'confirmed').length}</div></div>
    </div>
    <div class="list">
      ${list.length ? list.map((a) => `
        <div class="list-item">
          <span class="dot" style="background:${esc(a.barber_color)}"></span>
          <div style="font-weight:700;font-variant-numeric:tabular-nums">${fmtMin(a.start_min)}</div>
          <div class="grow"><b>${esc(a.client_name)}</b> <span class="small muted">${fmtPhone(a.client_phone)}</span>
            <div class="small muted">${esc(a.service_name)} com ${esc(a.barber_name)}</div></div>
          <span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span>
          <a class="btn sm ${a.reminded ? '' : 'whats'}" target="_blank" data-id="${a.id}"
            href="${whatsLink(a.client_phone, fillTemplate(a))}">${a.reminded ? '✓ Lembrado · reenviar' : 'Enviar lembrete'}</a>
        </div>`).join('') : '<div class="card empty">Nenhum agendamento para este dia.</div>'}
    </div>`;
  $view.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => (location.hash = `lembretes/${b.dataset.d}`)));
  $view.querySelector('#date').onchange = (e) => (location.hash = `lembretes/${e.target.value}`);
  $view.querySelectorAll('a[data-id]').forEach((a) => a.addEventListener('click', async () => {
    await api(`/api/admin/appointments/${a.dataset.id}`, { method: 'PATCH', body: { reminded: true } });
    a.classList.remove('whats');
    a.textContent = '✓ Lembrado · reenviar';
  }));
}

/* ================================================================== */
/* Clientes                                                            */
/* ================================================================== */

async function viewClients(id) {
  $view.innerHTML = `
    <div class="page-head">
      <h1>Clientes</h1><div class="spacer"></div>
      <input class="input" id="q" placeholder="Buscar por nome ou telefone" style="max-width:280px" />
    </div>
    <div class="tabs" id="filters">
      <button class="active" data-f="all">Todos</button>
      <button data-f="away">Sumidos (+30 dias)</button>
      <button data-f="noshow">Com faltas</button>
      <button data-f="top">Mais fiéis</button>
      <button data-f="prize" hidden>🎁 Com prêmio</button>
    </div>
    <div id="list"><div class="spinner"></div></div>`;

  let filter = 'all';
  let rows = [];
  const limit = addDays(today(), -30);
  const render = () => {
    let r = rows;
    if (filter === 'away') r = r.filter((c) => c.last_visit && c.last_visit < limit && !c.next_visit);
    if (filter === 'noshow') r = r.filter((c) => c.no_shows > 0).sort((a, b) => b.no_shows - a.no_shows);
    if (filter === 'top') r = [...r].sort((a, b) => b.total_spent - a.total_spent).slice(0, 30);
    if (filter === 'prize') r = r.filter((c) => c.loyalty?.available);
    const loyal = rows.some((c) => c.loyalty);
    $view.querySelector('[data-f="prize"]').hidden = !loyal;
    document.getElementById('list').innerHTML = r.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Cliente</th><th>WhatsApp</th><th class="num">Visitas</th><th class="num">Faltas</th>
        <th class="num">Total gasto</th>${loyal ? '<th>Fidelidade</th>' : ''}<th>Última visita</th><th>Próximo</th>${filter === 'away' ? '<th></th>' : ''}</tr></thead>
      <tbody>${r.map((c) => `<tr class="click" data-id="${c.id}">
        <td><b>${esc(c.name)}</b> ${c.blocked ? '<span class="badge no_show">bloqueado</span>' : ''}</td>
        <td>${fmtPhone(c.phone)}</td>
        <td class="num">${c.visits}</td>
        <td class="num" style="${c.no_shows ? 'color:#ff9f96' : ''}">${c.no_shows}</td>
        <td class="num">${money(c.total_spent)}</td>
        ${loyal ? `<td>${!c.loyalty ? '' : c.loyalty.available ? `<span class="badge done">🎁 ${c.loyalty.available > 1 ? `${c.loyalty.available} prêmios` : 'prêmio'}</span>`
          : `${c.loyalty.stamps % c.loyalty.goal}/${c.loyalty.goal}`}</td>` : ''}
        <td>${c.last_visit ? fmtDateShort(c.last_visit) : '—'}</td>
        <td>${c.next_visit ? fmtDateShort(c.next_visit) : '—'}</td>
        ${filter === 'away' ? `<td><a class="btn whats sm" target="_blank" data-stop href="${whatsLink(c.phone,
          `Olá ${c.name.split(' ')[0]}! Faz tempo que você não aparece na ${settings.shop_name}. Bora dar um trato no visual? Agende aqui: ${bookingUrl()}`)}">Chamar de volta</a></td>` : ''}
      </tr>`).join('')}</tbody></table></div>` : '<div class="card empty">Nenhum cliente encontrado.</div>';
    document.querySelectorAll('#list tr[data-id]').forEach((tr) => (tr.onclick = () => clientModal(Number(tr.dataset.id))));
    document.querySelectorAll('#list [data-stop]').forEach((a) => (a.onclick = (e) => e.stopPropagation()));
  };
  const load = async () => { rows = await api(`/api/admin/clients?q=${encodeURIComponent($view.querySelector('#q').value)}`); render(); };
  let t;
  $view.querySelector('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $view.querySelectorAll('#filters button').forEach((b) => (b.onclick = () => {
    filter = b.dataset.f;
    $view.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }));
  await load();
  if (id) clientModal(Number(id));
}

async function clientModal(id) {
  const c = await api(`/api/admin/clients/${id}`);
  openModal((m, close) => {
    m.style.maxWidth = '640px';
    m.innerHTML = `
      <h3>${esc(c.name)}</h3>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi"><div class="label">Visitas</div><div class="value">${c.visits}</div></div>
        <div class="kpi"><div class="label">Faltas</div><div class="value">${c.no_shows}</div></div>
        <div class="kpi"><div class="label">Cancel.</div><div class="value">${c.cancellations}</div></div>
        <div class="kpi gold"><div class="label">Gasto</div><div class="value" style="font-size:18px">${money(c.total_spent)}</div></div>
      </div>
      ${c.loyalty ? `<div style="margin-bottom:16px">${loyaltyCardHtml(c.loyalty)}
        <div class="row wrap" style="margin-top:8px">
          ${c.loyalty.available ? '<button type="button" class="btn primary sm" id="redeem">🎁 Usar prêmio</button>' : ''}
          <button type="button" class="btn sm" data-adjust="1">+1 selo</button>
          <button type="button" class="btn sm" data-adjust="-1">−1 selo</button>
          ${c.loyalty.available ? `<a class="btn whats sm" target="_blank" href="${whatsLink(c.phone,
            `Olá ${c.name.split(' ')[0]}! Você completou o cartão fidelidade da ${settings.shop_name} e ganhou ${c.loyalty.reward_label}. É só agendar: ${bookingUrl()}`)}">Avisar que ganhou</a>` : ''}
        </div>
        ${c.loyalty.history.length ? `<div class="small muted" style="margin-top:8px">${c.loyalty.history.slice(0, 5).map((h) =>
          `${fmtDateShort(h.created_at.slice(0, 10))}: ${h.kind === 'redeem' ? `prêmio usado (${esc(h.reward)})`
            : `${h.stamps > 0 ? '+' : ''}${h.stamps} selo(s) à mão${h.note ? ` — ${esc(h.note)}` : ''}`}`).join(' · ')}</div>` : ''}
      </div>` : ''}
      <form id="f">
        <div class="grid-2">
          <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(c.name)}" required /></div>
          <div class="field"><label>WhatsApp</label><input class="input" id="phone" value="${esc(fmtPhone(c.phone))}" required /></div>
        </div>
        <div class="field"><label>Anotações (preferências, tipo de corte, alergias…)</label>
          <textarea class="input" id="notes">${esc(c.notes || '')}</textarea></div>
        <label class="check small"><input type="checkbox" id="blocked" ${c.blocked ? 'checked' : ''} /> Bloquear agendamento online deste cliente</label>
        <div class="actions">
          <a class="btn whats" target="_blank" href="${whatsLink(c.phone, `Olá ${c.name.split(' ')[0]}!`)}">WhatsApp</a>
          <div class="spacer"></div>
          <button type="button" class="btn" id="close">Fechar</button>
          <button class="btn primary">Salvar</button>
        </div>
      </form>
      <h4 class="section-title" style="font-size:16px">Histórico</h4>
      ${c.history.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Serviço</th><th>Barbeiro</th><th class="num">Valor</th><th>Status</th></tr></thead>
        <tbody>${c.history.map((a) => `<tr><td>${fmtDateShort(a.date)} ${fmtMin(a.start_min)}</td><td>${esc(a.service_name)}</td>
          <td>${esc(a.barber_name)}</td><td class="num">${money(a.price_cents)}</td><td><span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Sem atendimentos ainda.</p>'}`;
    maskPhone(m.querySelector('#phone'));
    m.querySelector('#close').onclick = close;
    const loyaltyAction = async (path, body, msg) => {
      try {
        await api(`/api/admin/clients/${id}/loyalty/${path}`, { method: 'POST', body });
        toast(msg, 'success');
        close();
        clientModal(id).catch(handleError);
      } catch (err) { handleError(err); }
    };
    m.querySelector('#redeem')?.addEventListener('click', () =>
      confirm(`Usar o prêmio "${c.loyalty.reward_label}" agora? O cartão volta a contar.`) && loyaltyAction('redeem', {}, 'Prêmio usado.'));
    m.querySelectorAll('[data-adjust]').forEach((b) => (b.onclick = () =>
      loyaltyAction('adjust', { stamps: Number(b.dataset.adjust), note: 'ajuste no painel' }, 'Cartão atualizado.')));
    m.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api(`/api/admin/clients/${id}`, {
          method: 'PUT',
          body: {
            name: m.querySelector('#name').value,
            phone: m.querySelector('#phone').value,
            notes: m.querySelector('#notes').value,
            blocked: m.querySelector('#blocked').checked,
          },
        });
        toast('Cliente atualizado.', 'success');
        close();
        if (location.hash.startsWith('#clientes')) viewClients().catch(handleError);
      } catch (err) { handleError(err); }
    });
  });
}

/* ================================================================== */
/* Fidelidade                                                          */
/* ================================================================== */

async function viewLoyalty() {
  const data = await api('/api/admin/loyalty');
  const c = data.config;
  const active = services.filter((s) => s.active || c.services.includes(s.id) || s.id === c.reward_service);
  const prizes = data.ready.reduce((n, x) => n + x.available, 0);
  const firstName = (name) => name.split(' ')[0];
  const clientRows = (list, msg) => list.map((x) => `<tr class="click" data-id="${x.id}">
    <td><b>${esc(x.name)}</b><div class="small muted">${fmtPhone(x.phone)}</div></td>
    <td class="num">${x.available ? `🎁 ${x.available}` : `${x.stamps % x.goal}/${x.goal}`}</td>
    <td><a class="btn whats sm" target="_blank" data-stop href="${whatsLink(x.phone, msg(x))}">Avisar</a></td></tr>`).join('');

  $view.innerHTML = `
    <div class="page-head"><h1>Cartão fidelidade</h1><div class="spacer"></div>
      <span class="badge ${c.enabled ? 'done' : 'cancelled'}">${c.enabled ? 'Ligado' : 'Desligado'}</span></div>
    ${c.enabled ? `<div class="kpis">
      <div class="kpi"><div class="label">Clientes com selos</div><div class="value">${data.participants}</div></div>
      <div class="kpi gold"><div class="label">Prêmios a usar</div><div class="value">${prizes}</div></div>
      <div class="kpi"><div class="label">Quase lá</div><div class="value">${data.close.length}</div><div class="hint">faltam 1 ou 2</div></div>
      <div class="kpi"><div class="label">Prêmios usados</div><div class="value">${data.redeemed_30d}</div><div class="hint">últimos 30 dias</div></div>
    </div>` : ''}
    <div class="panel-grid">
      <form class="card" id="f">
        <h3 style="margin-bottom:14px;font-size:18px">Regras</h3>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" id="enabled" ${c.enabled ? 'checked' : ''} /> <b>Ligar cartão fidelidade</b></label>
        <div class="grid-2">
          <div class="field"><label for="goal">Atendimentos para ganhar</label>
            <input class="input" type="number" min="2" max="100" id="goal" value="${c.goal}" /><span class="small muted">Ex.: 10 = o cliente ganha a cada 10 visitas.</span></div>
          <div class="field"><label for="reward_type">Prêmio</label>
            <select class="input" id="reward_type">
              <option value="service" ${c.reward_type === 'service' ? 'selected' : ''}>Um serviço grátis</option>
              <option value="percent" ${c.reward_type === 'percent' ? 'selected' : ''}>Desconto (%)</option>
              <option value="other" ${c.reward_type === 'other' ? 'selected' : ''}>Outro prêmio</option>
            </select></div>
        </div>
        <div class="field" data-for="service"><label for="reward_service">Serviço grátis</label>
          <select class="input" id="reward_service">${active.map((s) => `<option value="${s.id}" ${s.id === c.reward_service ? 'selected' : ''}>${esc(s.name)} (${money(s.price_cents)})</option>`).join('')}</select></div>
        <div class="field" data-for="percent"><label for="reward_percent">Desconto (%)</label>
          <input class="input" type="number" min="1" max="100" id="reward_percent" value="${c.reward_percent}" /></div>
        <div class="field" data-for="other"><label for="reward_text">Qual prêmio?</label>
          <input class="input" id="reward_text" maxlength="80" placeholder="Ex.: uma pomada modeladora" value="${esc(c.reward_text)}" /></div>
        <div class="field"><label>Quais serviços contam selo</label>
          <div class="row wrap">${active.map((s) => `<label class="check small"><input type="checkbox" data-svc="${s.id}" ${c.services.includes(s.id) ? 'checked' : ''} /> ${esc(s.name)}</label>`).join('')}</div>
          <span class="small muted">Nenhum marcado = todos contam.</span></div>
        <div class="grid-2">
          <div class="field"><label for="min_cents">Valor mínimo (R$)</label>
            <input class="input" type="number" min="0" step="0.01" id="min_cents" value="${(c.min_cents / 100).toFixed(2)}" /><span class="small muted">Atendimentos mais baratos não contam. 0 = qualquer valor.</span></div>
          <div class="field"><label for="expire_days">Selos valem por (dias)</label>
            <input class="input" type="number" min="0" id="expire_days" value="${c.expire_days}" /><span class="small muted">0 = não vencem.</span></div>
        </div>
        <div class="field"><label for="start">Contar atendimentos a partir de</label>
          <input class="input" type="date" id="start" value="${c.start || ''}" /><span class="small muted">Ao ligar, começa a contar de hoje. Apague a data para contar todo o histórico.</span></div>
        <label class="check small" style="margin-bottom:16px"><input type="checkbox" id="public" ${c.public ? 'checked' : ''} /> Mostrar o cartão para o cliente na página de agendamento</label>
        <button class="btn primary">Salvar</button>
      </form>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <h3 style="margin-bottom:8px;font-size:18px">Como o cliente vê</h3>
          <p class="muted small" id="summary"></p>
          <div id="preview"></div>
          <p class="small muted" style="margin-top:10px">Cada atendimento concluído na agenda vira um selo. Para dar o prêmio, abra o atendimento ou a ficha do cliente e toque em <b>Usar prêmio</b>.</p>
        </div>
        ${c.enabled ? `<div class="card">
          <h3 style="margin-bottom:8px;font-size:18px">🎁 Com prêmio para usar</h3>
          ${data.ready.length ? `<div class="table-wrap"><table><tbody>${clientRows(data.ready, (x) =>
            `Olá ${firstName(x.name)}! Você completou o cartão fidelidade da ${settings.shop_name} e ganhou ${x.reward_label}. É só agendar: ${bookingUrl()}`)}</tbody></table></div>`
            : '<p class="muted small">Ninguém ainda.</p>'}
          ${data.close.length ? `<h4 style="margin:16px 0 8px">Quase lá</h4><div class="table-wrap"><table><tbody>${clientRows(data.close, (x) =>
            `Olá ${firstName(x.name)}! Faltam só ${x.missing} atendimento(s) para você ganhar ${x.reward_label} na ${settings.shop_name}. Agende: ${bookingUrl()}`)}</tbody></table></div>` : ''}
        </div>` : ''}
      </div>
    </div>`;

  const $f = $view.querySelector('#f');
  const val = (id) => $f.querySelector(`#${id}`).value;
  const form = () => ({
    enabled: $f.querySelector('#enabled').checked,
    goal: Number(val('goal')),
    reward_type: val('reward_type'),
    reward_service: Number(val('reward_service')) || null,
    reward_percent: Number(val('reward_percent')),
    reward_text: val('reward_text'),
    services: [...$f.querySelectorAll('[data-svc]:checked')].map((el) => Number(el.dataset.svc)),
    min_cents: Math.round(Number(val('min_cents')) * 100),
    expire_days: Number(val('expire_days')),
    start: val('start'),
    public: $f.querySelector('#public').checked,
  });
  // Pré-visualização ao vivo enquanto o dono mexe nas regras.
  const preview = () => {
    const b = form();
    $f.querySelectorAll('[data-for]').forEach((el) => (el.hidden = el.dataset.for !== b.reward_type));
    const goal = Math.min(100, Math.max(2, b.goal || 10));
    const svc = services.find((s) => s.id === b.reward_service);
    const reward = b.reward_type === 'service' ? `${svc?.name || 'um serviço'} grátis`
      : b.reward_type === 'percent' ? `${b.reward_percent || 0}% de desconto` : b.reward_text.trim() || 'um prêmio';
    const counts = b.services.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean);
    $view.querySelector('#summary').textContent = `A cada ${goal} atendimentos${counts.length ? ` (${counts.join(', ')})` : ''}, ganhe ${reward}.`
      + (b.expire_days ? ` Selos valem ${b.expire_days} dias.` : '');
    const sample = Math.min(goal - 1, Math.ceil(goal * 0.6));
    $view.querySelector('#preview').innerHTML = loyaltyCardHtml({ stamps: sample, goal, available: 0, missing: goal - sample, reward_label: reward });
  };
  $f.addEventListener('input', preview);
  $f.addEventListener('change', preview);
  preview();
  $f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/loyalty', { method: 'PUT', body: form() });
      toast('Cartão fidelidade salvo.', 'success');
      viewLoyalty().catch(handleError);
    } catch (err) { handleError(err); }
  });
  $view.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => clientModal(Number(tr.dataset.id)).catch(handleError)));
  $view.querySelectorAll('[data-stop]').forEach((a) => (a.onclick = (e) => e.stopPropagation()));
}

/* ================================================================== */
/* Financeiro                                                          */
/* ================================================================== */

async function viewFinance(range) {
  const t = today();
  const firstOfMonth = t.slice(0, 8) + '01';
  const lastMonthEnd = addDays(firstOfMonth, -1);
  const presets = {
    hoje: [t, t, 'Hoje'],
    '7d': [addDays(t, -6), t, '7 dias'],
    mes: [firstOfMonth, t, 'Este mês'],
    'mes-passado': [lastMonthEnd.slice(0, 8) + '01', lastMonthEnd, 'Mês passado'],
    '30d': [addDays(t, -29), t, '30 dias'],
  };
  let [from, to] = presets[range] || (range?.includes('_') ? range.split('_') : presets.mes);

  const r = await api(`/api/admin/reports?from=${from}&to=${to}`);
  const tt = r.totals;
  const ticket = tt.done ? tt.revenue / tt.done : 0;
  const finished = tt.done + tt.no_show;
  const noShowRate = finished ? Math.round((tt.no_show / finished) * 100) : 0;
  const onlineRate = tt.total ? Math.round((tt.online / tt.total) * 100) : 0;

  // Série diária completa (dias sem movimento aparecem zerados).
  const series = [];
  for (let d = from; d <= to && series.length < 62; d = addDays(d, 1)) {
    series.push(r.byDay.find((x) => x.date === d) || { date: d, revenue: 0, done: 0 });
  }
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));
  const maxBarber = Math.max(1, ...r.byBarber.map((b) => b.revenue));
  const maxService = Math.max(1, ...r.byService.map((s) => s.revenue));

  $view.innerHTML = `
    <div class="page-head">
      <h1>Financeiro</h1><div class="spacer"></div>
      <div class="date-nav">
        <input type="date" class="input" id="from" value="${from}" /> <span class="muted">até</span>
        <input type="date" class="input" id="to" value="${to}" />
      </div>
    </div>
    <div class="tabs">${Object.entries(presets).map(([k, [f, e, label]]) =>
      `<button data-k="${k}" class="${f === from && e === to ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="kpis">
      <div class="kpi gold"><div class="label">Faturamento</div><div class="value">${money(tt.revenue)}</div><div class="hint">${tt.done} atendimento(s)</div></div>
      <div class="kpi"><div class="label">Ticket médio</div><div class="value">${money(ticket)}</div></div>
      <div class="kpi"><div class="label">A receber (agendado)</div><div class="value">${money(tt.expected)}</div><div class="hint">${tt.pending} horário(s)</div></div>
      <div class="kpi ${tt.no_show ? 'bad' : ''}"><div class="label">Faltas</div><div class="value">${tt.no_show}</div>
        <div class="hint">${noShowRate}% · ${money(tt.lost_no_show)} perdidos</div></div>
      <div class="kpi"><div class="label">Cancelamentos</div><div class="value">${tt.cancelled}</div></div>
      <div class="kpi"><div class="label">Agendado online</div><div class="value">${onlineRate}%</div><div class="hint">dos agendamentos</div></div>
    </div>

    <div class="card">
      <div class="row"><b>Faturamento por dia</b><div class="spacer"></div><span class="small muted">${fmtDateShort(from)} – ${fmtDateShort(to)}</span></div>
      <div class="chart">${series.map((s) => `<div class="col" title="${fmtDateShort(s.date)}: ${money(s.revenue)} (${s.done} atend.)">
        <div class="b" style="height:${(s.revenue / maxRev) * 100}%"></div>
        <div class="l">${series.length <= 16 || parseDate(s.date).getDate() % 5 === 1 ? parseDate(s.date).getDate() : '&nbsp;'}</div></div>`).join('')}</div>
    </div>

    <h3 class="section-title">Por barbeiro · comissões</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Barbeiro</th><th class="num">Atend.</th><th class="num">Faltas</th><th class="num">Faturado</th><th></th>
        <th class="num">Comissão</th><th class="num">A pagar</th><th class="num">Fica p/ casa</th></tr></thead>
      <tbody>${r.byBarber.map((b) => `<tr>
        <td><span class="dot" style="background:${esc(b.color)}"></span> ${esc(b.name)}</td>
        <td class="num">${b.done}</td><td class="num">${b.no_show}</td><td class="num">${money(b.revenue)}</td>
        <td><div class="bar"><span style="width:${(b.revenue / maxBarber) * 100}%;background:${esc(b.color)}"></span></div></td>
        <td class="num">${b.commission_pct}%</td><td class="num"><b>${money(b.commission_cents)}</b></td>
        <td class="num">${money(b.revenue - b.commission_cents)}</td></tr>`).join('')}</tbody>
    </table></div>

    <div class="panel-grid" style="margin-top:16px">
      <div class="card"><b>Serviços mais vendidos</b>
        ${r.byService.length ? r.byService.map((s) => `<div style="margin-top:12px">
          <div class="row small"><span>${esc(s.name)} <span class="muted">· ${s.done}x</span></span><div class="spacer"></div><b>${money(s.revenue)}</b></div>
          <div class="bar" style="margin-top:5px"><span style="width:${(s.revenue / maxService) * 100}%"></span></div></div>`).join('')
          : '<p class="muted">Sem dados no período.</p>'}
      </div>
      <div class="card"><b>Formas de pagamento</b>
        ${r.byPayment.length ? r.byPayment.map((p) => `<div class="row small" style="margin-top:12px">
          <span>${PAYMENT_LABEL[p.payment] || p.payment} <span class="muted">· ${p.n}x</span></span><div class="spacer"></div><b>${money(p.revenue)}</b></div>`).join('')
          : '<p class="muted">Sem dados no período.</p>'}
      </div>
    </div>`;

  $view.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => (location.hash = `financeiro/${b.dataset.k}`)));
  const custom = () => {
    const f = $view.querySelector('#from').value, e = $view.querySelector('#to').value;
    if (f && e && f <= e) location.hash = `financeiro/${f}_${e}`;
  };
  $view.querySelector('#from').onchange = custom;
  $view.querySelector('#to').onchange = custom;
}

/* ================================================================== */
/* Configurações                                                       */
/* ================================================================== */

async function viewConfig(tab = 'barbearia') {
  await loadBase();
  const tabs = { barbearia: 'Barbearia', servicos: 'Serviços', barbeiros: 'Barbeiros e horários', bloqueios: 'Folgas e bloqueios' };
  $view.innerHTML = `
    <div class="page-head"><h1>Configurações</h1></div>
    <div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div id="tab"></div>`;
  $view.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => (location.hash = `config/${b.dataset.t}`)));
  const $tab = $view.querySelector('#tab');
  ({ barbearia: cfgShop, servicos: cfgServices, barbeiros: cfgBarbers, bloqueios: cfgBlocks })[tab]?.($tab);
}

function cfgShop($tab) {
  const s = settings;
  const num = (id, label, hint, value) => `<div class="field"><label for="${id}">${label}</label>
    <input class="input" type="number" min="0" id="${id}" value="${esc(value)}" /><span class="small muted">${hint}</span></div>`;
  $tab.innerHTML = `
    <div class="panel-grid">
      <form class="card" id="f">
        <h3 style="margin-bottom:14px;font-size:18px">Dados e regras</h3>
        <div class="field"><label>Nome da barbearia</label><input class="input" id="shop_name" value="${esc(s.shop_name)}" /></div>
        <div class="field"><label>WhatsApp da barbearia</label><input class="input" id="shop_phone" value="${esc(fmtPhone(s.shop_phone))}" /></div>
        <div class="field"><label>Endereço</label><input class="input" id="shop_address" value="${esc(s.shop_address)}" /></div>
        <div class="grid-2">
          ${num('slot_interval', 'Intervalo da grade (min)', 'De quanto em quanto tempo aparecem horários.', s.slot_interval)}
          ${num('min_advance_min', 'Antecedência mínima (min)', 'Evita agendamento "em cima da hora".', s.min_advance_min)}
          ${num('max_days_ahead', 'Agenda aberta (dias)', 'Até quantos dias à frente o cliente vê.', s.max_days_ahead)}
          ${num('cancel_limit_hours', 'Cancelar online até (horas antes)', 'Depois disso, só pelo WhatsApp.', s.cancel_limit_hours)}
          ${num('max_active_per_phone', 'Agendamentos por cliente', 'Máximo de horários futuros por telefone.', s.max_active_per_phone)}
          ${num('block_after_no_shows', 'Bloquear após X faltas', 'Cliente que falta muito precisa falar com você.', s.block_after_no_shows)}
        </div>
        <div class="field"><label>Mensagem de lembrete (WhatsApp)</label>
          <textarea class="input" id="reminder_template" rows="4">${esc(s.reminder_template)}</textarea>
          <span class="small muted">Variáveis: {cliente} {barbearia} {servico} {barbeiro} {data} {hora} {link}</span></div>
        <button class="btn primary">Salvar</button>
      </form>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <h3 style="margin-bottom:8px;font-size:18px">Link de agendamento</h3>
          <p class="small muted">Divulgue na bio do Instagram, no status do WhatsApp e no Google Meu Negócio.</p>
          <div class="row"><input class="input" readonly value="${bookingUrl()}" id="link" />
            <button class="btn" id="copy">Copiar</button></div>
        </div>
        <form class="card" id="pw">
          <h3 style="margin-bottom:14px;font-size:18px">Minha senha</h3>
          <div class="field"><label>Senha atual</label><input class="input" type="password" id="cur" autocomplete="current-password" required /></div>
          <div class="field"><label>Nova senha</label><input class="input" type="password" id="nxt" autocomplete="new-password" minlength="6" required /></div>
          <button class="btn">Alterar senha</button>
        </form>
      </div>
    </div>`;
  maskPhone($tab.querySelector('#shop_phone'));
  $tab.querySelector('#copy').onclick = () => navigator.clipboard.writeText($tab.querySelector('#link').value).then(() => toast('Link copiado!', 'success'));
  $tab.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    for (const el of $tab.querySelectorAll('#f .input')) body[el.id] = el.value;
    try {
      await api('/api/admin/settings', { method: 'PUT', body });
      await loadBase();
      toast('Configurações salvas.', 'success');
    } catch (err) { handleError(err); }
  });
  $tab.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/password', { method: 'PUT', body: { current: $tab.querySelector('#cur').value, next: $tab.querySelector('#nxt').value } });
      toast('Senha alterada.', 'success');
      e.target.reset();
    } catch (err) { handleError(err); }
  });
}

function cfgServices($tab) {
  $tab.innerHTML = `
    <div class="row" style="margin-bottom:12px"><span class="muted">Preço e duração definem a agenda online.</span><div class="spacer"></div>
      <button class="btn primary" id="add">+ Serviço</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Serviço</th><th>Duração</th><th class="num">Preço</th><th>Status</th></tr></thead>
      <tbody>${services.map((s) => `<tr class="click" data-id="${s.id}">
        <td><b>${esc(s.name)}</b><div class="small muted">${esc(s.description || '')}</div></td>
        <td>${fmtDuration(s.duration_min)}</td><td class="num">${money(s.price_cents)}</td>
        <td>${s.active ? '<span class="badge done">Ativo</span>' : '<span class="badge cancelled">Inativo</span>'}</td></tr>`).join('')}</tbody>
    </table></div>`;
  $tab.querySelector('#add').onclick = () => serviceModal();
  $tab.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => serviceModal(services.find((s) => s.id === Number(tr.dataset.id)))));
}

function serviceModal(s = { name: '', description: '', duration_min: 30, price_cents: 0, active: 1 }) {
  openModal((m, close) => {
    m.innerHTML = `
      <h3>${s.id ? 'Editar serviço' : 'Novo serviço'}</h3>
      <form id="f">
        <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(s.name)}" required /></div>
        <div class="field"><label>Descrição</label><input class="input" id="desc" value="${esc(s.description || '')}" /></div>
        <div class="grid-2">
          <div class="field"><label>Duração (min)</label><input class="input" type="number" min="5" step="5" id="dur" value="${s.duration_min}" required /></div>
          <div class="field"><label>Preço (R$)</label><input class="input" type="number" min="0" step="0.01" id="price" value="${(s.price_cents / 100).toFixed(2)}" required /></div>
        </div>
        <label class="check"><input type="checkbox" id="active" ${s.active ? 'checked' : ''} /> Disponível para agendamento</label>
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Salvar</button></div>
      </form>`;
    m.querySelector('#cancel').onclick = close;
    m.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: m.querySelector('#name').value,
        description: m.querySelector('#desc').value,
        duration_min: Number(m.querySelector('#dur').value),
        price_cents: Math.round(Number(m.querySelector('#price').value) * 100),
        active: m.querySelector('#active').checked,
      };
      try {
        await api(s.id ? `/api/admin/services/${s.id}` : '/api/admin/services', { method: s.id ? 'PUT' : 'POST', body });
        toast('Serviço salvo.', 'success');
        close();
        route();
      } catch (err) { handleError(err); }
    });
  });
}

function cfgBarbers($tab) {
  $tab.innerHTML = `
    <div class="row" style="margin-bottom:12px"><span class="muted">Defina dias, horários e almoço de cada barbeiro.</span><div class="spacer"></div>
      <button class="btn primary" id="add">+ Barbeiro</button></div>
    <div class="list">${barbers.map((b) => `
      <div class="list-item click" data-id="${b.id}" style="cursor:pointer">
        <span class="dot" style="background:${esc(b.color)};width:14px;height:14px"></span>
        <div class="grow"><b>${esc(b.name)}</b> ${b.active ? '' : '<span class="badge cancelled">Inativo</span>'}
          <div class="small muted">${b.hours.length ? b.hours.sort((x, y) => x.weekday - y.weekday)
            .map((h) => `${WEEKDAYS[h.weekday].slice(0, 3)} ${h.start}–${h.end}`).join(' · ') : 'Sem horários definidos'}</div></div>
        <span class="small muted">Comissão ${b.commission_pct}%</span>
      </div>`).join('')}</div>`;
  $tab.querySelector('#add').onclick = () => barberModal();
  $tab.querySelectorAll('[data-id]').forEach((el) => (el.onclick = () => barberModal(barbers.find((b) => b.id === Number(el.dataset.id)))));
}

function barberModal(b = { name: '', phone: '', commission_pct: 50, color: '#c8a24a', active: 1, hours: [] }) {
  openModal((m, close) => {
    m.style.maxWidth = '700px';
    const hourRow = (wd) => {
      const h = b.hours.find((x) => x.weekday === wd);
      return `<label class="lbl check"><input type="checkbox" data-wd="${wd}" ${h ? 'checked' : ''} />${WEEKDAYS[wd]}</label>
        <div class="hrow ${h ? '' : 'off'}" data-row="${wd}">
          <input class="input" type="time" data-k="start" value="${h?.start || '09:00'}" /> às
          <input class="input" type="time" data-k="end" value="${h?.end || '19:00'}" />
          <span class="small muted">almoço</span>
          <input class="input" type="time" data-k="break_start" value="${h ? h.break_start || '' : '12:00'}" /> –
          <input class="input" type="time" data-k="break_end" value="${h ? h.break_end || '' : '13:00'}" />
        </div>`;
    };
    m.innerHTML = `
      <h3>${b.id ? 'Editar barbeiro' : 'Novo barbeiro'}</h3>
      <form id="f">
        <div class="grid-2">
          <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(b.name)}" required /></div>
          <div class="field"><label>WhatsApp</label><input class="input" id="phone" value="${esc(fmtPhone(b.phone))}" /></div>
          <div class="field"><label>Comissão (%)</label><input class="input" type="number" min="0" max="100" id="comm" value="${b.commission_pct}" /></div>
          <div class="field"><label>Cor na agenda</label><input class="input" type="color" id="color" value="${esc(b.color)}" style="height:44px;padding:4px" /></div>
        </div>
        <div class="field"><label>Horário de trabalho (deixe o almoço em branco se não houver)</label></div>
        <div class="hours-grid">${[1, 2, 3, 4, 5, 6, 0].map(hourRow).join('')}</div>
        <label class="check" style="margin-top:14px"><input type="checkbox" id="active" ${b.active ? 'checked' : ''} /> Ativo (aparece para os clientes)</label>
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Salvar</button></div>
      </form>`;
    maskPhone(m.querySelector('#phone'));
    m.querySelector('#cancel').onclick = close;
    m.querySelectorAll('[data-wd]').forEach((cb) => (cb.onchange = () => {
      m.querySelector(`[data-row="${cb.dataset.wd}"]`).classList.toggle('off', !cb.checked);
    }));
    m.querySelector('#f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const hours = [...m.querySelectorAll('[data-wd]:checked')].map((cb) => {
        const row = m.querySelector(`[data-row="${cb.dataset.wd}"]`);
        const v = (k) => row.querySelector(`[data-k="${k}"]`).value || null;
        return { weekday: Number(cb.dataset.wd), start: v('start'), end: v('end'), break_start: v('break_start'), break_end: v('break_end') };
      });
      const body = {
        name: m.querySelector('#name').value,
        phone: m.querySelector('#phone').value,
        commission_pct: Number(m.querySelector('#comm').value),
        color: m.querySelector('#color').value,
        active: m.querySelector('#active').checked,
        hours,
      };
      try {
        await api(b.id ? `/api/admin/barbers/${b.id}` : '/api/admin/barbers', { method: b.id ? 'PUT' : 'POST', body });
        toast('Barbeiro salvo.', 'success');
        close();
        route();
      } catch (err) { handleError(err); }
    });
  });
}

async function cfgBlocks($tab) {
  const blocks = await api('/api/admin/blocks');
  $tab.innerHTML = `
    <div class="row" style="margin-bottom:12px"><span class="muted">Folgas, férias e feriados. Os horários somem da agenda online.</span><div class="spacer"></div>
      <button class="btn primary" id="add">+ Bloqueio</button></div>
    <div class="list">${blocks.length ? blocks.map((bl) => `
      <div class="list-item">
        <div class="grow"><b>${esc(bl.reason || 'Bloqueio')}</b> <span class="muted">· ${esc(bl.barber_name || 'Barbearia inteira')}</span>
          <div class="small muted">${bl.date_start === bl.date_end ? fmtDateLong(bl.date_start) : `${fmtDateShort(bl.date_start)} a ${fmtDateShort(bl.date_end)}`}
          ${bl.start_min === 0 && bl.end_min === 1440 ? ' · dia inteiro' : ` · ${fmtMin(bl.start_min)}–${fmtMin(bl.end_min)}`}</div></div>
        <button class="btn danger sm" data-del="${bl.id}">Remover</button>
      </div>`).join('') : '<div class="card empty">Nenhum bloqueio futuro.</div>'}</div>`;
  $tab.querySelector('#add').onclick = () => blockModal();
  $tab.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api(`/api/admin/blocks/${b.dataset.del}`, { method: 'DELETE' });
    toast('Bloqueio removido.', 'success');
    route();
  }));
}

boot().catch(handleError);
