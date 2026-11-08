// API do painel do Cidade 10: admin geral (todas as cidades) e admin da cidade (só a dele).
import { db, tx } from '../db';
import { route } from './router';
import { createUser, setPassword, cityScope, ROLES } from '../users';
import { uniqueSlug } from '../c10';
import { ONLY_CITY, cityWhere } from '../../cities';
import { HttpError, normalizePhone, slugify, str } from '../util';
import { todayStr, addDays, toDbDate } from '../time';
import type { Role, SessionUser } from '../../types';

async function businessInScope(user: SessionUser, id: number) {
  const b = await db().business.findFirst({ where: { id, city: cityWhere } });
  if (!b) throw new HttpError(404, 'Comércio não encontrado.');
  if (user.role === 'city' && b.city_id !== user.city_id) throw new HttpError(403, 'Este comércio é de outra cidade.');
  return b;
}

route('GET', '/api/panel/context', async ({ user }) => ({
  user: { id: user.id, name: user.name, email: user.email, role: user.role, role_label: ROLES[user.role], city_id: user.city_id },
  cities: await db().city.findMany({ where: { ...cityWhere, ...(user.role === 'super' ? {} : { id: user.city_id ?? -1 }) }, orderBy: { name: 'asc' } }),
  categories: await db().category.findMany({ orderBy: { sort: 'asc' } }),
}), 'panel');

/* ----------------------------- Visão geral ----------------------------- */

route('GET', '/api/panel/overview', async ({ user, query }) => {
  const cityId = await cityScope(user, query.get('city'));
  const from = toDbDate(addDays(todayStr(), -29));
  const to = toDbDate(todayStr());
  const inCity = { city_id: cityId };
  const lastMonth = { date: { gte: from, lte: to }, status: { not: 'cancelled' } };

  const [total, active, featured, booking, leads, appts, revenue, categories, shops] = await Promise.all([
    db().business.count({ where: inCity }),
    db().business.count({ where: { ...inCity, active: true } }),
    db().business.count({ where: { ...inCity, active: true, featured: true } }),
    db().business.count({ where: { ...inCity, active: true, booking_enabled: true } }),
    db().lead.count({ where: { ...inCity, status: 'novo' } }),
    db().appointment.count({ where: { ...lastMonth, shop: inCity } }),
    db().appointment.aggregate({ where: { ...lastMonth, status: 'done', shop: inCity }, _sum: { price_cents: true } }),
    db().category.findMany({
      orderBy: { sort: 'asc' },
      select: { name: true, icon: true, _count: { select: { businesses: { where: { ...inCity, active: true } } } } },
    }),
    db().business.findMany({
      where: { ...inCity, booking_enabled: true },
      select: { id: true, name: true, _count: { select: { appointments: { where: lastMonth } } } },
    }),
  ]);
  return {
    counts: { total, active, featured, booking },
    leads,
    appts: { n: appts, revenue: revenue._sum.price_cents ?? 0 },
    byCategory: categories.map((c) => ({ name: c.name, icon: c.icon, n: c._count.businesses })).sort((a, b) => b.n - a.n),
    shops: shops.map((s) => ({ id: s.id, name: s.name, appts: s._count.appointments })).sort((a, b) => b.appts - a.appts),
  };
}, 'panel');

/* ------------------------------ Comércios ------------------------------ */

route('GET', '/api/panel/businesses', async ({ user, query }) => {
  const cityId = await cityScope(user, query.get('city'));
  const q = (query.get('q') || '').trim();
  const like = { contains: q, mode: 'insensitive' as const };
  const rows = await db().business.findMany({
    where: {
      city_id: cityId,
      ...(q && { OR: [{ name: like }, { neighborhood: like }] }),
      ...(query.get('category') && { category_id: Number(query.get('category')) }),
    },
    include: {
      category: true,
      city: { select: { slug: true } },
      users: { where: { active: true }, select: { email: true } },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return rows.map(({ category, city, users, ...b }) => ({
    ...b,
    category_name: category.name, category_icon: category.icon, category_color: category.color, category_slug: category.slug,
    city_slug: city.slug,
    owners: users.map((u) => u.email).join(', ') || null,
  }));
}, 'panel');

async function validateBusiness(body: Record<string, unknown>) {
  const name = str(body.name, 100);
  if (!name) throw new HttpError(400, 'Informe o nome do comércio.');
  const categoryId = Number(body.category_id);
  if (!categoryId || !(await db().category.findUnique({ where: { id: categoryId } }))) throw new HttpError(400, 'Escolha a categoria.');
  const phone = normalizePhone(body.phone);
  if (phone && phone.length < 12) throw new HttpError(400, 'WhatsApp inválido. Use DDD + número.');
  const hours: Record<string, [string, string]> = {};
  for (const [d, v] of Object.entries((body.hours as Record<string, unknown>) || {})) {
    const ok = Number(d) >= 0 && Number(d) <= 6 && Array.isArray(v) && v.length === 2
      && v.every((t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t)) && v[0] < v[1];
    if (!ok) throw new HttpError(400, 'Horário de funcionamento inválido.');
    hours[d] = v as [string, string];
  }
  return {
    name,
    category_id: categoryId,
    description: str(body.description, 500) || null,
    address: str(body.address, 150) || null,
    neighborhood: str(body.neighborhood, 80) || null,
    phone: phone || null,
    instagram: str(body.instagram, 100).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || null,
    hours,
    booking_enabled: !!body.booking_enabled,
    featured: !!body.featured,
    active: body.active !== false,
  };
}

route('POST', '/api/panel/businesses', async ({ user, body }) => {
  const cityId = await cityScope(user, body.city_id);
  const data = await validateBusiness(body);
  return tx(async () => {
    const created = await db().business.create({ data: { ...data, city_id: cityId, slug: await uniqueSlug(cityId, data.name) } });
    if (body.lead_id) await db().lead.updateMany({ where: { id: Number(body.lead_id), city_id: cityId }, data: { status: 'cadastrado' } });
    return { id: created.id };
  });
}, 'panel');

route('PUT', '/api/panel/businesses/:id', async ({ user, params, body }) => {
  const current = await businessInScope(user, Number(params.id));
  const data = await validateBusiness(body);
  // O slug (endereço da página) só muda se o nome mudar, para não quebrar links divulgados à toa.
  const slug = slugify(data.name) === slugify(current.name) ? current.slug : await uniqueSlug(current.city_id, data.name, current.id);
  await db().business.update({ where: { id: current.id }, data: { ...data, slug } });
  return { ok: true, slug };
}, 'panel');

/* --------------------------- Pedidos de cadastro --------------------------- */

route('GET', '/api/panel/leads', async ({ user, query }) => {
  // Admin geral vê também pedidos de cidades que ainda não existem no Cidade 10.
  const all = !ONLY_CITY && user.role === 'super' && query.get('city') === 'all';
  const cityId = all ? undefined : await cityScope(user, query.get('city'));
  const rows = await db().lead.findMany({
    where: all ? {} : { city_id: cityId },
    include: { city: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: { id: 'desc' },
  });
  return rows.map(({ city, category, ...l }) => ({ ...l, city_name: city?.name ?? null, category_name: category?.name ?? null }));
}, 'panel');

const LEAD_STATUS = ['novo', 'contatado', 'cadastrado', 'descartado'];
route('PATCH', '/api/panel/leads/:id', async ({ user, params, body }) => {
  if (!LEAD_STATUS.includes(body.status)) throw new HttpError(400, 'Status inválido.');
  const lead = await db().lead.findUnique({ where: { id: Number(params.id) }, select: { city_id: true } });
  if (!lead) throw new HttpError(404, 'Pedido não encontrado.');
  if (user.role === 'city' && lead.city_id !== user.city_id) throw new HttpError(403, 'Pedido de outra cidade.');
  await db().lead.update({ where: { id: Number(params.id) }, data: { status: body.status } });
  return { ok: true };
}, 'panel');

/* ------------------------------- Usuários ------------------------------- */

route('GET', '/api/panel/users', async ({ user }) => {
  const rows = await db().user.findMany({
    where: user.role === 'super'
      ? (ONLY_CITY ? { OR: [{ role: 'super' }, { city: cityWhere }, { business: { city: cityWhere } }] } : {})
      : { role: 'shop', business: { city_id: user.city_id ?? -1 } },
    select: {
      id: true, name: true, email: true, role: true, city_id: true, business_id: true, active: true, created_at: true,
      city: { select: { name: true } },
      business: { select: { name: true, city_id: true, booking_enabled: true } },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return rows.map(({ city, business, ...u }) => ({
    ...u,
    city_name: city?.name ?? null,
    business_name: business?.name ?? null,
    business_city_id: business?.city_id ?? null,
    booking_enabled: business?.booking_enabled ?? null,
  }));
}, 'panel');

async function checkUserScope(actor: SessionUser, target: { role: string; business_id: number | null }) {
  if (actor.role === 'super') return;
  // Admin da cidade só gerencia donos de comércios da cidade dele.
  if (target.role !== 'shop') throw new HttpError(403, 'Você só pode gerenciar acessos de comércios.');
  const biz = target.business_id ? await db().business.findUnique({ where: { id: target.business_id }, select: { city_id: true } }) : null;
  if (!biz || biz.city_id !== actor.city_id) throw new HttpError(403, 'Comércio de outra cidade.');
}

route('POST', '/api/panel/users', async ({ user, body }) => {
  const role = body.role as Role;
  const target = {
    role,
    city_id: role === 'city' ? Number(body.city_id) || null : null,
    business_id: role === 'shop' ? Number(body.business_id) || null : null,
  };
  await checkUserScope(user, target);
  if (role === 'city' && !(target.city_id && (await db().city.findFirst({ where: { id: target.city_id, ...cityWhere } })))) throw new HttpError(400, 'Escolha a cidade.');
  if (role === 'shop' && !(target.business_id && (await db().business.findFirst({ where: { id: target.business_id, city: cityWhere } })))) throw new HttpError(400, 'Escolha o comércio.');
  const id = await createUser({ name: body.name, email: body.email, password: body.password, role, cityId: target.city_id, businessId: target.business_id });
  return { id };
}, 'panel');

route('PUT', '/api/panel/users/:id', async ({ user, params, body }) => {
  const id = Number(params.id);
  const target = await db().user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'Usuário não encontrado.');
  await checkUserScope(user, target);
  if (id === user.id && body.active === false) throw new HttpError(400, 'Você não pode desativar o próprio acesso.');
  const name = str(body.name ?? target.name, 80);
  if (!name) throw new HttpError(400, 'Informe o nome.');
  await tx(async () => {
    await db().user.update({ where: { id }, data: { name, active: body.active !== false } });
    if (body.active === false) await db().session.deleteMany({ where: { user_id: id } });
    if (body.password) await setPassword(id, body.password);
  });
  return { ok: true };
}, 'panel');

/* -------------------------------- Cidades -------------------------------- */

function validateCity(body: Record<string, unknown>) {
  const name = str(body.name, 80);
  const state = str(body.state, 2).toUpperCase();
  if (!name || !/^[A-Z]{2}$/.test(state)) throw new HttpError(400, 'Informe o nome e a UF (ex.: PR).');
  return {
    name,
    state,
    color: /^#[0-9a-f]{6}$/i.test(String(body.color ?? '')) ? String(body.color) : '#0f766e',
    tagline: str(body.tagline, 120) || `Tudo de ${name} em um só lugar`,
    description: str(body.description, 300) || null,
    active: body.active !== false,
  };
}

route('POST', '/api/panel/cities', async ({ body }) => {
  const data = validateCity(body);
  const slug = slugify(data.name);
  if (await db().city.findUnique({ where: { slug } })) throw new HttpError(409, 'Esta cidade já existe.');
  const created = await db().city.create({ data: { ...data, slug } });
  return { id: created.id, slug };
}, 'super');

route('PUT', '/api/panel/cities/:id', async ({ params, body }) => {
  // O slug da cidade não muda: é o endereço que já foi divulgado.
  const r = await db().city.updateMany({ where: { id: Number(params.id) }, data: validateCity(body) });
  if (!r.count) throw new HttpError(404, 'Cidade não encontrada.');
  return { ok: true };
}, 'super');
