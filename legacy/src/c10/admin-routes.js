// API do painel do Cidade 10: admin geral (todas as cidades) e admin da cidade (só a dele).
import { db, tx } from '../db.js';
import { route } from '../router.js';
import { HttpError, normalizePhone } from '../scheduling.js';
import { createUser, setPassword, cityScope, ROLES } from '../users.js';
import { slugify, uniqueSlug } from './data.js';
import { todayStr, addDays } from '../time.js';

const P = { auth: 'panel' };
const SUPER = { auth: 'super' };

function businessInScope(user, id) {
  const b = db.prepare('SELECT * FROM c10_businesses WHERE id = ?').get(id);
  if (!b) throw new HttpError(404, 'Comércio não encontrado.');
  if (user.role === 'city' && b.city_id !== user.city_id) throw new HttpError(403, 'Este comércio é de outra cidade.');
  return b;
}

route('GET', '/api/panel/context', (req, { user }) => ({
  user: { id: user.id, name: user.name, email: user.email, role: user.role, role_label: ROLES[user.role], city_id: user.city_id },
  cities: user.role === 'super'
    ? db.prepare('SELECT * FROM c10_cities ORDER BY name').all()
    : db.prepare('SELECT * FROM c10_cities WHERE id = ?').all(user.city_id),
  categories: db.prepare('SELECT * FROM c10_categories ORDER BY sort').all(),
}), P);

/* ----------------------------- Visão geral ----------------------------- */

route('GET', '/api/panel/overview', (req, { user, query }) => {
  const cityId = cityScope(user, query.get('city'));
  const from = addDays(todayStr(), -29);
  const counts = db.prepare(`SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN active = 1 THEN 1 END) AS active,
      COUNT(CASE WHEN featured = 1 AND active = 1 THEN 1 END) AS featured,
      COUNT(CASE WHEN booking_enabled = 1 AND active = 1 THEN 1 END) AS booking
    FROM c10_businesses WHERE city_id = ?`).get(cityId);
  const leads = db.prepare(`SELECT COUNT(*) AS n FROM c10_leads WHERE city_id = ? AND status = 'novo'`).get(cityId).n;
  const appts = db.prepare(`SELECT COUNT(*) AS n,
      COUNT(CASE WHEN a.source = 'online' THEN 1 END) AS online,
      COALESCE(SUM(CASE WHEN a.status = 'done' THEN a.price_cents END), 0) AS revenue
    FROM appointments a JOIN c10_businesses b ON b.id = a.shop_id
    WHERE b.city_id = ? AND a.date BETWEEN ? AND ? AND a.status != 'cancelled'`).get(cityId, from, todayStr());
  const byCategory = db.prepare(`SELECT cat.name, cat.icon, COUNT(b.id) AS n FROM c10_categories cat
    LEFT JOIN c10_businesses b ON b.category_id = cat.id AND b.city_id = ? AND b.active = 1
    GROUP BY cat.id ORDER BY n DESC, cat.sort`).all(cityId);
  const shops = db.prepare(`SELECT b.id, b.name,
      (SELECT COUNT(*) FROM appointments a WHERE a.shop_id = b.id AND a.date BETWEEN ? AND ? AND a.status != 'cancelled') AS appts
    FROM c10_businesses b WHERE b.city_id = ? AND b.booking_enabled = 1 ORDER BY appts DESC`).all(from, todayStr(), cityId);
  return { counts, leads, appts, byCategory, shops };
}, P);

/* ------------------------------ Comércios ------------------------------ */

route('GET', '/api/panel/businesses', (req, { user, query }) => {
  const cityId = cityScope(user, query.get('city'));
  const where = ['b.city_id = ?'];
  const params = [cityId];
  const q = (query.get('q') || '').trim();
  if (q) { where.push('(b.name LIKE ? OR b.neighborhood LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (query.get('category')) { where.push('b.category_id = ?'); params.push(Number(query.get('category'))); }
  return db.prepare(`SELECT b.*, cat.name AS category_name, cat.icon AS category_icon, cat.color AS category_color, c.slug AS city_slug,
      (SELECT GROUP_CONCAT(u.email, ', ') FROM users u WHERE u.business_id = b.id AND u.active = 1) AS owners
    FROM c10_businesses b JOIN c10_categories cat ON cat.id = b.category_id JOIN c10_cities c ON c.id = b.city_id
    WHERE ${where.join(' AND ')} ORDER BY b.active DESC, b.name`).all(...params);
}, P);

function validateBusiness(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Informe o nome do comércio.');
  const categoryId = Number(body.category_id);
  if (!db.prepare('SELECT 1 FROM c10_categories WHERE id = ?').get(categoryId)) throw new HttpError(400, 'Escolha a categoria.');
  const phone = normalizePhone(body.phone);
  if (phone && phone.length < 12) throw new HttpError(400, 'WhatsApp inválido. Use DDD + número.');
  const hours = {};
  for (const [d, v] of Object.entries(body.hours || {})) {
    const ok = Number(d) >= 0 && Number(d) <= 6 && Array.isArray(v) && v.length === 2 && v.every((t) => /^\d{2}:\d{2}$/.test(t)) && v[0] < v[1];
    if (!ok) throw new HttpError(400, 'Horário de funcionamento inválido.');
    hours[d] = v;
  }
  return {
    name,
    category_id: categoryId,
    description: String(body.description || '').trim().slice(0, 500) || null,
    address: String(body.address || '').trim() || null,
    neighborhood: String(body.neighborhood || '').trim() || null,
    phone: phone || null,
    instagram: String(body.instagram || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || null,
    hours: JSON.stringify(hours),
    booking_enabled: body.booking_enabled ? 1 : 0,
    featured: body.featured ? 1 : 0,
    active: body.active === false ? 0 : 1,
  };
}

route('POST', '/api/panel/businesses', (req, { user, body }) => {
  const cityId = cityScope(user, body.city_id);
  const b = validateBusiness(body);
  const cols = Object.keys(b);
  const r = db.prepare(`INSERT INTO c10_businesses (city_id, slug, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(cityId, uniqueSlug(cityId, b.name), ...Object.values(b));
  if (body.lead_id) db.prepare(`UPDATE c10_leads SET status = 'cadastrado' WHERE id = ? AND city_id = ?`).run(Number(body.lead_id), cityId);
  return { id: Number(r.lastInsertRowid) };
}, P);

route('PUT', '/api/panel/businesses/:id', (req, { user, params, body }) => {
  const current = businessInScope(user, Number(params.id));
  const b = validateBusiness(body);
  // O slug (endereço da página) só muda se o nome mudar, para não quebrar links divulgados à toa.
  const slug = slugify(b.name) === slugify(current.name) ? current.slug : uniqueSlug(current.city_id, b.name, current.id);
  db.prepare(`UPDATE c10_businesses SET slug = ?, ${Object.keys(b).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(slug, ...Object.values(b), current.id);
  return { ok: true, slug };
}, P);

/* --------------------------- Pedidos de cadastro --------------------------- */

route('GET', '/api/panel/leads', (req, { user, query }) => {
  const sql = `SELECT l.*, c.name AS city_name, cat.name AS category_name, cat.id AS category_id
    FROM c10_leads l LEFT JOIN c10_cities c ON c.id = l.city_id LEFT JOIN c10_categories cat ON cat.id = l.category_id`;
  // Admin geral vê também pedidos de cidades que ainda não existem no Cidade 10.
  if (user.role === 'super' && query.get('city') === 'all') return db.prepare(`${sql} ORDER BY l.id DESC`).all();
  const cityId = cityScope(user, query.get('city'));
  return db.prepare(`${sql} WHERE l.city_id = ? ORDER BY l.id DESC`).all(cityId);
}, P);

const LEAD_STATUS = ['novo', 'contatado', 'cadastrado', 'descartado'];
route('PATCH', '/api/panel/leads/:id', (req, { user, params, body }) => {
  if (!LEAD_STATUS.includes(body.status)) throw new HttpError(400, 'Status inválido.');
  const lead = db.prepare('SELECT city_id FROM c10_leads WHERE id = ?').get(Number(params.id));
  if (!lead) throw new HttpError(404, 'Pedido não encontrado.');
  if (user.role === 'city' && lead.city_id !== user.city_id) throw new HttpError(403, 'Pedido de outra cidade.');
  db.prepare('UPDATE c10_leads SET status = ? WHERE id = ?').run(body.status, Number(params.id));
  return { ok: true };
}, P);

/* ------------------------------- Usuários ------------------------------- */

const USER_SELECT = `SELECT u.id, u.name, u.email, u.role, u.city_id, u.business_id, u.active, u.created_at,
    c.name AS city_name, b.name AS business_name, b.city_id AS business_city_id, b.booking_enabled
  FROM users u LEFT JOIN c10_cities c ON c.id = u.city_id LEFT JOIN c10_businesses b ON b.id = u.business_id`;

route('GET', '/api/panel/users', (req, { user }) => {
  if (user.role === 'super') return db.prepare(`${USER_SELECT} ORDER BY u.role, u.name`).all();
  return db.prepare(`${USER_SELECT} WHERE u.role = 'shop' AND b.city_id = ? ORDER BY u.name`).all(user.city_id);
}, P);

function checkUserScope(actor, target) {
  if (actor.role === 'super') return;
  // Admin da cidade só gerencia donos de comércios da cidade dele.
  if (target.role !== 'shop') throw new HttpError(403, 'Você só pode gerenciar acessos de comércios.');
  const biz = db.prepare('SELECT city_id FROM c10_businesses WHERE id = ?').get(target.business_id);
  if (!biz || biz.city_id !== actor.city_id) throw new HttpError(403, 'Comércio de outra cidade.');
}

route('POST', '/api/panel/users', (req, { user, body }) => {
  const target = {
    role: body.role,
    city_id: body.role === 'city' ? Number(body.city_id) || null : null,
    business_id: body.role === 'shop' ? Number(body.business_id) || null : null,
  };
  checkUserScope(user, target);
  if (target.role === 'city' && !db.prepare('SELECT 1 FROM c10_cities WHERE id = ?').get(target.city_id)) throw new HttpError(400, 'Escolha a cidade.');
  if (target.role === 'shop' && !db.prepare('SELECT 1 FROM c10_businesses WHERE id = ?').get(target.business_id)) throw new HttpError(400, 'Escolha o comércio.');
  const id = createUser({ name: body.name, email: body.email, password: body.password, role: target.role, cityId: target.city_id, businessId: target.business_id });
  return { id };
}, P);

route('PUT', '/api/panel/users/:id', (req, { user, params, body }) => {
  const id = Number(params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new HttpError(404, 'Usuário não encontrado.');
  checkUserScope(user, target);
  if (id === user.id && body.active === false) throw new HttpError(400, 'Você não pode desativar o próprio acesso.');
  const name = String(body.name ?? target.name).trim();
  if (!name) throw new HttpError(400, 'Informe o nome.');
  tx(() => {
    db.prepare('UPDATE users SET name = ?, active = ? WHERE id = ?').run(name, body.active === false ? 0 : 1, id);
    if (body.active === false) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    if (body.password) setPassword(id, body.password);
  });
  return { ok: true };
}, P);

/* -------------------------------- Cidades -------------------------------- */

function validateCity(body) {
  const name = String(body.name || '').trim();
  const state = String(body.state || '').trim().toUpperCase();
  if (!name || !/^[A-Z]{2}$/.test(state)) throw new HttpError(400, 'Informe o nome e a UF (ex.: PR).');
  const color = /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : '#0f766e';
  return {
    name, state, color,
    tagline: String(body.tagline || '').trim() || `Tudo de ${name} em um só lugar`,
    description: String(body.description || '').trim() || null,
    active: body.active === false ? 0 : 1,
  };
}

route('POST', '/api/panel/cities', (req, { body }) => {
  const c = validateCity(body);
  const slug = slugify(c.name);
  if (db.prepare('SELECT 1 FROM c10_cities WHERE slug = ?').get(slug)) throw new HttpError(409, 'Esta cidade já existe.');
  const r = db.prepare('INSERT INTO c10_cities (slug, name, state, color, tagline, description, active) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(slug, ...Object.values(c));
  return { id: Number(r.lastInsertRowid), slug };
}, SUPER);

route('PUT', '/api/panel/cities/:id', (req, { params, body }) => {
  const c = validateCity(body);
  // O slug da cidade não muda: é o endereço que já foi divulgado.
  const r = db.prepare('UPDATE c10_cities SET name = ?, state = ?, color = ?, tagline = ?, description = ?, active = ? WHERE id = ?')
    .run(...Object.values(c), Number(params.id));
  if (!r.changes) throw new HttpError(404, 'Cidade não encontrada.');
  return { ok: true };
}, SUPER);
