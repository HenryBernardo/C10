// Login (todos os tipos de usuário) e área pública do cliente (agendamento e "Meu horário").
import { db } from '../db';
import { route } from './router';
import { login, logout, changePassword, ROLES, SESSION_DAYS, SESSION_COOKIE } from '../users';
import { limit } from '../ratelimit';
import { getSettings } from '../settings';
import { getShop, bookingPath } from '../c10';
import { publicLoyalty } from '../loyalty';
import { todayStr, fromMin } from '../time';
import { HttpError } from '../util';
import {
  availableSlots, createAppointment, getAppointment, getAppointmentByCode, cancelByClient, type ApptRow,
} from '../scheduling';
import type { Appointment, PublicAppointment } from '../../types';

export function serializeAppt(a: ApptRow, { full = false } = {}): Appointment {
  return {
    ...(full && { id: a.id }),
    code: a.code,
    date: a.date,
    start: fromMin(a.start_min)!,
    end: fromMin(a.end_min)!,
    start_min: a.start_min,
    end_min: a.end_min,
    status: a.status as Appointment['status'],
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
      source: a.source as Appointment['source'],
      payment: a.payment as Appointment['payment'],
      notes: a.notes,
      reminded: a.reminded,
      created_at: a.created_at,
    }),
  };
}

/** Agendamento para o cliente, com os dados da barbearia e o cartão fidelidade. */
async function publicAppt(a: ApptRow): Promise<PublicAppointment> {
  const shop = await getShop(a.shop_id);
  return {
    ...serializeAppt(a),
    shop_name: shop?.name,
    shop_phone: shop?.phone,
    booking_path: shop ? bookingPath(shop) : null,
    loyalty: (await publicLoyalty(a.shop_id, a.client_id)) as PublicAppointment['loyalty'],
  };
}

async function requireShop(id: string) {
  const shop = await getShop(Number(id));
  if (!shop) throw new HttpError(404, 'Agenda online não encontrada.');
  return shop;
}

const cookie = (value: string, maxAge: number) =>
  `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

/* ------------------------------ Login ------------------------------ */

route('POST', '/api/auth/login', async ({ body, ip, setCookies }) => {
  const { token, user } = await login(body.email, body.password, ip, typeof body.area === 'string' ? body.area : undefined);
  setCookies.push(cookie(token, 60 * 60 * 24 * SESSION_DAYS));
  return { role: user.role, redirect: user.role === 'shop' ? '/admin' : '/painel' };
});

route('POST', '/api/auth/logout', async ({ token, setCookies }) => {
  await logout(token);
  setCookies.push(cookie('', 0));
  return { ok: true };
});

route('GET', '/api/auth/me', async ({ user }) => {
  if (!user) return { authenticated: false };
  const out: Record<string, unknown> = { authenticated: true, user: { ...user, role_label: ROLES[user.role] } };
  if (user.role === 'shop' && user.business_id) {
    out.business = await db().business.findUnique({ where: { id: user.business_id }, select: { id: true, name: true, booking_enabled: true } });
  }
  return out;
});

route('PUT', '/api/auth/password', async ({ user, body }) => {
  await changePassword(user.id, body.current, body.next);
  return { ok: true };
}, 'user');

/* ------------------------- Área pública ------------------------- */

route('GET', '/api/public/shops/:shop/info', async ({ params }) => {
  const shop = await requireShop(params.shop);
  const s = await getSettings(shop.id);
  const barbers = (await db().barber.findMany({
    where: { shop_id: shop.id, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, hours: { select: { weekday: true } } },
  })).map(({ hours, ...b }) => ({ ...b, weekdays: hours.map((h) => h.weekday) }));
  return {
    settings: {
      shop_name: s.shop_name,
      shop_phone: s.shop_phone,
      shop_address: [s.shop_address, s.shop_neighborhood].filter(Boolean).join(' - '),
      max_days_ahead: Number(s.max_days_ahead),
      cancel_limit_hours: Number(s.cancel_limit_hours),
    },
    today: todayStr(),
    page_path: `/${shop.city_slug}/${shop.slug}`,
    city_name: shop.city_name,
    services: await db().service.findMany({
      where: { shop_id: shop.id, active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, description: true, duration_min: true, price_cents: true },
    }),
    barbers,
    loyalty: await publicLoyalty(shop.id),
  };
});

route('GET', '/api/public/shops/:shop/availability', async ({ params, query }) => {
  const shop = await requireShop(params.shop);
  const slots = await availableSlots({
    shopId: shop.id,
    serviceId: Number(query.get('service')),
    barberId: Number(query.get('barber')) || null,
    date: query.get('date'),
  });
  return slots.map((s) => ({ time: fromMin(s.start), start: s.start, barbers: s.barbers }));
});

route('POST', '/api/public/shops/:shop/appointments', async ({ params, body, ip }) => {
  // Evita robôs enchendo a agenda: no máximo 10 agendamentos por hora vindos do mesmo IP.
  await limit(`booking:${ip}`, { max: 10, windowMs: 60 * 60 * 1000, message: 'Muitos agendamentos seguidos.' });
  const shop = await requireShop(params.shop);
  return publicAppt(await createAppointment({
    shopId: shop.id,
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

route('GET', '/api/public/appointments/:code', async ({ params }) => {
  const appt = await getAppointmentByCode(params.code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  return publicAppt(appt);
});

route('POST', '/api/public/appointments/:code/cancel', async ({ params }) => publicAppt(await cancelByClient(params.code)));

route('POST', '/api/public/appointments/:code/confirm', async ({ params }) => {
  const appt = await getAppointmentByCode(params.code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  if (appt.status === 'scheduled') await db().appointment.update({ where: { id: appt.id }, data: { status: 'confirmed' } });
  return publicAppt((await getAppointment(appt.id))!);
});
