// Cartão fidelidade: a cada N atendimentos concluídos o cliente ganha um prêmio.
//
// Os selos não ficam gravados: são os atendimentos concluídos que contam pelas regras atuais,
// feitos depois do último prêmio usado. Ao usar um prêmio, grava-se quantos selos sobraram
// (quem tinha 12 num cartão de 10 fica com 2). Ajustes à mão (ex.: cliente que tinha cartão
// de papel) entram como lançamentos 'adjust'.
import { db, getSettings, setSetting, tx } from './db.js';
import { todayStr, addDays, isValidDate } from './time.js';
import { HttpError } from './scheduling.js';

const REWARD_TYPES = ['service', 'percent', 'other'];
const intIn = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function loyaltyConfig(shopId, s = getSettings(shopId)) {
  const services = db.prepare('SELECT id, name, price_cents FROM services WHERE shop_id = ?').all(shopId);
  const counted = String(s.loyalty_services || '').split(',').map(Number).filter((id) => services.some((x) => x.id === id));
  const cfg = {
    enabled: s.loyalty_enabled === '1',
    goal: intIn(s.loyalty_goal, 2, 100, 10),
    services: counted,
    min_cents: intIn(s.loyalty_min_cents, 0, 1e7, 0),
    reward_type: REWARD_TYPES.includes(s.loyalty_reward_type) ? s.loyalty_reward_type : 'service',
    reward_service: Number(s.loyalty_reward_service) || null,
    reward_percent: intIn(s.loyalty_reward_percent, 1, 100, 50),
    reward_text: String(s.loyalty_reward_text || '').trim(),
    expire_days: intIn(s.loyalty_expire_days, 0, 3650, 0),
    start: isValidDate(s.loyalty_start) ? s.loyalty_start : null,
    public: s.loyalty_public !== '0',
  };
  const rewardService = services.find((x) => x.id === cfg.reward_service);
  if (cfg.reward_type === 'service' && !rewardService) cfg.reward_service = null;
  cfg.reward_label =
    cfg.reward_type === 'service' ? (rewardService ? `${rewardService.name} grátis` : 'um serviço grátis')
    : cfg.reward_type === 'percent' ? `${cfg.reward_percent}% de desconto`
    : cfg.reward_text || 'um prêmio';
  const names = counted.map((id) => services.find((x) => x.id === id).name);
  cfg.counts_label = names.length ? names.join(', ') : 'qualquer serviço';
  cfg.summary = `A cada ${cfg.goal} atendimentos, ganhe ${cfg.reward_label}.`;
  return cfg;
}

/** Selos de um cliente: { stamps, goal, available (prêmios), missing (para o próximo) }. */
export function clientLoyalty(shopId, clientId, cfg = loyaltyConfig(shopId)) {
  const last = db.prepare(`SELECT id, stamps, created_at FROM loyalty_entries
                           WHERE shop_id = ? AND client_id = ? AND kind = 'redeem' ORDER BY id DESC LIMIT 1`).get(shopId, clientId);
  const since = [cfg.start, cfg.expire_days ? addDays(todayStr(), -cfg.expire_days) : null].filter(Boolean).sort().pop() || '0000-00-00';
  const serviceFilter = cfg.services.length ? `AND service_id IN (${cfg.services.join(',')})` : '';
  const earned = db.prepare(`
    SELECT COUNT(*) AS n FROM appointments
    WHERE shop_id = ? AND client_id = ? AND status = 'done' AND price_cents >= ? AND date >= ? ${serviceFilter}
      AND id NOT IN (SELECT appointment_id FROM loyalty_entries WHERE appointment_id IS NOT NULL) -- o atendimento grátis não vira selo
      AND date || ' ' || printf('%02d:%02d', start_min / 60, start_min % 60) > ?`)
    .get(shopId, clientId, cfg.min_cents, since, last?.created_at || '').n;
  const adjusted = db.prepare(`SELECT COALESCE(SUM(stamps), 0) AS n FROM loyalty_entries
                               WHERE shop_id = ? AND client_id = ? AND kind = 'adjust' AND id > ?`)
    .get(shopId, clientId, last?.id || 0).n;
  const stamps = Math.max(0, (last?.stamps || 0) + earned + adjusted);
  return {
    stamps,
    goal: cfg.goal,
    available: Math.floor(stamps / cfg.goal),
    missing: cfg.goal - (stamps % cfg.goal),
    reward_label: cfg.reward_label,
  };
}

/** Cartão para mostrar ao cliente (só se o programa estiver ativo e visível). */
export function publicLoyalty(shopId, clientId) {
  const cfg = loyaltyConfig(shopId);
  if (!cfg.enabled || !cfg.public) return null;
  return { summary: cfg.summary, counts_label: cfg.counts_label, ...(clientId && clientLoyalty(shopId, clientId, cfg)) };
}

/**
 * Usa um prêmio do cliente. Se vier o atendimento, o desconto já é aplicado no valor dele:
 * serviço grátis zera (ou abate o preço do serviço do prêmio); porcentagem desconta.
 */
export function redeem(shopId, clientId, appointmentId) {
  return tx(() => {
    const cfg = loyaltyConfig(shopId);
    const card = clientLoyalty(shopId, clientId, cfg);
    if (card.available < 1) throw new HttpError(400, `Faltam ${card.missing} atendimento(s) para o prêmio.`);
    let appt = null;
    if (appointmentId) {
      appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND shop_id = ? AND client_id = ?').get(appointmentId, shopId, clientId);
      if (!appt) throw new HttpError(404, 'Agendamento não encontrado.');
      let price = appt.price_cents;
      if (cfg.reward_type === 'percent') price = Math.round((price * (100 - cfg.reward_percent)) / 100);
      if (cfg.reward_type === 'service') {
        const rewardPrice = appt.service_id === cfg.reward_service || !cfg.reward_service ? price
          : db.prepare('SELECT price_cents FROM services WHERE id = ?').get(cfg.reward_service).price_cents;
        price = Math.max(0, price - rewardPrice);
      }
      const notes = [appt.notes, `🎁 Prêmio fidelidade: ${cfg.reward_label}`].filter(Boolean).join(' · ');
      db.prepare('UPDATE appointments SET price_cents = ?, notes = ? WHERE id = ?').run(price, notes, appt.id);
    }
    db.prepare(`INSERT INTO loyalty_entries (shop_id, client_id, kind, stamps, reward, appointment_id) VALUES (?, ?, 'redeem', ?, ?, ?)`)
      .run(shopId, clientId, card.stamps - cfg.goal, cfg.reward_label, appt?.id ?? null);
    return clientLoyalty(shopId, clientId, cfg);
  });
}

export function adjust(shopId, clientId, stamps, note) {
  const n = Math.round(Number(stamps));
  if (!n || Math.abs(n) > 100) throw new HttpError(400, 'Informe quantos selos somar ou tirar.');
  db.prepare(`INSERT INTO loyalty_entries (shop_id, client_id, kind, stamps, note) VALUES (?, ?, 'adjust', ?, ?)`)
    .run(shopId, clientId, n, note || null);
  return clientLoyalty(shopId, clientId);
}

export function loyaltyHistory(shopId, clientId) {
  return db.prepare(`SELECT kind, stamps, reward, note, created_at FROM loyalty_entries
                     WHERE shop_id = ? AND client_id = ? ORDER BY id DESC LIMIT 20`).all(shopId, clientId);
}

/** Salva as regras do programa vindas do painel. */
export function saveLoyaltyConfig(shopId, b) {
  const services = db.prepare('SELECT id FROM services WHERE shop_id = ?').all(shopId).map((s) => s.id);
  const type = REWARD_TYPES.includes(b.reward_type) ? b.reward_type : 'service';
  if (type === 'service' && !services.includes(Number(b.reward_service))) throw new HttpError(400, 'Escolha o serviço que o cliente ganha.');
  if (type === 'other' && !String(b.reward_text || '').trim()) throw new HttpError(400, 'Descreva o prêmio.');
  if (b.start && !isValidDate(b.start)) throw new HttpError(400, 'Data de início inválida.');
  const current = getSettings(shopId);
  // Ao ligar o programa, só contam os atendimentos dali em diante (se o dono não escolher outra data).
  // Com o programa já ligado, data em branco = conta todo o histórico.
  const start = b.start || (b.enabled && current.loyalty_enabled !== '1' ? todayStr() : '');
  const values = {
    loyalty_enabled: b.enabled ? '1' : '0',
    loyalty_goal: intIn(b.goal, 2, 100, 10),
    loyalty_services: (b.services || []).map(Number).filter((id) => services.includes(id)).join(','),
    loyalty_min_cents: intIn(b.min_cents, 0, 1e7, 0),
    loyalty_reward_type: type,
    loyalty_reward_service: type === 'service' ? Number(b.reward_service) : current.loyalty_reward_service,
    loyalty_reward_percent: intIn(b.reward_percent, 1, 100, 50),
    loyalty_reward_text: String(b.reward_text || '').trim().slice(0, 80),
    loyalty_expire_days: intIn(b.expire_days, 0, 3650, 0),
    loyalty_start: start || '',
    loyalty_public: b.public === false ? '0' : '1',
  };
  tx(() => { for (const [k, v] of Object.entries(values)) setSetting(shopId, k, v); });
  return loyaltyConfig(shopId);
}

/** Visão geral para a tela de Fidelidade: quem tem prêmio, quem está perto e prêmios usados. */
export function loyaltyOverview(shopId) {
  const cfg = loyaltyConfig(shopId);
  const clients = db.prepare('SELECT id, name, phone FROM clients WHERE shop_id = ? ORDER BY name').all(shopId)
    .map((c) => ({ ...c, ...clientLoyalty(shopId, c.id, cfg) }))
    .filter((c) => c.stamps > 0);
  const redeemed = db.prepare(`SELECT COUNT(*) AS n FROM loyalty_entries WHERE shop_id = ? AND kind = 'redeem'
                               AND created_at >= datetime('now', 'localtime', '-30 days')`).get(shopId).n;
  return {
    config: cfg,
    ready: clients.filter((c) => c.available > 0),
    close: clients.filter((c) => !c.available && c.missing <= 2),
    participants: clients.length,
    redeemed_30d: redeemed,
  };
}
