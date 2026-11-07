import { db } from './db';

const DEFAULT_SETTINGS = {
  slot_interval: '15',          // grade de horários (min)
  min_advance_min: '60',        // antecedência mínima para agendar online
  max_days_ahead: '30',         // até quantos dias à frente o cliente pode agendar
  cancel_limit_hours: '2',      // cliente só cancela online até X horas antes
  max_active_per_phone: '2',    // agendamentos futuros simultâneos por telefone
  block_after_no_shows: '3',    // bloqueia agendamento online após X faltas
  // Cartão fidelidade (ver loyalty.ts)
  loyalty_enabled: '0',
  loyalty_goal: '10',
  loyalty_services: '',
  loyalty_min_cents: '0',
  loyalty_reward_type: 'service',
  loyalty_reward_service: '',
  loyalty_reward_percent: '50',
  loyalty_reward_text: '',
  loyalty_expire_days: '0',
  loyalty_start: '',
  loyalty_public: '1',
  reminder_template:
    'Olá {cliente}! Passando para lembrar do seu horário na {barbearia}: {servico} com {barbeiro} em {data} às {hora}. Confirma sua presença? Se não puder vir, cancele pelo link: {link}',
};

export type ShopSettings = typeof DEFAULT_SETTINGS & {
  shop_name: string; shop_phone: string; shop_address: string; shop_neighborhood: string;
};

/** Configurações da agenda de uma barbearia. Nome, telefone e endereço vêm do cadastro no Cidade 10. */
export async function getSettings(shopId: number): Promise<ShopSettings> {
  const [rows, biz] = await Promise.all([
    db().shopSetting.findMany({ where: { shop_id: shopId } }),
    db().business.findUnique({ where: { id: shopId }, select: { name: true, phone: true, address: true, neighborhood: true } }),
  ]);
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  out.shop_name = biz?.name || '';
  out.shop_phone = biz?.phone || '';
  out.shop_address = biz?.address || '';
  out.shop_neighborhood = biz?.neighborhood || '';
  return out as ShopSettings;
}

const BUSINESS_COLUMNS = { shop_name: 'name', shop_phone: 'phone', shop_address: 'address' } as const;

export async function setSetting(shopId: number, key: string, value: unknown) {
  const col = BUSINESS_COLUMNS[key as keyof typeof BUSINESS_COLUMNS];
  if (col) {
    await db().business.update({ where: { id: shopId }, data: { [col]: String(value) } });
    return;
  }
  await db().shopSetting.upsert({
    where: { shop_id_key: { shop_id: shopId, key } },
    create: { shop_id: shopId, key, value: String(value) },
    update: { value: String(value) },
  });
}
