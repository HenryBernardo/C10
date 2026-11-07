// Regras da agenda: horários livres, reserva sem conflito, remarcação e cancelamento.
// Toda função recebe o shopId: cada barbearia tem barbeiros, serviços, clientes e agenda próprios.
import { db, tx, Prisma } from './db';
import { getSettings } from './settings';
import { HttpError, normalizePhone, newBookingCode } from './util';
import { todayStr, addDays, weekdayOf, nowAbsMin, absMin, isValidDate, toDbDate, fromDbDate } from './time';

type WorkDay = { start_min: number; end_min: number; break_start: number | null; break_end: number | null };

export const getWorkDay = (barberId: number, date: string) =>
  db().barberHour.findUnique({ where: { barber_id_weekday: { barber_id: barberId, weekday: weekdayOf(date) } } });

/** Intervalos ocupados do barbeiro no dia: agendamentos ativos, bloqueios e intervalo de almoço. */
export async function busyIntervals(barberId: number, date: string, excludeId = 0, day?: WorkDay | null) {
  const d = toDbDate(date);
  const [appts, blocks] = await Promise.all([
    db().appointment.findMany({
      where: { barber_id: barberId, date: d, status: { not: 'cancelled' }, id: { not: excludeId } },
      select: { start_min: true, end_min: true },
    }),
    db().block.findMany({
      where: {
        date_start: { lte: d },
        date_end: { gte: d },
        OR: [{ barber_id: barberId }, { barber_id: null, shop: { barbers: { some: { id: barberId } } } }],
      },
      select: { start_min: true, end_min: true },
    }),
  ]);
  const out: [number, number][] = [...appts, ...blocks].map((x) => [x.start_min, x.end_min]);
  const wd = day === undefined ? await getWorkDay(barberId, date) : day;
  if (wd && wd.break_start != null && wd.break_end != null) out.push([wd.break_start, wd.break_end]);
  return out;
}

const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && e1 > s2;

/** Motivo pelo qual o horário não está livre, ou null se estiver. */
export async function conflictReason(barberId: number, date: string, start: number, end: number, { excludeId = 0, ignoreHours = false } = {}) {
  if (!ignoreHours) {
    const day = await getWorkDay(barberId, date);
    if (!day) return 'O barbeiro não atende neste dia.';
    if (start < day.start_min || end > day.end_min) return 'Horário fora do expediente do barbeiro.';
  }
  for (const [s, e] of await busyIntervals(barberId, date, excludeId)) {
    if (overlaps(start, end, s, e)) return 'Já existe um agendamento ou bloqueio neste horário.';
  }
  return null;
}

export const getService = (shopId: number, id: number) => db().service.findFirst({ where: { id, shop_id: shopId } });
export const getBarber = (shopId: number, id: number) => db().barber.findFirst({ where: { id, shop_id: shopId } });

/**
 * Horários livres para um serviço numa data: [{ start, barbers: [ids] }].
 * Sem barberId, considera todos os barbeiros ativos.
 */
export async function availableSlots({ shopId, serviceId, barberId, date, enforcePublicRules = true, excludeId = 0 }:
  { shopId: number; serviceId: number; barberId?: number | null; date: unknown; enforcePublicRules?: boolean; excludeId?: number }) {
  const settings = await getSettings(shopId);
  const service = serviceId ? await getService(shopId, serviceId) : null;
  if (!service || !service.active) throw new HttpError(404, 'Serviço não encontrado.');
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');

  if (enforcePublicRules) {
    const today = todayStr();
    if (date < today || date > addDays(today, Number(settings.max_days_ahead))) return [];
  }

  const barbers = await db().barber.findMany({
    where: { shop_id: shopId, active: true, ...(barberId && { id: barberId }) },
    select: { id: true, hours: { where: { weekday: weekdayOf(date) } } },
  });

  const step = Math.max(5, Number(settings.slot_interval) || 15);
  const earliest = nowAbsMin() + (enforcePublicRules ? Number(settings.min_advance_min) : 0);
  const slots = new Map<number, number[]>();

  for (const { id, hours: [day] } of barbers) {
    if (!day) continue;
    const busy = await busyIntervals(id, date, excludeId, day);
    for (let t = day.start_min; t + service.duration_min <= day.end_min; t += step) {
      if (absMin(date, t) < earliest) continue;
      const end = t + service.duration_min;
      if (busy.some(([s, e]) => overlaps(t, end, s, e))) continue;
      if (!slots.has(t)) slots.set(t, []);
      slots.get(t)!.push(id);
    }
  }
  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([start, ids]) => ({ start, barbers: ids }));
}

async function findOrCreateClient(shopId: number, name: string, phone: string) {
  const existing = await db().client.findUnique({ where: { shop_id_phone: { shop_id: shopId, phone } } });
  if (existing) {
    if (name && name !== existing.name) await db().client.update({ where: { id: existing.id }, data: { name } });
    return existing;
  }
  return db().client.create({ data: { shop_id: shopId, name, phone } });
}

/** Barbeiro menos ocupado no dia entre os candidatos — distribui a agenda de forma justa. */
async function pickBarber(candidates: number[], date: string) {
  const rows = await db().appointment.groupBy({
    by: ['barber_id'],
    where: { barber_id: { in: candidates }, date: toDbDate(date), status: { not: 'cancelled' } },
    _count: { _all: true },
  });
  const count = (id: number) => rows.find((r) => r.barber_id === id)?._count._all ?? 0;
  return [...candidates].sort((a, b) => count(a) - count(b))[0];
}

/** Trava por barbearia até o fim da transação: duas reservas simultâneas não pegam o mesmo horário. */
const lockShop = (shopId: number) => db().$executeRaw`SELECT pg_advisory_xact_lock(${shopId}::bigint)`;

/** Cria um agendamento (checagem e gravação numa transação com trava por barbearia). */
export async function createAppointment(input: {
  shopId: number; serviceId: number; barberId: number | null; date: unknown; start: unknown;
  name: unknown; phone: unknown; notes?: unknown; source?: 'online' | 'admin'; force?: boolean;
}) {
  const { shopId, serviceId, source = 'online', force = false } = input;
  let barberId = input.barberId;
  const settings = await getSettings(shopId);
  const isPublic = source === 'online';
  const name = String(input.name ?? '').trim().slice(0, 80);
  const phone = normalizePhone(input.phone);
  if (!name) throw new HttpError(400, 'Informe o nome.');
  if (phone.length < 12) throw new HttpError(400, 'Informe um telefone válido com DDD.');
  if (!isValidDate(input.date)) throw new HttpError(400, 'Data inválida.');
  const date = input.date;
  const start = Number(input.start);
  if (!Number.isInteger(start) || start < 0 || start >= 1440) throw new HttpError(400, 'Horário inválido.');

  return tx(async () => {
    await lockShop(shopId);
    const service = serviceId ? await getService(shopId, serviceId) : null;
    if (!service || !service.active) throw new HttpError(404, 'Serviço não encontrado.');
    const end = start + service.duration_min;
    const client = await findOrCreateClient(shopId, name, phone);

    if (isPublic) {
      if (client.blocked) throw new HttpError(403, 'Não foi possível agendar online. Entre em contato com a barbearia pelo WhatsApp.');
      const noShows = await db().appointment.count({ where: { client_id: client.id, status: 'no_show' } });
      if (noShows >= Number(settings.block_after_no_shows)) {
        throw new HttpError(403, 'Identificamos faltas anteriores sem aviso. Para agendar, fale com a barbearia pelo WhatsApp.');
      }
      const active = await db().appointment.count({
        where: { client_id: client.id, status: { in: ['scheduled', 'confirmed'] }, date: { gte: toDbDate(todayStr()) } },
      });
      if (active >= Number(settings.max_active_per_phone)) {
        throw new HttpError(409, `Você já tem ${active} horário(s) marcado(s). Cancele um antes de marcar outro.`);
      }
      const slot = (await availableSlots({ shopId, serviceId, barberId, date })).find((s) => s.start === start);
      if (!slot) throw new HttpError(409, 'Este horário acabou de ser ocupado. Escolha outro, por favor.');
      barberId = barberId || (await pickBarber(slot.barbers, date));
    } else {
      if (!barberId || !(await getBarber(shopId, barberId))) throw new HttpError(400, 'Escolha o barbeiro.');
      const reason = await conflictReason(barberId, date, start, end, { ignoreHours: force });
      if (reason && !(force && !reason.startsWith('Já existe'))) throw new HttpError(409, reason);
    }

    let code: string;
    do code = newBookingCode();
    while (await db().appointment.findUnique({ where: { code } }));

    const created = await db().appointment.create({
      data: {
        shop_id: shopId, code, barber_id: barberId!, service_id: service.id, client_id: client.id, date: toDbDate(date),
        start_min: start, end_min: end, price_cents: service.price_cents, status: isPublic ? 'scheduled' : 'confirmed', source,
        notes: String(input.notes ?? '').trim().slice(0, 300) || null,
      },
      include: APPT_INCLUDE,
    });
    return toApptRow(created);
  });
}

/* ------------------------ Leitura de agendamentos ------------------------ */

const APPT_INCLUDE = {
  service: { select: { name: true, duration_min: true } },
  barber: { select: { name: true, color: true } },
  client: { select: { name: true, phone: true } },
} as const;

type ApptWithRelations = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

/** Agendamento "achatado" (como nas telas): data em texto e nomes do serviço, barbeiro e cliente. */
export interface ApptRow {
  id: number; shop_id: number; code: string; barber_id: number; service_id: number; client_id: number; date: string;
  start_min: number; end_min: number; price_cents: number; status: string; source: string; payment: string | null;
  notes: string | null; reminded: boolean; created_at: string; service_name: string; duration_min: number;
  barber_name: string; barber_color: string; client_name: string; client_phone: string;
}

const toApptRow = ({ service, barber, client, date, created_at, ...a }: ApptWithRelations): ApptRow => ({
  ...a,
  date: fromDbDate(date),
  created_at: created_at.toISOString(),
  service_name: service.name,
  duration_min: service.duration_min,
  barber_name: barber.name,
  barber_color: barber.color,
  client_name: client.name,
  client_phone: client.phone,
});

export async function getAppointment(id: number, shopId?: number) {
  const a = await db().appointment.findUnique({ where: { id }, include: APPT_INCLUDE });
  return a && (shopId == null || a.shop_id === shopId) ? toApptRow(a) : undefined;
}

export async function getAppointmentByCode(code: unknown) {
  const a = await db().appointment.findUnique({ where: { code: String(code ?? '').toUpperCase() }, include: APPT_INCLUDE });
  return a ? toApptRow(a) : undefined;
}

export async function listAppointments(f: { shopId: number; date?: string; dateFrom?: string; dateTo?: string; barberId?: number; clientId?: number }) {
  const rows = await db().appointment.findMany({
    where: {
      shop_id: f.shopId,
      ...(f.date && { date: toDbDate(f.date) }),
      ...((f.dateFrom || f.dateTo) && { date: { ...(f.dateFrom && { gte: toDbDate(f.dateFrom) }), ...(f.dateTo && { lte: toDbDate(f.dateTo) }) } }),
      ...(f.barberId && { barber_id: f.barberId }),
      ...(f.clientId && { client_id: f.clientId }),
    },
    include: APPT_INCLUDE,
    orderBy: [{ date: 'asc' }, { start_min: 'asc' }],
  });
  return rows.map(toApptRow);
}

/** Remarca (data/hora/barbeiro/serviço) checando conflito. */
export async function rescheduleAppointment(shopId: number, id: number, p: { date?: unknown; start?: number | null; barberId?: number | null; serviceId?: number | null; force?: boolean }) {
  return tx(async () => {
    await lockShop(shopId);
    const appt = await getAppointment(id, shopId);
    if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
    const service = await getService(shopId, p.serviceId || appt.service_id);
    if (!service) throw new HttpError(404, 'Serviço não encontrado.');
    const newDate = p.date || appt.date;
    if (!isValidDate(newDate)) throw new HttpError(400, 'Data inválida.');
    const newStart = p.start != null ? Number(p.start) : appt.start_min;
    const newBarber = p.barberId || appt.barber_id;
    if (!(await getBarber(shopId, newBarber))) throw new HttpError(400, 'Barbeiro inválido.');
    const newEnd = newStart + service.duration_min;

    const reason = await conflictReason(newBarber, newDate, newStart, newEnd, { excludeId: id, ignoreHours: p.force });
    if (reason && !(p.force && !reason.startsWith('Já existe'))) throw new HttpError(409, reason);

    await db().appointment.update({
      where: { id },
      data: {
        date: toDbDate(newDate), start_min: newStart, end_min: newEnd, barber_id: newBarber, service_id: service.id,
        price_cents: service.id !== appt.service_id ? service.price_cents : appt.price_cents, reminded: false,
      },
    });
    return (await getAppointment(id))!;
  });
}

/** Cancelamento pelo próprio cliente, respeitando o prazo mínimo. */
export async function cancelByClient(code: unknown) {
  const appt = await getAppointmentByCode(code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  if (!['scheduled', 'confirmed'].includes(appt.status)) throw new HttpError(409, 'Este agendamento não pode mais ser cancelado.');
  const limitH = Number((await getSettings(appt.shop_id)).cancel_limit_hours);
  if (absMin(appt.date, appt.start_min) - nowAbsMin() < limitH * 60) {
    throw new HttpError(409, `Cancelamentos online só até ${limitH}h antes. Fale com a barbearia pelo WhatsApp.`);
  }
  await db().appointment.update({ where: { id: appt.id }, data: { status: 'cancelled' } });
  return (await getAppointment(appt.id))!;
}
