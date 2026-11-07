// API do painel da barbearia. O dono acessa a dele; admins indicam a barbearia no cabeçalho X-Shop-Id.
import { db, tx, Prisma } from '../db';
import { route } from './router';
import { ROLES } from '../users';
import { getSettings, setSetting } from '../settings';
import { getShop, bookingPath } from '../c10';
import { HttpError, normalizePhone, str } from '../util';
import { todayStr, addDays, isValidDate, toMin, fromMin, weekdayOf, toDbDate, fromDbDate } from '../time';
import {
  availableSlots, createAppointment, getAppointment, listAppointments, rescheduleAppointment, getBarber,
} from '../scheduling';
import {
  loyaltyConfig, clientLoyalty, redeem, adjust, loyaltyHistory, saveLoyaltyConfig, loyaltyOverview,
} from '../loyalty';
import { serializeAppt } from './public';

route('GET', '/api/admin/context', async ({ shopId, user }) => {
  const shop = (await getShop(shopId))!;
  return {
    user: { name: user.name, email: user.email, role: user.role, role_label: ROLES[user.role] },
    shop: { id: shop.id, name: shop.name, city_name: shop.city_name, booking_path: bookingPath(shop), page_path: `/${shop.city_slug}/${shop.slug}` },
  };
}, 'shop');

route('GET', '/api/admin/agenda', async ({ shopId, query }) => {
  const date = query.get('date') || todayStr();
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');
  const d = toDbDate(date);
  const [barbers, blocks, appts] = await Promise.all([
    db().barber.findMany({ where: { shop_id: shopId, active: true }, orderBy: { name: 'asc' }, include: { hours: { where: { weekday: weekdayOf(date) } } } }),
    db().block.findMany({ where: { shop_id: shopId, date_start: { lte: d }, date_end: { gte: d } }, orderBy: { start_min: 'asc' } }),
    listAppointments({ shopId, date }),
  ]);
  return {
    date,
    today: todayStr(),
    barbers: barbers.map(({ hours, ...b }) => ({ ...b, hours: hours[0] ?? null })),
    blocks: blocks.map(toBlock),
    appointments: appts.map((a) => serializeAppt(a, { full: true })),
  };
}, 'shop');

route('GET', '/api/admin/availability', async ({ shopId, query }) => {
  const slots = await availableSlots({
    shopId,
    serviceId: Number(query.get('service')),
    barberId: Number(query.get('barber')) || null,
    date: query.get('date'),
    enforcePublicRules: false,
    excludeId: Number(query.get('exclude')) || 0, // ao remarcar, o próprio horário conta como livre
  });
  return slots.map((s) => ({ time: fromMin(s.start), start: s.start, barbers: s.barbers }));
}, 'shop');

route('POST', '/api/admin/appointments', async ({ shopId, body }) => serializeAppt(await createAppointment({
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
}), { full: true }), 'shop');

const STATUSES = ['scheduled', 'confirmed', 'done', 'cancelled', 'no_show'];
const PAYMENTS = ['pix', 'dinheiro', 'cartao', null];

route('PATCH', '/api/admin/appointments/:id', async ({ shopId, params, body }) => {
  const id = Number(params.id);
  if (!(await getAppointment(id, shopId))) throw new HttpError(404, 'Agendamento não encontrado.');
  if (body.date || body.start != null || body.barberId || body.serviceId) {
    await rescheduleAppointment(shopId, id, {
      date: body.date,
      start: typeof body.start === 'string' ? toMin(body.start) : body.start,
      barberId: Number(body.barberId) || null,
      serviceId: Number(body.serviceId) || null,
      force: !!body.force,
    });
  }
  const data: Prisma.AppointmentUpdateInput = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Status inválido.');
    data.status = body.status;
  }
  if (body.payment !== undefined) {
    if (!PAYMENTS.includes(body.payment)) throw new HttpError(400, 'Forma de pagamento inválida.');
    data.payment = body.payment;
  }
  if (body.price_cents !== undefined) data.price_cents = Math.max(0, Math.round(Number(body.price_cents) || 0));
  if (body.notes !== undefined) data.notes = str(body.notes, 300) || null;
  if (body.reminded !== undefined) data.reminded = !!body.reminded;
  if (Object.keys(data).length) await db().appointment.update({ where: { id }, data });
  return serializeAppt((await getAppointment(id))!, { full: true });
}, 'shop');

/** Agendamentos de uma data que ainda precisam de lembrete (por padrão, amanhã). */
route('GET', '/api/admin/reminders', async ({ shopId, query }) => {
  const date = query.get('date') || addDays(todayStr(), 1);
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');
  return (await listAppointments({ shopId, date }))
    .filter((a) => ['scheduled', 'confirmed'].includes(a.status))
    .map((a) => serializeAppt(a, { full: true }));
}, 'shop');

/* ---------------------------- Clientes ---------------------------- */

interface ClientStats {
  id: number; shop_id: number; name: string; phone: string; notes: string | null; blocked: boolean; created_at: Date;
  visits: number; no_shows: number; cancellations: number; total_spent: number; last_visit: string | null; next_visit: string | null;
}

/** Clientes com visitas, faltas, gasto, última visita e próximo horário. */
function clientStats(shopId: number, where: Prisma.Sql) {
  return db().$queryRaw<ClientStats[]>`
    SELECT c.*,
      COUNT(a.id) FILTER (WHERE a.status = 'done')::int AS visits,
      COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
      COUNT(a.id) FILTER (WHERE a.status = 'cancelled')::int AS cancellations,
      COALESCE(SUM(a.price_cents) FILTER (WHERE a.status = 'done'), 0)::int AS total_spent,
      to_char(MAX(a.date) FILTER (WHERE a.status = 'done'), 'YYYY-MM-DD') AS last_visit,
      to_char(MIN(a.date) FILTER (WHERE a.status IN ('scheduled', 'confirmed') AND a.date >= ${todayStr()}::date), 'YYYY-MM-DD') AS next_visit
    FROM clients c LEFT JOIN appointments a ON a.client_id = c.id
    WHERE c.shop_id = ${shopId} AND ${where}
    GROUP BY c.id ORDER BY c.name LIMIT 300`;
}

route('GET', '/api/admin/clients', async ({ shopId, query }) => {
  const q = `%${(query.get('q') || '').trim()}%`;
  const rows: (ClientStats & { loyalty?: unknown })[] = await clientStats(shopId, Prisma.sql`(c.name ILIKE ${q} OR c.phone LIKE ${q})`);
  const cfg = await loyaltyConfig(shopId);
  if (cfg.enabled) for (const c of rows) c.loyalty = await clientLoyalty(shopId, c.id, cfg);
  return rows;
}, 'shop');

route('GET', '/api/admin/clients/:id', async ({ shopId, params }) => {
  const [client] = await clientStats(shopId, Prisma.sql`c.id = ${Number(params.id)}`);
  if (!client) throw new HttpError(404, 'Cliente não encontrado.');
  const history = (await listAppointments({ shopId, clientId: client.id })).reverse().map((a) => serializeAppt(a, { full: true }));
  const cfg = await loyaltyConfig(shopId);
  const loyalty = cfg.enabled ? { ...(await clientLoyalty(shopId, client.id, cfg)), history: await loyaltyHistory(shopId, client.id) } : undefined;
  return { ...client, history, loyalty };
}, 'shop');

route('PUT', '/api/admin/clients/:id', async ({ shopId, params, body }) => {
  const id = Number(params.id);
  if (!(await db().client.findFirst({ where: { id, shop_id: shopId } }))) throw new HttpError(404, 'Cliente não encontrado.');
  const phone = normalizePhone(body.phone);
  const name = str(body.name, 80);
  if (!name || phone.length < 12) throw new HttpError(400, 'Nome e telefone são obrigatórios.');
  if (await db().client.findFirst({ where: { shop_id: shopId, phone, id: { not: id } } })) {
    throw new HttpError(409, 'Já existe outro cliente com este telefone.');
  }
  await db().client.update({ where: { id }, data: { name, phone, notes: str(body.notes, 1000) || null, blocked: !!body.blocked } });
  return { ok: true };
}, 'shop');

/* --------------------------- Fidelidade --------------------------- */

async function clientOf(shopId: number, id: string) {
  if (!(await db().client.findFirst({ where: { id: Number(id), shop_id: shopId } }))) throw new HttpError(404, 'Cliente não encontrado.');
  return Number(id);
}

route('GET', '/api/admin/loyalty', ({ shopId }) => loyaltyOverview(shopId), 'shop');
route('PUT', '/api/admin/loyalty', ({ shopId, body }) => saveLoyaltyConfig(shopId, body), 'shop');
route('POST', '/api/admin/clients/:id/loyalty/redeem', async ({ shopId, params, body }) => {
  if (!(await loyaltyConfig(shopId)).enabled) throw new HttpError(400, 'O cartão fidelidade está desligado.');
  return redeem(shopId, await clientOf(shopId, params.id), Number(body.appointmentId) || null);
}, 'shop');
route('POST', '/api/admin/clients/:id/loyalty/adjust', async ({ shopId, params, body }) =>
  adjust(shopId, await clientOf(shopId, params.id), body.stamps, str(body.note, 120) || null), 'shop');

/* ---------------------------- Serviços ---------------------------- */

function validateService(b: Record<string, unknown>) {
  const name = str(b.name, 60);
  const duration = Number(b.duration_min);
  const price = Math.round(Number(b.price_cents));
  if (!name || !(duration >= 5 && duration <= 480) || !(price >= 0)) throw new HttpError(400, 'Preencha nome, duração (5 a 480 min) e preço.');
  return { name, description: str(b.description, 200) || null, duration_min: duration, price_cents: price, active: b.active !== false };
}

route('GET', '/api/admin/services', ({ shopId }) =>
  db().service.findMany({ where: { shop_id: shopId }, orderBy: [{ active: 'desc' }, { id: 'asc' }] }), 'shop');
route('POST', '/api/admin/services', async ({ shopId, body }) =>
  db().service.create({ data: { ...validateService(body), shop_id: shopId }, select: { id: true } }), 'shop');
route('PUT', '/api/admin/services/:id', async ({ shopId, params, body }) => {
  const r = await db().service.updateMany({ where: { id: Number(params.id), shop_id: shopId }, data: validateService(body) });
  if (!r.count) throw new HttpError(404, 'Serviço não encontrado.');
  return { ok: true };
}, 'shop');

/* ---------------------- Barbeiros e horários ---------------------- */

route('GET', '/api/admin/barbers', async ({ shopId }) => {
  const barbers = await db().barber.findMany({
    where: { shop_id: shopId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { hours: { orderBy: { weekday: 'asc' } } },
  });
  return barbers.map(({ hours, ...b }) => ({
    ...b,
    hours: hours.map((h) => ({
      weekday: h.weekday, start: fromMin(h.start_min), end: fromMin(h.end_min),
      break_start: fromMin(h.break_start), break_end: fromMin(h.break_end),
    })),
  }));
}, 'shop');

async function saveBarber(shopId: number, id: number | null, b: Record<string, unknown>) {
  if (id && !(await getBarber(shopId, id))) throw new HttpError(404, 'Barbeiro não encontrado.');
  const name = str(b.name, 60);
  if (!name) throw new HttpError(400, 'Informe o nome do barbeiro.');
  const hours = (Array.isArray(b.hours) ? b.hours : []).map((h: Record<string, unknown>) => {
    const s = toMin(h.start), e = toMin(h.end), wd = Number(h.weekday);
    if (!(wd >= 0 && wd <= 6) || s == null || e == null || s >= e) throw new HttpError(400, 'Horário de trabalho inválido.');
    const bs = toMin(h.break_start), be = toMin(h.break_end);
    if ((bs == null) !== (be == null) || (bs != null && be != null && (bs >= be || bs < s || be > e))) {
      throw new HttpError(400, 'Intervalo de almoço inválido.');
    }
    return { weekday: wd, start_min: s, end_min: e, break_start: bs, break_end: be };
  });
  const data = {
    name,
    phone: normalizePhone(b.phone) || null,
    commission_pct: Math.min(100, Math.max(0, Number(b.commission_pct) || 0)),
    color: /^#[0-9a-f]{6}$/i.test(String(b.color)) ? String(b.color) : '#c8a24a',
    active: b.active !== false,
  };
  return tx(async () => {
    const barberId = id
      ? (await db().barber.update({ where: { id }, data })).id
      : (await db().barber.create({ data: { ...data, shop_id: shopId } })).id;
    await db().barberHour.deleteMany({ where: { barber_id: barberId } });
    if (hours.length) await db().barberHour.createMany({ data: hours.map((h) => ({ ...h, barber_id: barberId })) });
    return { id: barberId };
  });
}

route('POST', '/api/admin/barbers', ({ shopId, body }) => saveBarber(shopId, null, body), 'shop');
route('PUT', '/api/admin/barbers/:id', ({ shopId, params, body }) => saveBarber(shopId, Number(params.id), body), 'shop');

/* ------------- Bloqueios (folgas, férias, compromissos) ------------- */

type BlockRow = Prisma.BlockGetPayload<object>;
const toBlock = ({ date_start, date_end, ...b }: BlockRow) => ({ ...b, date_start: fromDbDate(date_start), date_end: fromDbDate(date_end) });

route('GET', '/api/admin/blocks', async ({ shopId }) => {
  const rows = await db().block.findMany({
    where: { shop_id: shopId, date_end: { gte: toDbDate(todayStr()) } },
    orderBy: [{ date_start: 'asc' }, { start_min: 'asc' }],
    include: { barber: { select: { name: true } } },
  });
  return rows.map(({ barber, ...b }) => ({ ...toBlock(b), barber_name: barber?.name ?? null }));
}, 'shop');

route('POST', '/api/admin/blocks', async ({ shopId, body }) => {
  const dateStart = body.date_start;
  const dateEnd = body.date_end || dateStart;
  if (!isValidDate(dateStart) || !isValidDate(dateEnd) || dateEnd < dateStart) throw new HttpError(400, 'Período inválido.');
  const s = body.start ? toMin(body.start) ?? 0 : 0;
  const e = body.end ? toMin(body.end) ?? 1440 : 1440;
  if (s >= e) throw new HttpError(400, 'Horário inválido.');
  const barberId = Number(body.barber_id) || null;
  if (barberId && !(await getBarber(shopId, barberId))) throw new HttpError(400, 'Barbeiro inválido.');
  return db().block.create({
    data: { shop_id: shopId, barber_id: barberId, date_start: toDbDate(dateStart), date_end: toDbDate(dateEnd), start_min: s, end_min: e, reason: str(body.reason, 120) || null },
    select: { id: true },
  });
}, 'shop');

route('DELETE', '/api/admin/blocks/:id', async ({ shopId, params }) => {
  await db().block.deleteMany({ where: { id: Number(params.id), shop_id: shopId } });
  return { ok: true };
}, 'shop');

/* ---------------------- Financeiro / relatórios ---------------------- */

route('GET', '/api/admin/reports', async ({ shopId, query }) => {
  const today = todayStr();
  const from = query.get('from') || today.slice(0, 8) + '01';
  const to = query.get('to') || today;
  if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Período inválido.');
  const period = Prisma.sql`date BETWEEN ${from}::date AND ${to}::date`;

  const [[totals], byBarber, byService, byPayment, byDay] = await Promise.all([
    db().$queryRaw<Record<string, number>[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status IN ('scheduled', 'confirmed'))::int AS pending,
        COUNT(*) FILTER (WHERE source = 'online')::int AS online,
        COALESCE(SUM(price_cents) FILTER (WHERE status = 'done'), 0)::int AS revenue,
        COALESCE(SUM(price_cents) FILTER (WHERE status = 'no_show'), 0)::int AS lost_no_show,
        COALESCE(SUM(price_cents) FILTER (WHERE status IN ('scheduled', 'confirmed')), 0)::int AS expected
      FROM appointments WHERE shop_id = ${shopId} AND ${period}`,
    db().$queryRaw<{ id: number; name: string; color: string; commission_pct: number; done: number; no_show: number; revenue: number }[]>`
      SELECT b.id, b.name, b.color, b.commission_pct,
        COUNT(a.id) FILTER (WHERE a.status = 'done')::int AS done,
        COUNT(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_show,
        COALESCE(SUM(a.price_cents) FILTER (WHERE a.status = 'done'), 0)::int AS revenue
      FROM barbers b LEFT JOIN appointments a ON a.barber_id = b.id AND a.date BETWEEN ${from}::date AND ${to}::date
      WHERE b.shop_id = ${shopId} GROUP BY b.id ORDER BY revenue DESC`,
    db().$queryRaw`
      SELECT s.name, COUNT(*)::int AS done, SUM(a.price_cents)::int AS revenue
      FROM appointments a JOIN services s ON s.id = a.service_id
      WHERE a.shop_id = ${shopId} AND a.status = 'done' AND a.date BETWEEN ${from}::date AND ${to}::date
      GROUP BY s.id, s.name ORDER BY revenue DESC`,
    db().$queryRaw`
      SELECT COALESCE(payment, 'nao_informado') AS payment, COUNT(*)::int AS n, SUM(price_cents)::int AS revenue
      FROM appointments WHERE shop_id = ${shopId} AND status = 'done' AND ${period}
      GROUP BY payment ORDER BY revenue DESC`,
    db().$queryRaw`
      SELECT to_char(date, 'YYYY-MM-DD') AS date, COALESCE(SUM(price_cents) FILTER (WHERE status = 'done'), 0)::int AS revenue,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done
      FROM appointments WHERE shop_id = ${shopId} AND ${period} GROUP BY date ORDER BY date`,
  ]);
  return {
    from, to, totals, byService, byPayment, byDay,
    byBarber: byBarber.map((b) => ({ ...b, commission_cents: Math.round((b.revenue * b.commission_pct) / 100) })),
  };
}, 'shop');

/* -------------------------- Configurações -------------------------- */

const EDITABLE_SETTINGS = [
  'shop_name', 'shop_phone', 'shop_address', 'slot_interval', 'min_advance_min', 'max_days_ahead',
  'cancel_limit_hours', 'max_active_per_phone', 'block_after_no_shows', 'reminder_template',
] as const;

route('GET', '/api/admin/settings', async ({ shopId }) => {
  const s = await getSettings(shopId);
  return Object.fromEntries(EDITABLE_SETTINGS.map((k) => [k, s[k]]));
}, 'shop');

route('PUT', '/api/admin/settings', async ({ shopId, body }) => {
  if (body.shop_name !== undefined && !str(body.shop_name)) throw new HttpError(400, 'Informe o nome da barbearia.');
  await tx(async () => {
    for (const k of EDITABLE_SETTINGS) {
      if (body[k] === undefined) continue;
      await setSetting(shopId, k, k === 'shop_phone' ? normalizePhone(body[k]) : str(body[k], 1000));
    }
  });
  return { ok: true };
}, 'shop');
