import { db, getSettings, tx } from './db.js';
import { newBookingCode } from './auth.js';
import { todayStr, addDays, weekdayOf, nowAbsMin, absMin, isValidDate } from './time.js';

// Toda função recebe o shopId: cada barbearia tem barbeiros, serviços,
// clientes e agenda próprios.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Mantém só dígitos e garante o DDI 55 para números brasileiros (10 ou 11 dígitos). */
export function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

export function getWorkDay(barberId, date) {
  return db
    .prepare('SELECT start_min, end_min, break_start, break_end FROM barber_hours WHERE barber_id = ? AND weekday = ?')
    .get(barberId, weekdayOf(date));
}

/** Intervalos ocupados do barbeiro no dia: agendamentos ativos, bloqueios e intervalo de almoço. */
export function busyIntervals(barberId, date, excludeAppointmentId = 0) {
  const out = [];
  const appts = db
    .prepare(`SELECT start_min, end_min FROM appointments
              WHERE barber_id = ? AND date = ? AND status NOT IN ('cancelled') AND id != ?`)
    .all(barberId, date, excludeAppointmentId);
  for (const a of appts) out.push([a.start_min, a.end_min]);

  const blocks = db
    .prepare(`SELECT bl.start_min, bl.end_min FROM blocks bl JOIN barbers b ON b.id = ?
              WHERE (bl.barber_id = b.id OR (bl.barber_id IS NULL AND bl.shop_id = b.shop_id))
                AND bl.date_start <= ? AND bl.date_end >= ?`)
    .all(barberId, date, date);
  for (const b of blocks) out.push([b.start_min, b.end_min]);

  const day = getWorkDay(barberId, date);
  if (day && day.break_start != null && day.break_end != null) out.push([day.break_start, day.break_end]);
  return out;
}

const overlaps = (s1, e1, s2, e2) => s1 < e2 && e1 > s2;

/** Motivo pelo qual o horário não está livre, ou null se estiver. */
export function conflictReason(barberId, date, start, end, { excludeId = 0, ignoreHours = false } = {}) {
  if (!ignoreHours) {
    const day = getWorkDay(barberId, date);
    if (!day) return 'O barbeiro não atende neste dia.';
    if (start < day.start_min || end > day.end_min) return 'Horário fora do expediente do barbeiro.';
  }
  for (const [s, e] of busyIntervals(barberId, date, excludeId)) {
    if (overlaps(start, end, s, e)) return 'Já existe um agendamento ou bloqueio neste horário.';
  }
  return null;
}

export const getService = (shopId, id) => db.prepare('SELECT * FROM services WHERE id = ? AND shop_id = ?').get(id, shopId);
export const getBarber = (shopId, id) => db.prepare('SELECT * FROM barbers WHERE id = ? AND shop_id = ?').get(id, shopId);

/**
 * Horários livres para um serviço numa data.
 * Retorna [{ start, barbers: [ids] }] — com barberId nulo, considera todos os barbeiros ativos.
 */
export function availableSlots({ shopId, serviceId, barberId, date, enforcePublicRules = true, excludeId = 0 }) {
  const settings = getSettings(shopId);
  const service = getService(shopId, serviceId);
  if (!service || !service.active) throw new HttpError(404, 'Serviço não encontrado.');
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');

  if (enforcePublicRules) {
    const today = todayStr();
    if (date < today || date > addDays(today, Number(settings.max_days_ahead))) return [];
  }

  const barbers = barberId
    ? db.prepare('SELECT id FROM barbers WHERE id = ? AND shop_id = ? AND active = 1').all(barberId, shopId)
    : db.prepare('SELECT id FROM barbers WHERE shop_id = ? AND active = 1').all(shopId);

  const step = Math.max(5, Number(settings.slot_interval) || 15);
  const earliest = nowAbsMin() + (enforcePublicRules ? Number(settings.min_advance_min) : 0);
  const slots = new Map();

  for (const { id } of barbers) {
    const day = getWorkDay(id, date);
    if (!day) continue;
    const busy = busyIntervals(id, date, excludeId);
    for (let t = day.start_min; t + service.duration_min <= day.end_min; t += step) {
      if (absMin(date, t) < earliest) continue;
      const end = t + service.duration_min;
      if (busy.some(([s, e]) => overlaps(t, end, s, e))) continue;
      if (!slots.has(t)) slots.set(t, []);
      slots.get(t).push(id);
    }
  }
  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([start, ids]) => ({ start, barbers: ids }));
}

export function findOrCreateClient(shopId, name, phone) {
  const existing = db.prepare('SELECT * FROM clients WHERE shop_id = ? AND phone = ?').get(shopId, phone);
  if (existing) {
    if (name && name !== existing.name) db.prepare('UPDATE clients SET name = ? WHERE id = ?').run(name, existing.id);
    return { ...existing, name: name || existing.name };
  }
  const r = db.prepare('INSERT INTO clients (shop_id, name, phone) VALUES (?, ?, ?)').run(shopId, name, phone);
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(r.lastInsertRowid);
}

/** Barbeiro menos ocupado no dia entre os candidatos — distribui a agenda de forma justa. */
function pickBarber(candidates, date) {
  let best = null;
  let bestCount = Infinity;
  for (const id of candidates) {
    const { n } = db
      .prepare(`SELECT COUNT(*) AS n FROM appointments WHERE barber_id = ? AND date = ? AND status != 'cancelled'`)
      .get(id, date);
    if (n < bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Cria um agendamento. Toda a checagem roda dentro de uma transação para
 * evitar que dois clientes reservem o mesmo horário ao mesmo tempo.
 */
export function createAppointment({ shopId, serviceId, barberId, date, start, name, phone, notes, source = 'online', force = false }) {
  const settings = getSettings(shopId);
  const isPublic = source === 'online';
  name = String(name || '').trim();
  phone = normalizePhone(phone);
  if (!name) throw new HttpError(400, 'Informe o nome.');
  if (phone.length < 12) throw new HttpError(400, 'Informe um telefone válido com DDD.');
  if (!isValidDate(date)) throw new HttpError(400, 'Data inválida.');
  start = Number(start);
  if (!Number.isInteger(start) || start < 0 || start >= 1440) throw new HttpError(400, 'Horário inválido.');

  return tx(() => {
    const service = getService(shopId, serviceId);
    if (!service || !service.active) throw new HttpError(404, 'Serviço não encontrado.');
    const end = start + service.duration_min;

    const client = findOrCreateClient(shopId, name, phone);

    if (isPublic) {
      if (client.blocked) {
        throw new HttpError(403, 'Não foi possível agendar online. Entre em contato com a barbearia pelo WhatsApp.');
      }
      const { noShows } = db
        .prepare(`SELECT COUNT(*) AS noShows FROM appointments WHERE client_id = ? AND status = 'no_show'`)
        .get(client.id);
      if (noShows >= Number(settings.block_after_no_shows)) {
        throw new HttpError(403, 'Identificamos faltas anteriores sem aviso. Para agendar, fale com a barbearia pelo WhatsApp.');
      }
      const { active } = db
        .prepare(`SELECT COUNT(*) AS active FROM appointments
                  WHERE client_id = ? AND status IN ('scheduled', 'confirmed') AND date >= ?`)
        .get(client.id, todayStr());
      if (active >= Number(settings.max_active_per_phone)) {
        throw new HttpError(409, `Você já tem ${active} horário(s) marcado(s). Cancele um antes de marcar outro.`);
      }
      const slot = availableSlots({ shopId, serviceId, barberId, date }).find((s) => s.start === start);
      if (!slot) throw new HttpError(409, 'Este horário acabou de ser ocupado. Escolha outro, por favor.');
      barberId = barberId || pickBarber(slot.barbers, date);
    } else {
      if (!barberId || !getBarber(shopId, barberId)) throw new HttpError(400, 'Escolha o barbeiro.');
      const reason = conflictReason(barberId, date, start, end, { ignoreHours: force });
      if (reason && !(force && !reason.startsWith('Já existe'))) throw new HttpError(409, reason);
    }

    let code;
    do code = newBookingCode();
    while (db.prepare('SELECT 1 FROM appointments WHERE code = ?').get(code));

    const r = db
      .prepare(`INSERT INTO appointments
        (shop_id, code, barber_id, service_id, client_id, date, start_min, end_min, price_cents, status, source, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(shopId, code, barberId, service.id, client.id, date, start, end, service.price_cents,
        isPublic ? 'scheduled' : 'confirmed', source, notes || null);
    return getAppointment(Number(r.lastInsertRowid));
  });
}

const APPT_SELECT = `
  SELECT a.*, s.name AS service_name, s.duration_min, b.name AS barber_name, b.color AS barber_color,
         c.name AS client_name, c.phone AS client_phone
  FROM appointments a
  JOIN services s ON s.id = a.service_id
  JOIN barbers b ON b.id = a.barber_id
  JOIN clients c ON c.id = a.client_id`;

export function getAppointment(id, shopId) {
  const a = db.prepare(`${APPT_SELECT} WHERE a.id = ?`).get(id);
  return a && (shopId == null || a.shop_id === shopId) ? a : undefined;
}

export function getAppointmentByCode(code) {
  return db.prepare(`${APPT_SELECT} WHERE a.code = ?`).get(String(code || '').toUpperCase());
}

export function listAppointments({ shopId, date, dateFrom, dateTo, barberId, clientId }) {
  const where = ['a.shop_id = ?'];
  const params = [shopId];
  if (date) { where.push('a.date = ?'); params.push(date); }
  if (dateFrom) { where.push('a.date >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push('a.date <= ?'); params.push(dateTo); }
  if (barberId) { where.push('a.barber_id = ?'); params.push(barberId); }
  if (clientId) { where.push('a.client_id = ?'); params.push(clientId); }
  return db.prepare(`${APPT_SELECT} WHERE ${where.join(' AND ')} ORDER BY a.date, a.start_min`).all(...params);
}

/** Remarca (data/hora/barbeiro/serviço) checando conflito. */
export function rescheduleAppointment(shopId, id, { date, start, barberId, serviceId, force = false }) {
  return tx(() => {
    const appt = getAppointment(id, shopId);
    if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
    const service = getService(shopId, serviceId || appt.service_id);
    if (!service) throw new HttpError(404, 'Serviço não encontrado.');
    const newDate = date || appt.date;
    const newStart = start != null ? Number(start) : appt.start_min;
    const newBarber = barberId || appt.barber_id;
    if (!getBarber(shopId, newBarber)) throw new HttpError(400, 'Barbeiro inválido.');
    const newEnd = newStart + service.duration_min;
    if (!isValidDate(newDate)) throw new HttpError(400, 'Data inválida.');

    const reason = conflictReason(newBarber, newDate, newStart, newEnd, { excludeId: id, ignoreHours: force });
    if (reason && !(force && !reason.startsWith('Já existe'))) throw new HttpError(409, reason);

    const priceChanged = service.id !== appt.service_id;
    db.prepare(`UPDATE appointments SET date = ?, start_min = ?, end_min = ?, barber_id = ?, service_id = ?,
                price_cents = ?, reminded = 0 WHERE id = ?`)
      .run(newDate, newStart, newEnd, newBarber, service.id, priceChanged ? service.price_cents : appt.price_cents, id);
    return getAppointment(id);
  });
}

/** Cancelamento pelo próprio cliente, respeitando o prazo mínimo. */
export function cancelByClient(code) {
  const appt = getAppointmentByCode(code);
  if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
  if (!['scheduled', 'confirmed'].includes(appt.status)) throw new HttpError(409, 'Este agendamento não pode mais ser cancelado.');
  const limitH = Number(getSettings(appt.shop_id).cancel_limit_hours);
  if (absMin(appt.date, appt.start_min) - nowAbsMin() < limitH * 60) {
    throw new HttpError(409, `Cancelamentos online só até ${limitH}h antes. Fale com a barbearia pelo WhatsApp.`);
  }
  db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(appt.id);
  return getAppointment(appt.id);
}
