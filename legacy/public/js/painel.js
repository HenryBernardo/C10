import { api, money, esc, toast, openModal, maskPhone, fmtPhone, fmtDateShort, WEEKDAYS } from './common.js';

const $view = document.getElementById('view');
const CITY_KEY = 'c10:painel:cidade';

let ctx = null;      // { user, cities, categories }
let cityId = null;   // cidade sendo gerenciada
const isSuper = () => ctx.user.role === 'super';
const city = () => ctx.cities.find((c) => c.id === cityId);
const cq = () => `city=${cityId}`;

const LEAD_STATUS = { novo: 'Novo', contatado: 'Contatado', cadastrado: 'Cadastrado', descartado: 'Descartado' };
const LEAD_BADGE = { novo: 'scheduled', contatado: 'confirmed', cadastrado: 'done', descartado: 'cancelled' };
const ROLE_LABEL = { super: 'Admin geral', city: 'Admin da cidade', shop: 'Dono do comércio' };

/* ================================================================== */
/* Início / navegação                                                  */
/* ================================================================== */

async function boot() {
  const me = await api('/api/auth/me');
  if (!me.authenticated) return goLogin();
  if (me.user.role === 'shop') { location.href = '/admin'; return; }
  ctx = await api('/api/panel/context');

  let saved = null;
  try { saved = Number(localStorage.getItem(CITY_KEY)); } catch { /* sem armazenamento */ }
  cityId = ctx.cities.find((c) => c.id === saved)?.id || ctx.cities[0]?.id;

  document.getElementById('app').hidden = false;
  document.getElementById('who').textContent = `${ctx.user.name} · ${ctx.user.role_label}`;
  document.getElementById('nav-cities').hidden = !isSuper();
  renderCitySelect();
  route();
}

function goLogin() {
  location.href = '/entrar/cidade?volta=/painel';
}

function renderCitySelect() {
  const $c = document.getElementById('city-select');
  if (isSuper()) {
    $c.innerHTML = `<select class="input" id="city">${ctx.cities.map((c) =>
      `<option value="${c.id}" ${c.id === cityId ? 'selected' : ''}>${esc(c.name)} - ${c.state}${c.active ? '' : ' (inativa)'}</option>`).join('')}</select>`;
    $c.querySelector('#city').onchange = (e) => {
      cityId = Number(e.target.value);
      try { localStorage.setItem(CITY_KEY, String(cityId)); } catch { /* sem armazenamento */ }
      updateCityLink();
      route();
    };
  } else {
    $c.innerHTML = `<div class="fixed">📍 ${esc(city()?.name || '')}</div>`;
  }
  updateCityLink();
}

function updateCityLink() {
  document.getElementById('see-city').href = city() ? `/${city().slug}` : '/';
}

const VIEWS = { inicio: viewHome, comercios: viewBusinesses, pedidos: viewLeads, usuarios: viewUsers, cidades: viewCities };

function route() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  let name = location.hash.slice(1).split('/')[0] || 'inicio';
  if (!VIEWS[name] || (name === 'cidades' && !isSuper())) name = 'inicio';
  document.querySelectorAll('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  if (!cityId && name !== 'cidades') {
    $view.innerHTML = '<div class="card empty">Nenhuma cidade cadastrada ainda.</div>';
    return;
  }
  VIEWS[name]().catch(handleError);
}
window.addEventListener('hashchange', route);

function handleError(err) {
  if (err.status === 401) return goLogin();
  console.error(err);
  toast(err.message, 'error');
}

document.getElementById('logout').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/entrar/cidade';
};

document.getElementById('change-pw').onclick = () => openModal((m, close) => {
  m.innerHTML = `<h3>Minha senha</h3>
    <form id="f">
      <div class="field"><label>Senha atual</label><input class="input" type="password" id="cur" autocomplete="current-password" required /></div>
      <div class="field"><label>Nova senha</label><input class="input" type="password" id="nxt" autocomplete="new-password" minlength="6" required /></div>
      <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Alterar</button></div>
    </form>`;
  m.querySelector('#cancel').onclick = close;
  m.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/password', { method: 'PUT', body: { current: m.querySelector('#cur').value, next: m.querySelector('#nxt').value } });
      toast('Senha alterada. Entre novamente.', 'success');
      setTimeout(goLogin, 1200);
    } catch (err) { handleError(err); }
  };
});

/* ================================================================== */
/* Início                                                              */
/* ================================================================== */

async function viewHome() {
  const o = await api(`/api/panel/overview?${cq()}`);
  const max = Math.max(1, ...o.byCategory.map((c) => c.n));
  $view.innerHTML = `
    <div class="page-head"><h1>${esc(city().name)}</h1><div class="spacer"></div>
      <a class="btn" href="/${city().slug}" target="_blank">Ver página</a>
      <button class="btn primary" id="new">+ Comércio</button></div>
    <div class="kpis">
      <div class="kpi gold"><div class="label">Comércios ativos</div><div class="value">${o.counts.active}</div><div class="hint">${o.counts.total} cadastrados</div></div>
      <div class="kpi"><div class="label">Destaques</div><div class="value">${o.counts.featured}</div></div>
      <div class="kpi"><div class="label">Com agenda online</div><div class="value">${o.counts.booking}</div></div>
      <div class="kpi ${o.leads ? 'gold' : ''}"><div class="label">Pedidos novos</div><div class="value">${o.leads}</div>
        <div class="hint"><a href="#pedidos">ver pedidos</a></div></div>
      <div class="kpi"><div class="label">Agendamentos (30 dias)</div><div class="value">${o.appts.n}</div>
        <div class="hint">${money(o.appts.revenue)} movimentados</div></div>
    </div>
    <div class="panel-grid">
      <div class="card"><b>Comércios por categoria</b>
        ${o.byCategory.map((c) => `<div style="margin-top:10px">
          <div class="row small"><span>${c.icon} ${esc(c.name)}</span><div class="spacer"></div><b>${c.n}</b></div>
          <div class="bar" style="margin-top:4px"><span style="width:${(c.n / max) * 100}%"></span></div></div>`).join('')}
      </div>
      <div class="card"><b>Agendas online</b>
        ${o.shops.length ? o.shops.map((s) => `<div class="row small" style="margin-top:12px">
          <span>💈 ${esc(s.name)}</span><div class="spacer"></div><span class="muted">${s.appts} agend. em 30 dias</span>
          <a class="btn sm" href="/admin?loja=${s.id}">Abrir</a></div>`).join('')
          : '<p class="muted small" style="margin-top:10px">Nenhum comércio com agenda online ainda. Ative em Comércios → editar → "Agenda online".</p>'}
      </div>
    </div>`;
  $view.querySelector('#new').onclick = () => businessModal();
}

/* ================================================================== */
/* Comércios                                                           */
/* ================================================================== */

async function viewBusinesses() {
  $view.innerHTML = `
    <div class="page-head"><h1>Comércios</h1><div class="spacer"></div>
      <input class="input" id="q" placeholder="Buscar por nome ou bairro" style="max-width:240px" />
      <select class="input" id="cat" style="max-width:190px"><option value="">Todas as categorias</option>
        ${ctx.categories.map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select>
      <button class="btn primary" id="new">+ Comércio</button></div>
    <div id="list"><div class="spinner"></div></div>`;
  const load = async () => {
    const q = encodeURIComponent($view.querySelector('#q').value);
    const list = await api(`/api/panel/businesses?${cq()}&q=${q}&category=${$view.querySelector('#cat').value}`);
    document.getElementById('list').innerHTML = list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Comércio</th><th>Categoria</th><th>Bairro</th><th>Status</th><th>Dono (acesso)</th><th></th></tr></thead>
      <tbody>${list.map((b) => `<tr class="click" data-id="${b.id}">
        <td><b>${esc(b.name)}</b>${b.featured ? ' <span class="pill on">★ destaque</span>' : ''}</td>
        <td>${b.category_icon} ${esc(b.category_name)}</td>
        <td>${esc(b.neighborhood || '—')}</td>
        <td>${b.active ? '<span class="pill on">no ar</span>' : '<span class="pill off">oculto</span>'}
          ${b.booking_enabled ? '<span class="pill on">📅 agenda</span>' : ''}</td>
        <td class="small">${b.owners ? esc(b.owners) : '<span class="muted">—</span>'}</td>
        <td><div class="row-actions">
          <a class="btn sm" href="/${b.city_slug}/${b.slug}" target="_blank" data-stop>Ver</a>
          ${b.booking_enabled ? `<a class="btn sm" href="/admin?loja=${b.id}" data-stop>Agenda</a>` : ''}
          <button class="btn sm" data-access="${b.id}">+ Acesso</button>
        </div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Nenhum comércio encontrado.</div>';
    document.querySelectorAll('#list [data-stop]').forEach((a) => (a.onclick = (e) => e.stopPropagation()));
    document.querySelectorAll('#list [data-access]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      userModal({ role: 'shop', business_id: Number(b.dataset.access) });
    }));
    document.querySelectorAll('#list tr[data-id]').forEach((tr) => (tr.onclick = () => businessModal(list.find((b) => b.id === Number(tr.dataset.id)))));
  };
  let t;
  $view.querySelector('#q').oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch(handleError), 250); };
  $view.querySelector('#cat').onchange = () => load().catch(handleError);
  $view.querySelector('#new').onclick = () => businessModal();
  await load();
}

const EMPTY_BIZ = { name: '', category_id: null, description: '', address: '', neighborhood: '', phone: '', instagram: '', hours: '{}', active: 1, featured: 0, booking_enabled: 0 };

/** Cria/edita um comércio. `lead` preenche a partir de um pedido de cadastro. */
function businessModal(b = EMPTY_BIZ, lead = null) {
  let hours = {};
  try { hours = JSON.parse(b.hours || '{}'); } catch { /* vazio */ }
  const barberCat = ctx.categories.find((c) => c.slug === 'barbearias')?.id;
  openModal((m, close) => {
    m.style.maxWidth = '680px';
    m.innerHTML = `
      <h3>${b.id ? 'Editar comércio' : `Novo comércio em ${esc(city().name)}`}</h3>
      <form id="f">
        <div class="grid-2">
          <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(b.name)}" required maxlength="100" /></div>
          <div class="field"><label>Categoria</label><select class="input" id="cat" required>
            <option value="">Escolha…</option>
            ${ctx.categories.map((c) => `<option value="${c.id}" ${c.id === b.category_id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>Descrição (aparece na página)</label><textarea class="input" id="desc" maxlength="500" rows="2">${esc(b.description || '')}</textarea></div>
        <div class="grid-2">
          <div class="field"><label>Endereço</label><input class="input" id="addr" value="${esc(b.address || '')}" placeholder="Rua, número" /></div>
          <div class="field"><label>Bairro</label><input class="input" id="hood" value="${esc(b.neighborhood || '')}" /></div>
          <div class="field"><label>WhatsApp</label><input class="input" id="phone" value="${esc(fmtPhone(b.phone))}" inputmode="tel" placeholder="(45) 99999-9999" /></div>
          <div class="field"><label>Instagram</label><input class="input" id="insta" value="${esc(b.instagram ? '@' + b.instagram : '')}" placeholder="@perfil" /></div>
        </div>
        <div class="field"><label>Horário de funcionamento</label></div>
        <div class="hours-grid">${[1, 2, 3, 4, 5, 6, 0].map((d) => `
          <label class="lbl check"><input type="checkbox" data-wd="${d}" ${hours[d] ? 'checked' : ''} />${WEEKDAYS[d]}</label>
          <div class="hrow ${hours[d] ? '' : 'off'}" data-row="${d}">
            <input class="input" type="time" data-k="0" value="${hours[d]?.[0] || '08:00'}" /> às
            <input class="input" type="time" data-k="1" value="${hours[d]?.[1] || '18:00'}" />
          </div>`).join('')}</div>
        <div class="toggles" style="margin-top:16px">
          <label class="check"><input type="checkbox" id="active" ${b.active ? 'checked' : ''} /> No ar (aparece no guia)</label>
          <label class="check"><input type="checkbox" id="featured" ${b.featured ? 'checked' : ''} /> Destaque na página da cidade</label>
          <label class="check"><input type="checkbox" id="booking" ${b.booking_enabled ? 'checked' : ''} /> Agenda online (sistema de agendamento)</label>
          <div class="small muted hint" id="booking-hint">Libera o painel de agenda para o dono e o botão "Agendar horário online" na página.</div>
        </div>
        <div class="actions">
          ${b.id ? `<a class="btn ghost" href="/${city().slug}/${b.slug}" target="_blank">Ver página</a>` : ''}
          <div class="spacer"></div>
          <button type="button" class="btn" id="cancel">Cancelar</button>
          <button class="btn primary">Salvar</button>
        </div>
      </form>`;
    const $ = (id) => m.querySelector('#' + id);
    maskPhone($('phone'));
    $('cancel').onclick = close;
    m.querySelectorAll('[data-wd]').forEach((cb) => (cb.onchange = () => {
      m.querySelector(`[data-row="${cb.dataset.wd}"]`).classList.toggle('off', !cb.checked);
    }));
    $('cat').onchange = () => {
      if (!b.id && Number($('cat').value) === barberCat) $('booking').checked = true;
    };
    $('f').onsubmit = async (e) => {
      e.preventDefault();
      const h = {};
      m.querySelectorAll('[data-wd]:checked').forEach((cb) => {
        const row = m.querySelector(`[data-row="${cb.dataset.wd}"]`);
        h[cb.dataset.wd] = [row.querySelector('[data-k="0"]').value, row.querySelector('[data-k="1"]').value];
      });
      const body = {
        city_id: cityId,
        lead_id: lead?.id,
        name: $('name').value,
        category_id: Number($('cat').value),
        description: $('desc').value,
        address: $('addr').value,
        neighborhood: $('hood').value,
        phone: $('phone').value,
        instagram: $('insta').value,
        hours: h,
        active: $('active').checked,
        featured: $('featured').checked,
        booking_enabled: $('booking').checked,
      };
      try {
        const r = await api(b.id ? `/api/panel/businesses/${b.id}` : '/api/panel/businesses', { method: b.id ? 'PUT' : 'POST', body });
        close();
        const newId = r.id;
        if (newId && body.booking_enabled) {
          toast('Comércio criado. Agora crie o acesso do dono para ele configurar a agenda.', 'success');
          userModal({ role: 'shop', business_id: newId, name: lead?.contact_name || '' });
        } else toast('Comércio salvo.', 'success');
        route();
      } catch (err) { handleError(err); }
    };
  });
}

/* ================================================================== */
/* Pedidos de cadastro                                                 */
/* ================================================================== */

async function viewLeads() {
  const showAll = isSuper() && location.hash.includes('todos');
  const leads = await api(`/api/panel/leads?city=${showAll ? 'all' : cityId}`);
  $view.innerHTML = `
    <div class="page-head"><h1>Pedidos de cadastro</h1><div class="spacer"></div>
      ${isSuper() ? `<div class="tabs" style="margin:0"><button class="${showAll ? '' : 'active'}" data-a="0">${esc(city().name)}</button>
        <button class="${showAll ? 'active' : ''}" data-a="1">Todas as cidades</button></div>` : ''}</div>
    <p class="muted" style="margin-top:-8px">Donos de comércio que preencheram "Cadastre seu negócio". Fale com eles pelo WhatsApp e cadastre com um clique.</p>
    ${leads.length ? `<div class="list">${leads.map((l) => `
      <div class="list-item">
        <div class="grow"><b>${esc(l.business_name)}</b> <span class="muted small">· ${esc(l.category_name || 'sem categoria')}${showAll ? ` · ${esc(l.city_name || 'Outra cidade')}` : ''}</span>
          <div class="small">${esc(l.contact_name)} · ${fmtPhone(l.phone)} <span class="muted">· ${fmtDateShort(l.created_at.slice(0, 10))}</span></div>
          ${l.message ? `<div class="small muted" style="margin-top:4px">“${esc(l.message)}”</div>` : ''}</div>
        <span class="badge ${LEAD_BADGE[l.status]}">${LEAD_STATUS[l.status]}</span>
        <select class="input" data-status="${l.id}" style="width:auto;padding:6px 8px">
          ${Object.entries(LEAD_STATUS).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <a class="btn whats sm" target="_blank" href="https://wa.me/${l.phone}?text=${encodeURIComponent(`Olá ${l.contact_name.split(' ')[0]}! Aqui é do Cidade 10, recebemos o cadastro do ${l.business_name}.`)}">WhatsApp</a>
        ${l.status !== 'cadastrado' && l.city_id === cityId ? `<button class="btn primary sm" data-create="${l.id}">Cadastrar</button>` : ''}
      </div>`).join('')}</div>` : '<div class="card empty">Nenhum pedido por enquanto.</div>'}`;
  $view.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => (location.hash = b.dataset.a === '1' ? 'pedidos/todos' : 'pedidos')));
  $view.querySelectorAll('[data-status]').forEach((s) => (s.onchange = async () => {
    try {
      await api(`/api/panel/leads/${s.dataset.status}`, { method: 'PATCH', body: { status: s.value } });
      toast('Pedido atualizado.', 'success');
      route();
    } catch (err) { handleError(err); }
  }));
  $view.querySelectorAll('[data-create]').forEach((btn) => (btn.onclick = () => {
    const l = leads.find((x) => x.id === Number(btn.dataset.create));
    businessModal({ ...EMPTY_BIZ, name: l.business_name, category_id: l.category_id, phone: l.phone }, l);
  }));
}

/* ================================================================== */
/* Acessos (usuários)                                                  */
/* ================================================================== */

async function viewUsers() {
  const users = await api('/api/panel/users');
  $view.innerHTML = `
    <div class="page-head"><h1>Acessos</h1><div class="spacer"></div><button class="btn primary" id="new">+ Acesso</button></div>
    <p class="muted" style="margin-top:-8px">${isSuper()
      ? 'Admins das cidades e donos de comércio. Cada um só vê o que é dele.'
      : 'Donos de comércio da sua cidade. Com o acesso eles gerenciam a própria agenda online.'}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Onde</th><th>Status</th></tr></thead>
      <tbody>${users.map((u) => `<tr class="click" data-id="${u.id}">
        <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${ROLE_LABEL[u.role]}</td>
        <td>${u.role === 'city' ? esc(u.city_name) : u.role === 'shop'
          ? `${esc(u.business_name)}${u.booking_enabled ? '' : ' <span class="pill off">agenda desativada</span>'}` : 'Todas as cidades'}</td>
        <td>${u.active ? '<span class="pill on">ativo</span>' : '<span class="pill off">desativado</span>'}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">Nenhum acesso ainda.</td></tr>'}</tbody>
    </table></div>`;
  $view.querySelector('#new').onclick = () => userModal();
  $view.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => editUserModal(users.find((u) => u.id === Number(tr.dataset.id)))));
}

async function userModal(preset = {}) {
  const businesses = await api(`/api/panel/businesses?${cq()}`);
  const role = preset.role || (isSuper() ? 'city' : 'shop');
  openModal((m, close) => {
    m.innerHTML = `
      <h3>Novo acesso</h3>
      <form id="f">
        ${isSuper() ? `<div class="field"><label>Tipo</label><select class="input" id="role">
          ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === role ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}
        <div class="field" id="f-city"><label>Cidade</label><select class="input" id="city">
          ${ctx.cities.map((c) => `<option value="${c.id}" ${c.id === cityId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field" id="f-biz"><label>Comércio (${esc(city().name)})</label><select class="input" id="biz">
          ${businesses.map((b) => `<option value="${b.id}" ${b.id === preset.business_id ? 'selected' : ''}>${esc(b.name)}${b.booking_enabled ? ' · 📅' : ''}</option>`).join('')}</select>
          <span class="small muted">Comércios com 📅 têm agenda online. Sem ela, o dono não tem o que gerenciar.</span></div>
        <div class="grid-2">
          <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(preset.name || '')}" required /></div>
          <div class="field"><label>E-mail (login)</label><input class="input" type="email" id="email" required /></div>
        </div>
        <div class="field"><label>Senha inicial</label>
          <div class="row"><input class="input" id="pw" required minlength="6" autocomplete="new-password" />
          <button type="button" class="btn" id="gen">Gerar</button></div>
          <span class="small muted">Envie para a pessoa e peça para trocar no primeiro acesso.</span></div>
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Criar acesso</button></div>
      </form>`;
    const $ = (id) => m.querySelector('#' + id);
    const sync = () => {
      const r = $('role')?.value || role;
      $('f-city').hidden = r !== 'city';
      $('f-biz').hidden = r !== 'shop';
    };
    $('role')?.addEventListener('change', sync);
    sync();
    $('cancel').onclick = close;
    $('gen').onclick = () => {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      $('pw').value = [...bytes].map((x) => chars[x % chars.length]).join('');
    };
    $('f').onsubmit = async (e) => {
      e.preventDefault();
      const r = $('role')?.value || role;
      const body = {
        role: r,
        name: $('name').value,
        email: $('email').value,
        password: $('pw').value,
        city_id: Number($('city').value),
        business_id: Number($('biz').value),
      };
      try {
        await api('/api/panel/users', { method: 'POST', body });
        close();
        loginInfoModal(body);
        if (location.hash.startsWith('#usuarios') || location.hash.startsWith('#comercios')) route();
      } catch (err) { handleError(err); }
    };
  });
}

/** Mostra os dados de acesso prontos para enviar por WhatsApp. */
function loginInfoModal({ name, email, password, role }) {
  const text = `Olá ${name.split(' ')[0]}! Seu acesso ao painel do Cidade 10:\n${location.origin}/entrar/${role === 'shop' ? 'barbearia' : 'cidade'}\nE-mail: ${email}\nSenha: ${password}\nTroque a senha no primeiro acesso.`;
  openModal((m, close) => {
    m.innerHTML = `<h3>Acesso criado ✓</h3>
      <textarea class="input" rows="6" readonly>${esc(text)}</textarea>
      <div class="actions"><button class="btn" id="copy">Copiar</button><button class="btn primary" id="ok">Pronto</button></div>`;
    m.querySelector('#copy').onclick = () => navigator.clipboard.writeText(text).then(() => toast('Copiado!', 'success'));
    m.querySelector('#ok').onclick = close;
  });
}

function editUserModal(u) {
  openModal((m, close) => {
    m.innerHTML = `
      <h3>${esc(u.name)}</h3>
      <p class="muted small" style="margin-top:-8px">${esc(u.email)} · ${ROLE_LABEL[u.role]}</p>
      <form id="f">
        <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(u.name)}" required /></div>
        <div class="field"><label>Nova senha (deixe em branco para manter)</label><input class="input" id="pw" minlength="6" autocomplete="new-password" /></div>
        <label class="check"><input type="checkbox" id="active" ${u.active ? 'checked' : ''} ${u.id === ctx.user.id ? 'disabled' : ''} /> Acesso ativo</label>
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Salvar</button></div>
      </form>`;
    m.querySelector('#cancel').onclick = close;
    m.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const pw = m.querySelector('#pw').value;
      try {
        await api(`/api/panel/users/${u.id}`, { method: 'PUT', body: { name: m.querySelector('#name').value, active: m.querySelector('#active').checked, password: pw || undefined } });
        close();
        if (pw) loginInfoModal({ name: u.name, email: u.email, password: pw, role: u.role });
        else toast('Acesso atualizado.', 'success');
        route();
      } catch (err) { handleError(err); }
    };
  });
}

/* ================================================================== */
/* Cidades (só admin geral)                                            */
/* ================================================================== */

async function viewCities() {
  ctx = await api('/api/panel/context');
  $view.innerHTML = `
    <div class="page-head"><h1>Cidades</h1><div class="spacer"></div><button class="btn primary" id="new">+ Cidade</button></div>
    <div class="list">${ctx.cities.map((c) => `
      <div class="list-item click" data-id="${c.id}" style="cursor:pointer">
        <span class="dot" style="background:${esc(c.color)};width:14px;height:14px"></span>
        <div class="grow"><b>${esc(c.name)} - ${c.state}</b> ${c.active ? '' : '<span class="pill off">inativa</span>'}
          <div class="small muted">${esc(c.tagline || '')} · /${c.slug}</div></div>
        <a class="btn sm" href="/${c.slug}" target="_blank" data-stop>Ver</a>
      </div>`).join('')}</div>`;
  $view.querySelectorAll('[data-stop]').forEach((a) => (a.onclick = (e) => e.stopPropagation()));
  $view.querySelector('#new').onclick = () => cityModal();
  $view.querySelectorAll('[data-id]').forEach((el) => (el.onclick = () => cityModal(ctx.cities.find((c) => c.id === Number(el.dataset.id)))));
}

function cityModal(c = { name: '', state: 'PR', color: '#0f766e', tagline: '', description: '', active: 1 }) {
  openModal((m, close) => {
    m.innerHTML = `
      <h3>${c.id ? `Editar ${esc(c.name)}` : 'Nova cidade'}</h3>
      <form id="f">
        <div class="grid-2">
          <div class="field"><label>Nome</label><input class="input" id="name" value="${esc(c.name)}" required /></div>
          <div class="grid-2" style="gap:10px">
            <div class="field"><label>UF</label><input class="input" id="state" value="${esc(c.state)}" maxlength="2" required style="text-transform:uppercase" /></div>
            <div class="field"><label>Cor</label><input class="input" type="color" id="color" value="${esc(c.color)}" style="height:44px;padding:4px" /></div>
          </div>
        </div>
        <div class="field"><label>Frase de destaque</label><input class="input" id="tagline" value="${esc(c.tagline || '')}" placeholder="Tudo de [cidade] em um só lugar" /></div>
        <div class="field"><label>Descrição (Google)</label><textarea class="input" id="desc" rows="2">${esc(c.description || '')}</textarea></div>
        <label class="check"><input type="checkbox" id="active" ${c.active ? 'checked' : ''} /> Cidade no ar</label>
        ${c.id ? '' : '<p class="small muted">O endereço da página é criado a partir do nome e não muda depois.</p>'}
        <div class="actions"><button type="button" class="btn" id="cancel">Cancelar</button><button class="btn primary">Salvar</button></div>
      </form>`;
    const $ = (id) => m.querySelector('#' + id);
    $('cancel').onclick = close;
    $('f').onsubmit = async (e) => {
      e.preventDefault();
      const body = { name: $('name').value, state: $('state').value, color: $('color').value, tagline: $('tagline').value, description: $('desc').value, active: $('active').checked };
      try {
        const r = await api(c.id ? `/api/panel/cities/${c.id}` : '/api/panel/cities', { method: c.id ? 'PUT' : 'POST', body });
        close();
        ctx = await api('/api/panel/context');
        if (r.id) cityId = r.id;
        renderCitySelect();
        toast(c.id ? 'Cidade salva.' : 'Cidade criada! Agora cadastre os comércios e o admin dela.', 'success');
        route();
      } catch (err) { handleError(err); }
    };
  });
}

boot().catch(handleError);
