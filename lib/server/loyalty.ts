// Cartão fidelidade: a cada N atendimentos concluídos o cliente ganha um prêmio.
//
// Os selos não ficam gravados: são os atendimentos concluídos que contam pelas regras atuais,
// feitos depois do último prêmio usado. Ao usar um prêmio, grava-se quantos selos sobraram
// (quem tinha 12 num cartão de 10 fica com 2). Ajustes à mão entram como lançamentos 'adjust'.
import { db, tx, Prisma, TIME_ZONE } from './db';
import { getSettings, setSetting, type ShopSettings } from './settings';
import { todayStr, addDays, isValidDate, localDateTime } from './time';
import { HttpError } from './util';
import type { LoyaltyCard, LoyaltyConfig } from '../types';

const REWARD_TYPES = ['service', 'percent', 'other'] as const;
const intIn = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function loyaltyConfig(shopId: number, s?: ShopSettings): Promise<LoyaltyConfig> {
  s ??= await getSettings(shopId);
  const services = await db().service.findMany({ where: { shop_id: shopId }, select: { id: true, name: true } });
  const counted = String(s.loyalty_services || '').split(',').map(Number).filter((id) => services.some((x) => x.id === id));
  const type = (REWARD_TYPES as readonly string[]).includes(s.loyalty_reward_type) ? s.loyalty_reward_type as LoyaltyConfig['reward_type'] : 'service';
  const rewardService = services.find((x) => x.id === Number(s.loyalty_reward_service));
  const cfg = {
    enabled: s.loyalty_enabled === '1',
    goal: intIn(s.loyalty_goal, 2, 100, 10),
    services: counted,
    min_cents: intIn(s.loyalty_min_cents, 0, 1e7, 0),
    reward_type: type,
    reward_service: rewardService?.id ?? null,
    reward_percent: intIn(s.loyalty_reward_percent, 1, 100, 50),
    reward_text: String(s.loyalty_reward_text || '').trim(),
    expire_days: intIn(s.loyalty_expire_days, 0, 3650, 0),
    start: isValidDate(s.loyalty_start) ? s.loyalty_start : null,
    public: s.loyalty_public !== '0',
  };
  const reward_label =
    type === 'service' ? (rewardService ? `${rewardService.name} grátis` : 'um serviço grátis')
    : type === 'percent' ? `${cfg.reward_percent}% de desconto`
    : cfg.reward_text || 'um prêmio';
  const names = counted.map((id) => services.find((x) => x.id === id)!.name);
  return {
    ...cfg,
    reward_label,
    counts_label: names.length ? names.join(', ') : 'qualquer serviço',
    summary: `A cada ${cfg.goal} atendimentos, ganhe ${reward_label}.`,
  };
}

/** Selos de um cliente: { stamps, goal, available (prêmios), missing (para o próximo) }. */
export async function clientLoyalty(shopId: number, clientId: number, cfg?: LoyaltyConfig): Promise<LoyaltyCard> {
  cfg ??= await loyaltyConfig(shopId);
  const last = await db().loyaltyEntry.findFirst({
    where: { shop_id: shopId, client_id: clientId, kind: 'redeem' },
    orderBy: { id: 'desc' },
    select: { id: true, stamps: true, created_at: true },
  });
  const since = [cfg.start, cfg.expire_days ? addDays(todayStr(), -cfg.expire_days) : null].filter(Boolean).sort().pop() || '1900-01-01';
  const serviceFilter = cfg.services.length ? Prisma.sql`AND a.service_id IN (${Prisma.join(cfg.services)})` : Prisma.empty;
  // Atendimento conta se aconteceu (data + hora local) depois do último prêmio usado.
  const afterRedeem = last
    ? Prisma.sql`AND a.date + make_interval(mins => a.start_min) > (${last.created_at}::timestamptz AT TIME ZONE ${TIME_ZONE})`
    : Prisma.empty;
  const [{ n: earned }] = await db().$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM appointments a
    WHERE a.shop_id = ${shopId} AND a.client_id = ${clientId} AND a.status = 'done'
      AND a.price_cents >= ${cfg.min_cents} AND a.date >= ${since}::date
      ${serviceFilter} ${afterRedeem}
      AND NOT EXISTS (SELECT 1 FROM loyalty_entries le WHERE le.appointment_id = a.id) -- o atendimento grátis não vira selo`;
  const adjusted = await db().loyaltyEntry.aggregate({
    where: { shop_id: shopId, client_id: clientId, kind: 'adjust', id: { gt: last?.id ?? 0 } },
    _sum: { stamps: true },
  });
  const stamps = Math.max(0, (last?.stamps ?? 0) + earned + (adjusted._sum.stamps ?? 0));
  return {
    stamps,
    goal: cfg.goal,
    available: Math.floor(stamps / cfg.goal),
    missing: cfg.goal - (stamps % cfg.goal),
    reward_label: cfg.reward_label,
  };
}

/** Cartão para mostrar ao cliente (só se o programa estiver ativo e visível). */
export async function publicLoyalty(shopId: number, clientId?: number) {
  const cfg = await loyaltyConfig(shopId);
  if (!cfg.enabled || !cfg.public) return null;
  return { summary: cfg.summary, counts_label: cfg.counts_label, ...(clientId ? await clientLoyalty(shopId, clientId, cfg) : {}) };
}

/**
 * Usa um prêmio do cliente. Se vier o atendimento, o desconto já é aplicado no valor dele:
 * serviço grátis zera (ou abate o preço do serviço do prêmio); porcentagem desconta.
 */
export function redeem(shopId: number, clientId: number, appointmentId: number | null) {
  return tx(async () => {
    const cfg = await loyaltyConfig(shopId);
    const card = await clientLoyalty(shopId, clientId, cfg);
    if (card.available < 1) throw new HttpError(400, `Faltam ${card.missing} atendimento(s) para o prêmio.`);
    let apptId: number | null = null;
    if (appointmentId) {
      const appt = await db().appointment.findFirst({ where: { id: appointmentId, shop_id: shopId, client_id: clientId } });
      if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
      let price = appt.price_cents;
      if (cfg.reward_type === 'percent') price = Math.round((price * (100 - cfg.reward_percent)) / 100);
      if (cfg.reward_type === 'service') {
        const rewardPrice = !cfg.reward_service || appt.service_id === cfg.reward_service ? price
          : (await db().service.findUnique({ where: { id: cfg.reward_service } }))?.price_cents ?? 0;
        price = Math.max(0, price - rewardPrice);
      }
      const notes = [appt.notes, `🎁 Prêmio fidelidade: ${cfg.reward_label}`].filter(Boolean).join(' · ');
      await db().appointment.update({ where: { id: appt.id }, data: { price_cents: price, notes } });
      apptId = appt.id;
    }
    await db().loyaltyEntry.create({
      data: { shop_id: shopId, client_id: clientId, kind: 'redeem', stamps: card.stamps - cfg.goal, reward: cfg.reward_label, appointment_id: apptId },
    });
    return clientLoyalty(shopId, clientId, cfg);
  });
}

export async function adjust(shopId: number, clientId: number, stamps: unknown, note: string | null) {
  const n = Math.round(Number(stamps));
  if (!n || Math.abs(n) > 100) throw new HttpError(400, 'Informe quantos selos somar ou tirar.');
  await db().loyaltyEntry.create({ data: { shop_id: shopId, client_id: clientId, kind: 'adjust', stamps: n, note } });
  return clientLoyalty(shopId, clientId);
}

export async function loyaltyHistory(shopId: number, clientId: number) {
  const rows = await db().loyaltyEntry.findMany({
    where: { shop_id: shopId, client_id: clientId },
    orderBy: { id: 'desc' },
    take: 20,
    select: { kind: true, stamps: true, reward: true, note: true, created_at: true },
  });
  return rows.map((r) => ({ ...r, created_at: localDateTime(r.created_at) }));
}

/** Salva as regras do programa vindas do painel. */
export async function saveLoyaltyConfig(shopId: number, b: Record<string, unknown>) {
  const services = (await db().service.findMany({ where: { shop_id: shopId }, select: { id: true } })).map((s) => s.id);
  const type = (REWARD_TYPES as readonly unknown[]).includes(b.reward_type) ? String(b.reward_type) : 'service';
  if (type === 'service' && !services.includes(Number(b.reward_service))) throw new HttpError(400, 'Escolha o serviço que o cliente ganha.');
  if (type === 'other' && !String(b.reward_text ?? '').trim()) throw new HttpError(400, 'Descreva o prêmio.');
  if (b.start && !isValidDate(b.start)) throw new HttpError(400, 'Data de início inválida.');
  const current = await getSettings(shopId);
  // Ao ligar o programa, só contam os atendimentos dali em diante (se o dono não escolher outra data).
  // Com o programa já ligado, data em branco = conta todo o histórico.
  const start = (b.start as string) || (b.enabled && current.loyalty_enabled !== '1' ? todayStr() : '');
  const values: Record<string, unknown> = {
    loyalty_enabled: b.enabled ? '1' : '0',
    loyalty_goal: intIn(b.goal, 2, 100, 10),
    loyalty_services: (Array.isArray(b.services) ? b.services : []).map(Number).filter((id) => services.includes(id)).join(','),
    loyalty_min_cents: intIn(b.min_cents, 0, 1e7, 0),
    loyalty_reward_type: type,
    loyalty_reward_service: type === 'service' ? Number(b.reward_service) : current.loyalty_reward_service,
    loyalty_reward_percent: intIn(b.reward_percent, 1, 100, 50),
    loyalty_reward_text: String(b.reward_text ?? '').trim().slice(0, 80),
    loyalty_expire_days: intIn(b.expire_days, 0, 3650, 0),
    loyalty_start: start,
    loyalty_public: b.public === false ? '0' : '1',
  };
  await tx(async () => { for (const [k, v] of Object.entries(values)) await setSetting(shopId, k, v); });
  return loyaltyConfig(shopId);
}

/** Visão geral da tela de Fidelidade: quem tem prêmio, quem está perto e prêmios usados. */
export async function loyaltyOverview(shopId: number) {
  const config = await loyaltyConfig(shopId);
  const rows = await db().client.findMany({ where: { shop_id: shopId }, orderBy: { name: 'asc' }, select: { id: true, name: true, phone: true } });
  const clients: (typeof rows[number] & LoyaltyCard)[] = [];
  for (const c of rows) {
    const card = await clientLoyalty(shopId, c.id, config);
    if (card.stamps > 0) clients.push({ ...c, ...card });
  }
  const redeemed = await db().loyaltyEntry.count({
    where: { shop_id: shopId, kind: 'redeem', created_at: { gte: new Date(Date.now() - 30 * 86_400_000) } },
  });
  return {
    config,
    ready: clients.filter((c) => c.available > 0),
    close: clients.filter((c) => !c.available && c.missing <= 2),
    participants: clients.length,
    redeemed_30d: redeemed,
  };
}
