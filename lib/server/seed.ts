// Dados de exemplo: cidades, categorias, comércios fictícios, agenda das barbearias e logins.
// Roda com `npm run db:seed` (ou `npx prisma db seed`). Só cria o que falta.
import { db, Prisma } from './db';
import { setSetting } from './settings';
import { hashPassword, slugify } from './util';
import { todayStr, addDays, weekdayOf, toDbDate } from './time';
import type { Role } from '../types';

const CATEGORIES: [string, string, string][] = [
  ['Restaurantes', '🍽️', '#e85d3a'], ['Bares', '🍻', '#d97706'], ['Barbearias', '💈', '#475569'],
  ['Beleza', '💅', '#db2777'], ['Mercados', '🛒', '#16a34a'], ['Farmácias', '💊', '#0891b2'],
  ['Saúde', '🩺', '#2563eb'], ['Pet', '🐾', '#9333ea'], ['Hospedagem', '🏨', '#0d9488'],
  ['Turismo', '🧭', '#65a30d'], ['Lojas', '🛍️', '#c026d3'], ['Serviços', '🔧', '#64748b'],
];

type H = Record<number, [string, string]>;
const H: Record<string, H> = {
  comercial: { 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: ['08:00', '12:00'] },
  barbearia: { 1: ['13:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['09:00', '19:00'] },
  restaurante: { 2: ['11:00', '15:00'], 3: ['11:00', '15:00'], 4: ['11:00', '23:00'], 5: ['11:00', '23:30'], 6: ['11:00', '23:30'], 0: ['11:00', '16:00'] },
  bar: { 3: ['17:00', '23:59'], 4: ['17:00', '23:59'], 5: ['17:00', '23:59'], 6: ['16:00', '23:59'], 0: ['16:00', '22:00'] },
  mercado: { 0: ['08:00', '13:00'], 1: ['07:00', '21:00'], 2: ['07:00', '21:00'], 3: ['07:00', '21:00'], 4: ['07:00', '21:00'], 5: ['07:00', '21:00'], 6: ['07:00', '21:00'] },
  sempre: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, ['00:00', '23:59']])),
};

type Extra = { booking?: boolean; featured?: boolean; instagram?: string };
type BizSeed = [category: string, name: string, description: string, address: string, neighborhood: string, hours: H, extra: Extra];

// Negócios fictícios de exemplo — telefones propositalmente inválidos.
const CITIES: { name: string; state: string; color: string; tagline: string; description: string; businesses: BizSeed[] }[] = [
  {
    name: 'Foz do Iguaçu', state: 'PR', color: '#0f766e',
    tagline: 'Tudo de Foz em um só lugar',
    description: 'Restaurantes, serviços, hospedagem e o comércio da Terra das Cataratas.',
    businesses: [
      ['Barbearias', 'Barbearia Navalha de Ouro', 'Corte, barba na toalha quente e sobrancelha. Agende online e escolha seu barbeiro.', 'Rua das Tesouras, 123', 'Centro', H.barbearia, { booking: true, featured: true, instagram: 'navalhadeouro' }],
      ['Barbearias', 'Barbearia Fronteira', 'Barbearia clássica com sinuca e café.', 'Av. das Palmeiras, 880', 'Vila A', H.barbearia, {}],
      ['Restaurantes', 'Cantina Três Fronteiras', 'Massas artesanais e sequência de pizza aos finais de semana.', 'Rua do Sabor, 45', 'Centro', H.restaurante, { featured: true, instagram: 'cantina3fronteiras' }],
      ['Restaurantes', 'Churrascaria Fogo do Rio', 'Rodízio de carnes com buffet de saladas.', 'Av. Principal, 2100', 'Jardim Central', H.restaurante, {}],
      ['Bares', 'Boteco da Ponte', 'Chope gelado, petiscos e música ao vivo às sextas.', 'Rua da Amizade, 77', 'Centro', H.bar, { featured: true }],
      ['Hospedagem', 'Pousada Mata Verde', 'Pousada familiar com café colonial e piscina.', 'Rua das Araras, 310', 'Vila Yolanda', H.sempre, { instagram: 'pousadamataverde' }],
      ['Turismo', 'Fronteira Receptivo', 'Passeios, transfers e roteiros pela região.', 'Av. do Turismo, 999', 'Centro', H.comercial, { featured: true }],
      ['Mercados', 'Mercado Bom Preço', 'Hortifrúti fresco, açougue e padaria própria.', 'Rua do Comércio, 501', 'Vila A', H.mercado, {}],
      ['Farmácias', 'Farmácia Vida Plena', 'Medicamentos, manipulação e entrega rápida.', 'Av. da Saúde, 150', 'Centro', H.sempre, {}],
      ['Pet', 'Pet Iguaçu Banho & Tosa', 'Banho, tosa e pet shop com leva e traz.', 'Rua dos Bichos, 22', 'Morumbi', H.comercial, {}],
      ['Beleza', 'Studio Bella', 'Cabelo, unhas e maquiagem para eventos.', 'Rua das Flores, 640', 'Jardim Central', H.comercial, { instagram: 'studiobella' }],
      ['Saúde', 'Clínica Sorriso Fronteira', 'Odontologia geral, ortodontia e clareamento.', 'Av. Central, 1200, sala 4', 'Centro', H.comercial, {}],
    ],
  },
  {
    name: 'Cascavel', state: 'PR', color: '#1d4ed8',
    tagline: 'O comércio de Cascavel na palma da mão',
    description: 'Encontre lojas, restaurantes e serviços da capital do oeste.',
    businesses: [
      ['Restaurantes', 'Sabor do Oeste', 'Comida caseira no buffet por quilo e marmitas.', 'Rua Paraná, 1500', 'Centro', H.restaurante, { featured: true }],
      ['Restaurantes', 'Hamburgueria Lago Azul', 'Smash burgers, batata rústica e milkshakes.', 'Av. do Lago, 300', 'Country', H.bar, { instagram: 'lagoazulburger' }],
      ['Bares', 'Choperia Country', 'Chope artesanal e porções para dividir.', 'Rua das Cervejas, 88', 'Country', H.bar, {}],
      ['Barbearias', 'Barbearia Oeste Clube', 'Cortes modernos, barba e cerveja cortesia.', 'Rua XV, 410', 'Centro', H.barbearia, { booking: true, featured: true }],
      ['Beleza', 'Espaço Lumi', 'Salão de beleza, estética facial e depilação.', 'Rua das Acácias, 210', 'Neva', H.comercial, {}],
      ['Mercados', 'Supermercado Família', 'Tudo para sua casa com preço justo.', 'Av. Brasil, 3100', 'Cancelli', H.mercado, { featured: true }],
      ['Farmácias', 'Farmácia Popular do Bairro', 'Genéricos, perfumaria e aferição de pressão.', 'Rua Recife, 95', 'Coqueiral', H.comercial, {}],
      ['Pet', 'Amigo Fiel Pet Shop', 'Rações, acessórios e clínica veterinária.', 'Rua dos Pássaros, 600', 'Santa Cruz', H.comercial, {}],
      ['Saúde', 'Fisio Movimento', 'Fisioterapia, pilates e RPG.', 'Av. Tancredo, 720', 'Centro', H.comercial, { instagram: 'fisiomovimento' }],
      ['Lojas', 'Moda Oeste', 'Moda masculina e feminina com provador agendado.', 'Rua do Comércio, 1001', 'Centro', H.comercial, {}],
      ['Serviços', 'Chaveiro 24h Cascavel', 'Abertura de portas, cópias e chaves codificadas.', 'Rua Pernambuco, 12', 'Centro', H.sempre, {}],
    ],
  },
];

const SERVICES: [string, string, number, number][] = [
  ['Corte', 'Corte masculino tradicional ou degradê', 30, 4000],
  ['Barba', 'Barba com toalha quente e navalha', 30, 3000],
  ['Corte + Barba', 'Combo completo', 60, 6500],
  ['Pezinho', 'Acabamento do contorno', 15, 1500],
  ['Sobrancelha', 'Design na navalha', 15, 1500],
];

async function seedGuide() {
  await db().category.createMany({ data: CATEGORIES.map(([name, icon, color], i) => ({ slug: slugify(name), name, icon, color, sort: i })) });
  const catIds = Object.fromEntries((await db().category.findMany()).map((c) => [c.name, c.id]));
  let n = 0;
  for (const c of CITIES) {
    const city = await db().city.create({
      data: { slug: slugify(c.name), name: c.name, state: c.state, tagline: c.tagline, description: c.description, color: c.color },
    });
    await db().business.createMany({
      data: c.businesses.map(([cat, name, description, address, neighborhood, hours, extra]) => ({
        city_id: city.id, category_id: catIds[cat], slug: slugify(name), name, description, address, neighborhood,
        phone: `5545000000${String(++n).padStart(3, '0')}`, instagram: extra.instagram ?? null, hours,
        booking_enabled: !!extra.booking, featured: !!extra.featured,
      })),
    });
  }
}

async function seedShop(shopId: number, barbers: [string, number, string][], clientNames: string[]) {
  const barberIds: number[] = [];
  for (const [name, commission_pct, color] of barbers) {
    barberIds.push((await db().barber.create({ data: { shop_id: shopId, name, commission_pct, color } })).id);
  }
  await db().barberHour.createMany({
    data: [
      // ter-sáb, com almoço
      ...barberIds.flatMap((barber_id) => [2, 3, 4, 5, 6].map((weekday) => ({ barber_id, weekday, start_min: 540, end_min: 1140, break_start: 720, break_end: 780 }))),
      // o primeiro barbeiro atende segunda à tarde
      { barber_id: barberIds[0], weekday: 1, start_min: 780, end_min: 1140 },
    ],
  });
  const serviceIds: number[] = [];
  for (const [name, description, duration_min, price_cents] of SERVICES) {
    serviceIds.push((await db().service.create({ data: { shop_id: shopId, name, description, duration_min, price_cents } })).id);
  }
  const clients: number[] = [];
  for (const [i, name] of clientNames.entries()) {
    clients.push((await db().client.create({ data: { shop_id: shopId, name, phone: `55450000${shopId}${String(i).padStart(3, '0')}` } })).id);
  }

  let n = 0;
  const appts: Prisma.AppointmentCreateManyInput[] = [];
  const appt = (barber: number, s: number, client: number, date: string, start: number, status: string, payment: string | null) =>
    appts.push({
      shop_id: shopId, code: `D${shopId}X${++n}`, barber_id: barber, service_id: serviceIds[s], client_id: client, date: toDbDate(date),
      start_min: start, end_min: start + SERVICES[s][2], price_cents: SERVICES[s][3], status, source: 'online', payment,
    });

  // Histórico dos últimos dias, para o financeiro ter o que mostrar.
  for (let d = -14; d < 0; d++) {
    const date = addDays(todayStr(), d);
    if (weekdayOf(date) < 2) continue;
    for (let i = 0; i < 6; i++) {
      const k = i + d + 20;
      const start = 540 + i * 60 + (i >= 3 ? 60 : 0);
      const status = (i + d) % 9 === 0 ? 'no_show' : 'done';
      appt(barberIds[k % barberIds.length], k % 3, clients[i % clients.length], date, start, status,
        status === 'done' ? ['pix', 'dinheiro', 'cartao'][i % 3] : null);
    }
  }
  // Próximos dias.
  for (let d = 0; d < 3; d++) {
    const date = addDays(todayStr(), d);
    if (weekdayOf(date) < 2) continue;
    for (const [b, s, c, start] of [[0, 0, 0, 600], [1, 2, 1, 600], [0, 1, 2, 840], [1, 0, 0, 930]]) {
      appt(barberIds[b % barberIds.length], s, clients[c % clients.length], date, start, d === 0 ? 'confirmed' : 'scheduled', null);
    }
  }
  await db().appointment.createMany({ data: appts });
  return serviceIds;
}

const bizId = async (city: string, slug: string) =>
  (await db().business.findFirst({ where: { slug, city: { slug: city } }, select: { id: true } }))?.id ?? null;
const cityId = async (slug: string) => (await db().city.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;

async function createUserRow(name: string, email: string, password: string, role: Role, city_id: number | null, business_id: number | null) {
  const data = { name, role, city_id, business_id, active: true };
  await db().user.upsert({ where: { email }, create: { ...data, email, password: await hashPassword(password) }, update: data });
}

/**
 * Contas de teste com login e senha curtos, uma de cada tipo de painel.
 * Para desligar, configure TEST_ACCOUNTS=0 (o login delas passa a ser recusado).
 */
export const TEST_PASSWORD = '1234';
export const TEST_ACCOUNTS: [name: string, login: string, role: Role, city?: string, biz?: string][] = [
  ['Teste 1', 'teste1', 'super'],
  ['Teste 2', 'teste2', 'super'],
  ['Teste 3', 'teste3', 'super'],
  ['Admin teste Foz', 'cidade1', 'city', 'foz-do-iguacu'],
  ['Admin teste Cascavel', 'cidade2', 'city', 'cascavel'],
  ['Teste Navalha de Ouro', 'barbearia1', 'shop', 'foz-do-iguacu', 'barbearia-navalha-de-ouro'],
  ['Teste Oeste Clube', 'barbearia2', 'shop', 'cascavel', 'barbearia-oeste-clube'],
];
export const isTestLogin = (email: string) => TEST_ACCOUNTS.some(([, login]) => login === email);

async function seedTestAccounts() {
  for (const [name, login, role, city, biz] of TEST_ACCOUNTS) {
    if (await db().user.findUnique({ where: { email: login } })) continue;
    const businessId = biz && city ? await bizId(city, biz) : null;
    if (biz && !businessId) continue; // a barbearia de exemplo foi apagada
    await createUserRow(name, login, TEST_PASSWORD, role, role === 'city' && city ? await cityId(city) : null, businessId);
  }
}

/** Cria o que estiver faltando. Devolve a lista de logins criados (para mostrar no terminal). */
export async function seedIfEmpty(log = false) {
  const created: string[] = [];
  await (async () => {
    if (!(await db().city.findFirst())) {
      await seedGuide();
      created.push('cidades, categorias e comércios de exemplo');
    }
    if (!(await db().user.findFirst())) {
      const navalha = (await bizId('foz-do-iguacu', 'barbearia-navalha-de-ouro'))!;
      const oeste = (await bizId('cascavel', 'barbearia-oeste-clube'))!;
      const services = await seedShop(navalha, [['Carlos', 50, '#c8a24a'], ['Rafael', 45, '#4a9cc8']], ['João Silva', 'Pedro Santos', 'Lucas Oliveira']);
      await seedShop(oeste, [['Diego', 50, '#d9734a'], ['Matheus', 40, '#6a9c4a']], ['André Souza', 'Bruno Lima', 'Felipe Costa']);
      // Cartão fidelidade de exemplo na Navalha de Ouro: a cada 5 atendimentos, um corte grátis.
      for (const [k, v] of Object.entries({ loyalty_enabled: '1', loyalty_goal: '5', loyalty_reward_type: 'service', loyalty_reward_service: services[0] })) {
        await setSetting(navalha, k, v);
      }
      const superPassword = process.env.ADMIN_PASSWORD || 'cidade10admin';
      await createUserRow('Admin Cidade 10', 'admin@cidade10.com', superPassword, 'super', null, null);
      await createUserRow('Admin Foz do Iguaçu', 'foz@cidade10.com', 'foz12345', 'city', await cityId('foz-do-iguacu'), null);
      await createUserRow('Admin Cascavel', 'cascavel@cidade10.com', 'cascavel123', 'city', await cityId('cascavel'), null);
      await createUserRow('Carlos (Navalha de Ouro)', 'navalha@cidade10.com', 'barbearia123', 'shop', null, navalha);
      await createUserRow('Diego (Oeste Clube)', 'oeste@cidade10.com', 'barbearia123', 'shop', null, oeste);
      created.push('agenda das barbearias e logins de exemplo');
    }
    await seedTestAccounts();
  })();
  if (log) {
    for (const c of created) console.log(`  Criado: ${c}`);
    const list = (role: Role) => TEST_ACCOUNTS.filter((a) => a[2] === role).map((a) => a[1]).join(', ');
    console.log(`  Contas de teste (senha ${TEST_PASSWORD}): admin geral ${list('super')} · cidade ${list('city')} · barbearia ${list('shop')}`);
  }
  return created;
}

