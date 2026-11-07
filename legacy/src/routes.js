import { db, getSettings, setSetting, tx } from './db.js';
import { todayStr, addDays, isValidDate, toMin, fromMin, weekdayOf } from './time.js';
import {
  HttpError, availableSlots, createAppointment, getAppointment, getAppointmentByCode, listAppointments,
  rescheduleAppointment, cancelByClient, normalizePhone, getBarber,
} from './scheduling.js';
import { route } from './router.js';
import { login, logout, changePassword, ROLES, SESSION_DAYS } from './users.js';
import { clientIp, limit } from './ratelimit.js';
import { getShop, bookingPath } from './c10/data.js';
import {
  loyaltyConfig, clientLoyalty, publicLoyalty, redeem, adjust, loyaltyHistory, saveLoyaltyConfig, loyaltyOverview,
} from './loyalty.js';

const publicSettings = (s) => ({
  shop_name: s.shop_name,
  shop_phone: s.shop_phone,
  shop_address: [s.shop_address, s.shop_neighborhood].filter(Boolean).join(' - '),
  max_days_ahead: Number(s.max_days_ahead),
  cancel_limit_hours: Number(s.cancel_limit_hours),
});

const serializeAppt = (a, { full = false } = {}) => a && {
  id: full ? a.id : undefined,
  code: a.code,
  date: a.date,
  start: fromMin(a.start_min),
  end: fromMin(a.end_min),
  start_min: a.start_min,
  end_min: a.end_min,
  status: a.status,
  price_cents: a.price_cents,
  service_id: a.service_id,
  service_name: a.service_name,
  barber_id: a.barber_id,
  barber_name: a.barber_name,
  barber_color: a.barber_color,
  client_name: a.client_name,
  ...(full && {
    client_id: a.client_id,
    client_phone: a.client_phone,
    source: a.source,
    payment: a.payment,
    notes: a.notes,
    reminded: !!a.reminded,
    created_at: a.created_at,
  }),
};

/** Agendamento para o cliente, com os dados da barbearia (usado em "Meu horário"). */
function publicAppt(a) {
  const shop = getShop(a.shop_id);
  return {
    ...serializeAppt(a),
    shop_name: shop?.name,
    shop_phone: shop?.phone,
    booking_path: shop ? bookingPath(shop) : null,
    loyalty: publicLoyalty(a.shop_id, a.client_id),
  };
}

function requireShop(id) {
  const shop = getShop(Number(id));
  if (!shop) throw new HttpError(404, 'Agenda online não encontrada.');
  return shop.id;
}

/* ------------------------------------------------------------------ */
/* Login (todos os tipos de usuário)                                   */
/* ------------------------------------------------------------------ */

route('POST', '/api/auth/login', (req, { body, res }) => {
  const { token, user } = login(body.email, body.password, clientIp(req), body.area);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * SESSION_DAYS}${secure}`);
  return { role: user.role, redirect: user.role === 'shop' ? '/admin' : '/painel' };
});

route('POST', '/api/auth/logout', (req, { res }) => {
  logout(req);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  return { ok: true };
});

route('GET', '/api/auth/me', (req, { user }) => {
  if (!user) return { authenticated: false };
  const out = { authenticated: true, user: { ...user, role_label: ROLES[user.role] } };
  if (user.role === 'shop') {
    const b = db.prepare('SELECT id, name, booking_enabled FROM c10_businesses WHERE id = ?').get(user.business_id);
    out.business = b;
  }
  return out;
});

route('PUT', '/api/auth/password', (req, { user, body }) => {
  changePassword(user.id, body.current, body.next);
  return { ok: true };
}, { auth: 'user' });

/* ------------------------------------------------------------------ */
/* Área pública (cliente)                                              */
/* ------------------------------------------------------------------ */

route('GET', '/api/public/shops/:shop/info', (req, { params }) => {
  const shopId = requireShop(params.shop);
  const shop = getShop(shopId);
  const barbers = db.prepare('SELECT id, name, color FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY name').all(shopId);
  const hours = db.prepare('SELECT barber_id, weekday FROM barber_hours WHERE barber_id IN (SELECT id FROM barbers WHERE shop_id = ?)').all(shopId);
  for (const b of barbers) b.weekdays = hours.filter((h) => h.barber_id === b.id).map((h) => h.weekday);
  return {
    settings: publicSettings(getSettings(shopId)),
    today: todayStr(),
    page_path: `/${shop.city_slug}/${shop.slug}`,
    city_name: shop.city_name,
    services: db.prepare('SELECT id, name, description, duration_min, price_cents FROM services WHERE shop_id = ? AND active = 1 ORDER BY id').all(shopId),
    barbers,
    loyalty: publicLoyalty(shopId),
  };
});

route('GET', '/api/public/shops/:shop/availability', (req, { params, query }) => {
  const slots = availableSlots({
    shopId: requireShop(params.shop),
    serviceId: Number(query.get('service')),
    barberId: Number(query.get('barber')) || null,
    date: query.get('date'),
  });
  return slots.map((s) => ({ time: fromMin(s.start), start: s.start, barbers: s.barbers }));
});

route('POST', '/api/public/shops/:shop/appointments', (req, { params, body }) => {
  // Evita robôs enchendo a agenda: no máximo 10 agendamentos por hora vindos do mesmo IP.
  limit(`booking:${clientIp(req)}`, { max: 10, windowMs: 60 * 60 * 1000, message: 'Muitos agendamentos seguidos.' });
  return publicAppt(createAppointment({
  shopId: requireShop(params.shop),
  serviceId: Number(body.serviceId),
  barberId: Number(body.barberId) || null,
  date: body.date,
  start: body.start,
  name: body.name,
  phone: body.phone,
  notes: body.notes,
  source: 'online',
}));
});

route('GET', '/api/public/appointments/:code', (req, { params }) => {
  const appt = getAppointmentByCode(params.code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  return publicAppt(appt);
});

route('POST', '/api/public/appointments/:code/cancel', (req, { params }) => publicAppt(cancelByClient(params.code)));

route('POST', '/api/public/appointments/:code/confirm', (req, { params }) => {
  const appt = getAppointmentByCode(params.code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  if (appt.status === 'scheduled') db.prepare(`UPDATE appointments SET status = 'confirmed' WHERE id = ?`).run(appt.id);
  return publicAppt(getAppointment(appt.id));
});

/* ------------------------------------------------------------------ */
/* Painel da barbearia                                                 */
/* ------------------------------------------------------------------ */

const S = { auth: 'shop' };

route('GET', '/api/admin/context', (req, { shopId, user }) => {
  const shop = getShop(shopId);
  return {
    user: { name: user.name, email: user.email, role: user.role, role_label: ROLES[user.role] },
    shop: { id: shop.id, name: shop.name, city_name: shop.city_name, booking_path: bookingPath(shop), page_path: `/${shop.city_slug}/${shop.slug}` },
  };
}, S);

route('GET', '/api/admin/agenda', (req, { shopId, query }) => {
  const date = query.get('date') || todayStr();
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');
  const barbers = db.prepare('SELECT * FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY name').all(shopId);
  const hours = db.prepare('SELECT * FROM barber_hours WHERE weekday = ?').all(weekdayOf(date));
  for (const b of barbers) b.hours = hours.find((h) => h.barber_id === b.id) || null;
  const blocks = db
    .prepare('SELECT * FROM blocks WHERE shop_id = ? AND date_start <= ? AND date_end >= ? ORDER BY start_min')
    .all(shopId, date, date);
  const appointments = listAppointments({ shopId, date }).map((a) => serializeAppt(a, { full: true }));
  return { date, today: todayStr(), barbers, blocks, appointments };
}, S);

route('GET', '/api/admin/availability', (req, { shopId, query }) => {
  const slots = availableSlots({
    shopId,
    serviceId: Number(query.get('service')),
    barberId: Number(query.get('barber')) || null,
    date: query.get('date'),
    enforcePublicRules: false,
    excludeId: Number(query.get('exclude')) || 0, // ao remarcar, o próprio horário conta como livre
  });
  return slots.map((s) => ({ time: fromMin(s.start), start: s.start, barbers: s.barbers }));
}, S);

route('POST', '/api/admin/appointments', (req, { shopId, body }) => serializeAppt(createAppointment({
  shopId,
  serviceId: Number(body.serviceId),
  barberId: Number(body.barberId),
  date: body.date,
  start: typeof body.start === 'string' ? toMin(body.start) : body.start,
  name: body.name,
  phone: body.phone,
  notes: body.notes,
  source: 'admin',
  force: !!body.force,
}), { full: true }), S);

const STATUSES = ['scheduled', 'confirmed', 'done', 'cancelled', 'no_show'];
const PAYMENTS = ['pix', 'dinheiro', 'cartao', null];

route('PATCH', '/api/admin/appointments/:id', (req, { shopId, params, body }) => {
  const id = Number(params.id);
  if (!getAppointment(id, shopId)) throw new HttpError(404, 'Agendamento não encontrado.');

  if (body.date || body.start != null || body.barberId || body.serviceId) {
    rescheduleAppointment(shopId, id, {
      date: body.date,
      start: typeof body.start === 'string' ? toMin(body.start) : body.start,
      barberId: Number(body.barberId) || null,
      serviceId: Number(body.serviceId) || null,
      force: !!body.force,
    });
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Status inválido.');
    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(body.status, id);
  }
  if (body.payment !== undefined) {
    if (!PAYMENTS.includes(body.payment)) throw new HttpError(400, 'Forma de pagamento inválida.');
    db.prepare('UPDATE appointments SET payment = ? WHERE id = ?').run(body.payment, id);
  }
  if (body.price_cents !== undefined) {
    db.prepare('UPDATE appointments SET price_cents = ? WHERE id = ?').run(Math.max(0, Math.round(body.price_cents)), id);
  }
  if (body.notes !== undefined) db.prepare('UPDATE appointments SET notes = ? WHERE id = ?').run(body.notes || null, id);
  if (body.reminded !== undefined) db.prepare('UPDATE appointments SET reminded = ? WHERE id = ?').run(body.reminded ? 1 : 0, id);
  return serializeAppt(getAppointment(id), { full: true });
}, S);

/** Agendamentos de uma data que ainda precisam de lembrete (por padrão, amanhã). */
route('GET', '/api/admin/reminders', (req, { shopId, query }) => {
  const date = query.get('date') || addDays(todayStr(), 1);
  return listAppointments({ shopId, date })
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status))
    .map((a) => serializeAppt(a, { full: true }));
}, S);

/* ---------------------------- Clientes ---------------------------- */

const CLIENT_STATS = `
  SELECT c.*,
    COUNT(CASE WHEN a.status = 'done' THEN 1 END) AS visits,
    COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) AS no_shows,
    COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancellations,
    COALESCE(SUM(CASE WHEN a.status = 'done' THEN a.price_cents END), 0) AS total_spent,
    MAX(CASE WHEN a.status = 'done' THEN a.date END) AS last_visit,
    MIN(CASE WHEN a.status IN ('scheduled','confirmed') AND a.date >= date('now','localtime') THEN a.date END) AS next_visit
  FROM clients c LEFT JOIN appointments a ON a.client_id = c.id`;

route('GET', '/api/admin/clients', (req, { shopId, query }) => {
  const q = `%${(query.get('q') || '').trim()}%`;
  const rows = db
    .prepare(`${CLIENT_STATS} WHERE c.shop_id = ? AND (c.name LIKE ? OR c.phone LIKE ?) GROUP BY c.id ORDER BY c.name LIMIT 300`)
    .all(shopId, q, q);
  const cfg = loyaltyConfig(shopId);
  if (cfg.enabled) for (const c of rows) c.loyalty = clientLoyalty(shopId, c.id, cfg);
  return rows;
}, S);

route('GET', '/api/admin/clients/:id', (req, { shopId, params }) => {
  const client = db.prepare(`${CLIENT_STATS} WHERE c.id = ? AND c.shop_id = ? GROUP BY c.id`).get(Number(params.id), shopId);
  if (!client) throw new HttpError(404, 'Cliente não encontrado.');
  client.history = listAppointments({ shopId, clientId: client.id }).reverse().map((a) => serializeAppt(a, { full: true }));
  const cfg = loyaltyConfig(shopId);
  if (cfg.enabled) client.loyalty = { ...clientLoyalty(shopId, client.id, cfg), history: loyaltyHistory(shopId, client.id) };
  return client;
}, S);

route('PUT', '/api/admin/clients/:id', (req, { shopId, params, body }) => {
  const id = Number(params.id);
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ? AND shop_id = ?').get(id, shopId)) throw new HttpError(404, 'Cliente não encontrado.');
  const phone = normalizePhone(body.phone);
  if (!String(body.name || '').trim() || phone.length < 12) throw new HttpError(400, 'Nome e telefone são obrigatórios.');
  const dup = db.prepare('SELECT id FROM clients WHERE shop_id = ? AND phone = ? AND id != ?').get(shopId, phone, id);
  if (dup) throw new HttpError(409, 'Já existe outro cliente com este telefone.');
  db.prepare('UPDATE clients SET name = ?, phone = ?, notes = ?, blocked = ? WHERE id = ?')
    .run(body.name.trim(), phone, body.notes || null, body.blocked ? 1 : 0, id);
  return { ok: true };
}, S);

/* --------------------------- Fidelidade --------------------------- */

const clientOf = (shopId, id) => {
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ? AND shop_id = ?').get(Number(id), shopId)) throw new HttpError(404, 'Cliente não encontrado.');
  return Number(id);
};

route('GET', '/api/admin/loyalty', (req, { shopId }) => loyaltyOverview(shopId), S);
route('PUT', '/api/admin/loyalty', (req, { shopId, body }) => saveLoyaltyConfig(shopId, body), S);
route('POST', '/api/admin/clients/:id/loyalty/redeem', (req, { shopId, params, body }) => {
  if (!loyaltyConfig(shopId).enabled) throw new HttpError(400, 'O cartão fidelidade está desligado.');
  return redeem(shopId, clientOf(shopId, params.id), Number(body.appointmentId) || null);
}, S);
route('POST', '/api/admin/clients/:id/loyalty/adjust', (req, { shopId, params, body }) =>
  adjust(shopId, clientOf(shopId, params.id), body.stamps, String(body.note || '').slice(0, 120)), S);

/* ---------------------------- Serviços ---------------------------- */

function validateService(b) {
  const name = String(b.name || '').trim();
  const duration = Number(b.duration_min);
  const price = Math.round(Number(b.price_cents));
  if (!name || !(duration >= 5 && duration <= 480) || !(price >= 0)) {
    throw new HttpError(400, 'Preencha nome, duração (5 a 480 min) e preço.');
  }
  return [name, b.description || null, duration, price, b.active === false ? 0 : 1];
}

route('GET', '/api/admin/services', (req, { shopId }) =>
  db.prepare('SELECT * FROM services WHERE shop_id = ? ORDER BY active DESC, id').all(shopId), S);
route('POST', '/api/admin/services', (req, { shopId, body }) => {
  const r = db.prepare('INSERT INTO services (name, description, duration_min, price_cents, active, shop_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(...validateService(body), shopId);
  return { id: Number(r.lastInsertRowid) };
}, S);
route('PUT', '/api/admin/services/:id', (req, { shopId, params, body }) => {
  const r = db.prepare('UPDATE services SET name = ?, description = ?, duration_min = ?, price_cents = ?, active = ? WHERE id = ? AND shop_id = ?')
    .run(...validateService(body), Number(params.id), shopId);
  if (!r.changes) throw new HttpError(404, 'Serviço não encontrado.');
  return { ok: true };
}, S);

/* ---------------------- Barbeiros e horários ---------------------- */

route('GET', '/api/admin/barbers', (req, { shopId }) => {
  const barbers = db.prepare('SELECT * FROM barbers WHERE shop_id = ? ORDER BY active DESC, name').all(shopId);
  const hours = db.prepare('SELECT * FROM barber_hours WHERE barber_id IN (SELECT id FROM barbers WHERE shop_id = ?)').all(shopId);
  for (const b of barbers) {
    b.hours = hours.filter((h) => h.barber_id === b.id).map((h) => ({
      weekday: h.weekday, start: fromMin(h.start_min), end: fromMin(h.end_min),
      break_start: fromMin(h.break_start), break_end: fromMin(h.break_end),
    }));
  }
  return barbers;
}, S);

function saveBarber(shopId, id, b) {
  if (id && !getBarber(shopId, id)) throw new HttpError(404, 'Barbeiro não encontrado.');
  const name = String(b.name || '').trim();
  if (!name) throw new HttpError(400, 'Informe o nome do barbeiro.');
  const commission = Math.min(100, Math.max(0, Number(b.commission_pct) || 0));
  const hours = Array.isArray(b.hours) ? b.hours : [];
  for (const h of hours) {
    const s = toMin(h.start), e = toMin(h.end);
    if (!(h.weekday >= 0 && h.weekday <= 6) || s == null || e == null || s >= e) {
      throw new HttpError(400, 'Horário de trabalho inválido.');
    }
    const bs = toMin(h.break_start), be = toMin(h.break_end);
    if ((bs == null) !== (be == null) || (bs != null && (bs >= be || bs < s || be > e))) {
      throw new HttpError(400, 'Intervalo de almoço inválido.');
    }
  }
  return tx(() => {
    const args = [name, normalizePhone(b.phone) || null, commission, b.color || '#c8a24a', b.active === false ? 0 : 1];
    if (id) db.prepare('UPDATE barbers SET name = ?, phone = ?, commission_pct = ?, color = ?, active = ? WHERE id = ?').run(...args, id);
    else id = Number(db.prepare('INSERT INTO barbers (name, phone, commission_pct, color, active, shop_id) VALUES (?, ?, ?, ?, ?, ?)').run(...args, shopId).lastInsertRowid);

    db.prepare('DELETE FROM barber_hours WHERE barber_id = ?').run(id);
    const ins = db.prepare('INSERT INTO barber_hours (barber_id, weekday, start_min, end_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?)');
    for (const h of hours) ins.run(id, h.weekday, toMin(h.start), toMin(h.end), toMin(h.break_start), toMin(h.break_end));
    return { id };
  });
}

route('POST', '/api/admin/barbers', (req, { shopId, body }) => saveBarber(shopId, null, body), S);
route('PUT', '/api/admin/barbers/:id', (req, { shopId, params, body }) => saveBarber(shopId, Number(params.id), body), S);

/* ------------- Bloqueios (folgas, férias, compromissos) ------------- */

route('GET', '/api/admin/blocks', (req, { shopId }) => db.prepare(`
  SELECT bl.*, b.name AS barber_name FROM blocks bl LEFT JOIN barbers b ON b.id = bl.barber_id
  WHERE bl.shop_id = ? AND bl.date_end >= ? ORDER BY bl.date_start, bl.start_min`).all(shopId, todayStr()), S);

route('POST', '/api/admin/blocks', (req, { shopId, body }) => {
  const dateStart = body.date_start;
  const dateEnd = body.date_end || dateStart;
  if (!isValidDate(dateStart) || !isValidDate(dateEnd) || dateEnd < dateStart) throw new HttpError(400, 'Período inválido.');
  const s = body.start ? toMin(body.start) : 0;
  const e = body.end ? toMin(body.end) : 1440;
  if (s >= e) throw new HttpError(400, 'Horário inválido.');
  const barberId = Number(body.barber_id) || null;
  if (barberId && !getBarber(shopId, barberId)) throw new HttpError(400, 'Barbeiro inválido.');
  const r = db.prepare('INSERT INTO blocks (shop_id, barber_id, date_start, date_end, start_min, end_min, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(shopId, barberId, dateStart, dateEnd, s, e, body.reason || null);
  return { id: Number(r.lastInsertRowid) };
}, S);

route('DELETE', '/api/admin/blocks/:id', (req, { shopId, params }) => {
  db.prepare('DELETE FROM blocks WHERE id = ? AND shop_id = ?').run(Number(params.id), shopId);
  return { ok: true };
}, S);

/* ---------------------- Financeiro / relatórios ---------------------- */

route('GET', '/api/admin/reports', (req, { shopId, query }) => {
  const today = todayStr();
  const from = query.get('from') || today.slice(0, 8) + '01';
  const to = query.get('to') || today;
  if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Período inválido.');

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN status = 'done' THEN 1 END) AS done,
      COUNT(CASE WHEN status = 'no_show' THEN 1 END) AS no_show,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
      COUNT(CASE WHEN status IN ('scheduled','confirmed') THEN 1 END) AS pending,
      COUNT(CASE WHEN source = 'online' THEN 1 END) AS online,
      COALESCE(SUM(CASE WHEN status = 'done' THEN price_cents END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN status = 'no_show' THEN price_cents END), 0) AS lost_no_show,
      COALESCE(SUM(CASE WHEN status IN ('scheduled','confirmed') THEN price_cents END), 0) AS expected
    FROM appointments WHERE shop_id = ? AND date BETWEEN ? AND ?`).get(shopId, from, to);

  const byBarber = db.prepare(`
    SELECT b.id, b.name, b.color, b.commission_pct,
      COUNT(CASE WHEN a.status = 'done' THEN 1 END) AS done,
      COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) AS no_show,
      COALESCE(SUM(CASE WHEN a.status = 'done' THEN a.price_cents END), 0) AS revenue
    FROM barbers b LEFT JOIN appointments a ON a.barber_id = b.id AND a.date BETWEEN ? AND ?
    WHERE b.shop_id = ? GROUP BY b.id ORDER BY revenue DESC`).all(from, to, shopId);
  for (const b of byBarber) b.commission_cents = Math.round((b.revenue * b.commission_pct) / 100);

  const byService = db.prepare(`
    SELECT s.name, COUNT(*) AS done, SUM(a.price_cents) AS revenue
    FROM appointments a JOIN services s ON s.id = a.service_id
    WHERE a.shop_id = ? AND a.status = 'done' AND a.date BETWEEN ? AND ?
    GROUP BY s.id ORDER BY revenue DESC`).all(shopId, from, to);

  const byPayment = db.prepare(`
    SELECT COALESCE(payment, 'nao_informado') AS payment, COUNT(*) AS n, SUM(price_cents) AS revenue
    FROM appointments WHERE shop_id = ? AND status = 'done' AND date BETWEEN ? AND ?
    GROUP BY payment ORDER BY revenue DESC`).all(shopId, from, to);

  const byDay = db.prepare(`
    SELECT date, COALESCE(SUM(CASE WHEN status = 'done' THEN price_cents END), 0) AS revenue,
      COUNT(CASE WHEN status = 'done' THEN 1 END) AS done
    FROM appointments WHERE shop_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`).all(shopId, from, to);

  return { from, to, totals, byBarber, byService, byPayment, byDay };
}, S);

/* -------------------------- Configurações -------------------------- */

const EDITABLE_SETTINGS = [
  'shop_name', 'shop_phone', 'shop_address', 'slot_interval', 'min_advance_min', 'max_days_ahead',
  'cancel_limit_hours', 'max_active_per_phone', 'block_after_no_shows', 'reminder_template',
];

route('GET', '/api/admin/settings', (req, { shopId }) => {
  const s = getSettings(shopId);
  return Object.fromEntries(EDITABLE_SETTINGS.map((k) => [k, s[k]]));
}, S);

route('PUT', '/api/admin/settings', (req, { shopId, body }) => {
  if (body.shop_name !== undefined && !String(body.shop_name).trim()) throw new HttpError(400, 'Informe o nome da barbearia.');
  tx(() => {
    for (const k of EDITABLE_SETTINGS) {
      if (body[k] === undefined) continue;
      setSetting(shopId, k, k === 'shop_phone' ? normalizePhone(body[k]) : String(body[k]).trim());
    }
  });
  return { ok: true };
}, S);
