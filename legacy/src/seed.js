// Dados de exemplo criados no primeiro start: agenda das barbearias com
// agenda online e os usuários de cada tipo.
import { db, tx, setSetting } from './db.js';
import './c10/data.js'; // cria as cidades, categorias e comércios de exemplo
import { createUser } from './users.js';
import { hashPassword } from './auth.js';
import { todayStr, addDays, weekdayOf } from './time.js';

const SERVICES = [
  ['Corte', 'Corte masculino tradicional ou degradê', 30, 4000],
  ['Barba', 'Barba com toalha quente e navalha', 30, 3000],
  ['Corte + Barba', 'Combo completo', 60, 6500],
  ['Pezinho', 'Acabamento do contorno', 15, 1500],
  ['Sobrancelha', 'Design na navalha', 15, 1500],
];

function seedShop(shopId, barbers, clientNames) {
  const insBarber = db.prepare('INSERT INTO barbers (shop_id, name, phone, commission_pct, color) VALUES (?, ?, ?, ?, ?)');
  const insHours = db.prepare(
    'INSERT INTO barber_hours (barber_id, weekday, start_min, end_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const barberIds = barbers.map(([name, pct, color]) => Number(insBarber.run(shopId, name, null, pct, color).lastInsertRowid));
  for (const id of barberIds) {
    for (let wd = 2; wd <= 6; wd++) insHours.run(id, wd, 9 * 60, 19 * 60, 12 * 60, 13 * 60); // ter-sáb
  }
  insHours.run(barberIds[0], 1, 13 * 60, 19 * 60, null, null); // primeiro barbeiro atende segunda à tarde

  const insService = db.prepare('INSERT INTO services (shop_id, name, description, duration_min, price_cents) VALUES (?, ?, ?, ?, ?)');
  const serviceIds = SERVICES.map((s) => Number(insService.run(shopId, ...s).lastInsertRowid));

  const insClient = db.prepare('INSERT INTO clients (shop_id, name, phone) VALUES (?, ?, ?)');
  const clients = clientNames.map((name, i) => Number(insClient.run(shopId, name, `55450000${shopId}${String(i).padStart(3, '0')}`).lastInsertRowid));

  const insAppt = db.prepare(`INSERT INTO appointments
    (shop_id, code, barber_id, service_id, client_id, date, start_min, end_min, price_cents, status, source, payment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  const code = () => `D${shopId}X${++n}`;
  const pick = (i) => [barberIds[i % barberIds.length], i % 3];

  // Histórico dos últimos dias, para o financeiro ter o que mostrar.
  for (let d = -14; d < 0; d++) {
    const date = addDays(todayStr(), d);
    if (weekdayOf(date) < 2) continue;
    for (let i = 0; i < 6; i++) {
      const [barber, s] = pick(i + d + 20);
      const start = 9 * 60 + i * 60 + (i >= 3 ? 60 : 0);
      const status = (i + d) % 9 === 0 ? 'no_show' : 'done';
      insAppt.run(shopId, code(), barber, serviceIds[s], clients[i % clients.length], date, start, start + SERVICES[s][2],
        SERVICES[s][3], status, 'online', status === 'done' ? ['pix', 'dinheiro', 'cartao'][i % 3] : null);
    }
  }
  // Próximos dias.
  for (let d = 0; d < 3; d++) {
    const date = addDays(todayStr(), d);
    if (weekdayOf(date) < 2) continue;
    [[0, 0, 0, 600], [1, 2, 1, 600], [0, 1, 2, 840], [1, 0, 0, 930]].forEach(([b, s, c, start]) => {
      insAppt.run(shopId, code(), barberIds[b % barberIds.length], serviceIds[s], clients[c % clients.length], date, start,
        start + SERVICES[s][2], SERVICES[s][3], d === 0 ? 'confirmed' : 'scheduled', 'online', null);
    });
  }
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const bizId = (city, slug) => db.prepare(`SELECT b.id FROM c10_businesses b JOIN c10_cities c ON c.id = b.city_id
                                            WHERE c.slug = ? AND b.slug = ?`).get(city, slug).id;
  const cityId = (slug) => db.prepare('SELECT id FROM c10_cities WHERE slug = ?').get(slug).id;
  const navalha = bizId('foz-do-iguacu', 'barbearia-navalha-de-ouro');
  const oeste = bizId('cascavel', 'barbearia-oeste-clube');

  const superPassword = process.env.ADMIN_PASSWORD || 'cidade10admin';
  const users = [
    ['Admin Cidade 10', 'admin@cidade10.com', superPassword, 'super', null, null],
    ['Admin Foz do Iguaçu', 'foz@cidade10.com', 'foz12345', 'city', cityId('foz-do-iguacu'), null],
    ['Admin Cascavel', 'cascavel@cidade10.com', 'cascavel123', 'city', cityId('cascavel'), null],
    ['Carlos (Navalha de Ouro)', 'navalha@cidade10.com', 'barbearia123', 'shop', null, navalha],
    ['Diego (Oeste Clube)', 'oeste@cidade10.com', 'barbearia123', 'shop', null, oeste],
  ];

  tx(() => {
    seedShop(navalha, [['Carlos', 50, '#c8a24a'], ['Rafael', 45, '#4a9cc8']], ['João Silva', 'Pedro Santos', 'Lucas Oliveira']);
    seedShop(oeste, [['Diego', 50, '#d9734a'], ['Matheus', 40, '#6a9c4a']], ['André Souza', 'Bruno Lima', 'Felipe Costa']);
    // Cartão fidelidade de exemplo na Navalha de Ouro: a cada 5 atendimentos, um corte grátis.
    const corte = db.prepare("SELECT id FROM services WHERE shop_id = ? AND name = 'Corte'").get(navalha).id;
    for (const [k, v] of Object.entries({ loyalty_enabled: '1', loyalty_goal: '5', loyalty_reward_type: 'service', loyalty_reward_service: corte })) {
      setSetting(navalha, k, v);
    }
    for (const [name, email, password, role, city, business] of users) {
      createUser({ name, email, password, role, cityId: city, businessId: business });
    }
  });

  console.log('\n  Dados de exemplo criados. Logins em http://localhost:' + (process.env.PORT || 3000) + '/entrar');
  for (const [, email, password, role] of users) console.log(`    ${role.padEnd(5)}  ${email.padEnd(24)} senha: ${password}`);
  console.log('');
}

/**
 * Contas de teste com login e senha curtos para facilitar os testes, uma de cada tipo de painel.
 * São criadas a cada start (se faltarem). Desligue com TEST_ACCOUNTS=0 ou NODE_ENV=production
 * antes de publicar: qualquer um que souber o login entra nos painéis.
 * [nome, login, tipo, cidade, comércio]; a senha de todas é TEST_PASSWORD.
 */
const TEST_PASSWORD = '1234';
const TEST_ACCOUNTS = [
  ['Teste 1', 'teste1', 'super'],
  ['Teste 2', 'teste2', 'super'],
  ['Teste 3', 'teste3', 'super'],
  ['Admin teste Foz', 'cidade1', 'city', 'foz-do-iguacu'],
  ['Admin teste Cascavel', 'cidade2', 'city', 'cascavel'],
  ['Teste Navalha de Ouro', 'barbearia1', 'shop', 'foz-do-iguacu', 'barbearia-navalha-de-ouro'],
  ['Teste Oeste Clube', 'barbearia2', 'shop', 'cascavel', 'barbearia-oeste-clube'],
];

function seedTestAccounts() {
  const logins = TEST_ACCOUNTS.map(([, login]) => login);
  if (process.env.TEST_ACCOUNTS === '0' || process.env.NODE_ENV === 'production') {
    db.prepare(`UPDATE users SET active = 0 WHERE email IN (${logins.map(() => '?').join(',')})`).run(...logins);
    return;
  }
  const cityId = (slug) => db.prepare('SELECT id FROM c10_cities WHERE slug = ?').get(slug)?.id ?? null;
  const bizId = (city, slug) => db.prepare(`SELECT b.id FROM c10_businesses b JOIN c10_cities c ON c.id = b.city_id
                                            WHERE c.slug = ? AND b.slug = ?`).get(city, slug)?.id ?? null;
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ? AND role = ? AND active = 1');
  const upsert = db.prepare(`INSERT INTO users (name, email, password, role, city_id, business_id) VALUES (?, ?, ?, ?, ?, ?)
                             ON CONFLICT(email) DO UPDATE SET role = excluded.role, city_id = excluded.city_id,
                                                              business_id = excluded.business_id, active = 1`);
  for (const [name, login, role, city, biz] of TEST_ACCOUNTS) {
    if (exists.get(login, role)) continue;
    const businessId = biz ? bizId(city, biz) : null;
    if (biz && !businessId) continue; // a barbearia de exemplo foi apagada
    upsert.run(name, login, hashPassword(TEST_PASSWORD), role, role === 'city' ? cityId(city) : null, businessId);
  }
  const list = (role) => TEST_ACCOUNTS.filter((a) => a[2] === role).map((a) => a[1]).join(', ');
  console.log(`  Contas de teste (senha ${TEST_PASSWORD}): admin geral ${list('super')} · cidade ${list('city')} · barbearia ${list('shop')}`);
}

seed();
seedTestAccounts();
