// Cidade 10: guia de comércios por cidade. Cada cidade tem sua página com
// categorias e negócios; os dados ficam no mesmo banco SQLite da barbearia.
import { db, tx } from '../db.js';

// O esquema das tabelas c10_* fica em src/db.js.

export function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const CATEGORIES = [
  ['Restaurantes', '🍽️', '#e85d3a'],
  ['Bares', '🍻', '#d97706'],
  ['Barbearias', '💈', '#475569'],
  ['Beleza', '💅', '#db2777'],
  ['Mercados', '🛒', '#16a34a'],
  ['Farmácias', '💊', '#0891b2'],
  ['Saúde', '🩺', '#2563eb'],
  ['Pet', '🐾', '#9333ea'],
  ['Hospedagem', '🏨', '#0d9488'],
  ['Turismo', '🧭', '#65a30d'],
  ['Lojas', '🛍️', '#c026d3'],
  ['Serviços', '🔧', '#64748b'],
];

const H = {
  comercial: { 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: ['08:00', '12:00'] },
  barbearia: { 1: ['13:00', '19:00'], 2: ['09:00', '19:00'], 3: ['09:00', '19:00'], 4: ['09:00', '19:00'], 5: ['09:00', '19:00'], 6: ['09:00', '19:00'] },
  restaurante: { 2: ['11:00', '15:00'], 3: ['11:00', '15:00'], 4: ['11:00', '23:00'], 5: ['11:00', '23:30'], 6: ['11:00', '23:30'], 0: ['11:00', '16:00'] },
  bar: { 3: ['17:00', '23:59'], 4: ['17:00', '23:59'], 5: ['17:00', '23:59'], 6: ['16:00', '23:59'], 0: ['16:00', '22:00'] },
  mercado: { 0: ['08:00', '13:00'], 1: ['07:00', '21:00'], 2: ['07:00', '21:00'], 3: ['07:00', '21:00'], 4: ['07:00', '21:00'], 5: ['07:00', '21:00'], 6: ['07:00', '21:00'] },
  sempre: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, ['00:00', '23:59']])),
};

// Negócios fictícios de exemplo — telefones propositalmente inválidos.
const CITIES = [
  {
    name: 'Foz do Iguaçu', state: 'PR', color: '#0f766e',
    tagline: 'Tudo de Foz em um só lugar',
    description: 'Restaurantes, serviços, hospedagem e o comércio da Terra das Cataratas.',
    businesses: [
      ['Barbearias', 'Barbearia Navalha de Ouro', 'Corte, barba na toalha quente e sobrancelha. Agende online e escolha seu barbeiro.', 'Rua das Tesouras, 123', 'Centro', H.barbearia, { booking: 1, featured: 1, instagram: 'navalhadeouro' }],
      ['Barbearias', 'Barbearia Fronteira', 'Barbearia clássica com sinuca e café.', 'Av. das Palmeiras, 880', 'Vila A', H.barbearia, {}],
      ['Restaurantes', 'Cantina Três Fronteiras', 'Massas artesanais e sequência de pizza aos finais de semana.', 'Rua do Sabor, 45', 'Centro', H.restaurante, { featured: 1, instagram: 'cantina3fronteiras' }],
      ['Restaurantes', 'Churrascaria Fogo do Rio', 'Rodízio de carnes com buffet de saladas.', 'Av. Principal, 2100', 'Jardim Central', H.restaurante, {}],
      ['Bares', 'Boteco da Ponte', 'Chope gelado, petiscos e música ao vivo às sextas.', 'Rua da Amizade, 77', 'Centro', H.bar, { featured: 1 }],
      ['Hospedagem', 'Pousada Mata Verde', 'Pousada familiar com café colonial e piscina.', 'Rua das Araras, 310', 'Vila Yolanda', H.sempre, { instagram: 'pousadamataverde' }],
      ['Turismo', 'Fronteira Receptivo', 'Passeios, transfers e roteiros pela região.', 'Av. do Turismo, 999', 'Centro', H.comercial, { featured: 1 }],
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
      ['Restaurantes', 'Sabor do Oeste', 'Comida caseira no buffet por quilo e marmitas.', 'Rua Paraná, 1500', 'Centro', H.restaurante, { featured: 1 }],
      ['Restaurantes', 'Hamburgueria Lago Azul', 'Smash burgers, batata rústica e milkshakes.', 'Av. do Lago, 300', 'Country', H.bar, { instagram: 'lagoazulburger' }],
      ['Bares', 'Choperia Country', 'Chope artesanal e porções para dividir.', 'Rua das Cervejas, 88', 'Country', H.bar, {}],
      ['Barbearias', 'Barbearia Oeste Clube', 'Cortes modernos, barba e cerveja cortesia.', 'Rua XV, 410', 'Centro', H.barbearia, { booking: 1, featured: 1 }],
      ['Beleza', 'Espaço Lumi', 'Salão de beleza, estética facial e depilação.', 'Rua das Acácias, 210', 'Neva', H.comercial, {}],
      ['Mercados', 'Supermercado Família', 'Tudo para sua casa com preço justo.', 'Av. Brasil, 3100', 'Cancelli', H.mercado, { featured: 1 }],
      ['Farmácias', 'Farmácia Popular do Bairro', 'Genéricos, perfumaria e aferição de pressão.', 'Rua Recife, 95', 'Coqueiral', H.comercial, {}],
      ['Pet', 'Amigo Fiel Pet Shop', 'Rações, acessórios e clínica veterinária.', 'Rua dos Pássaros, 600', 'Santa Cruz', H.comercial, {}],
      ['Saúde', 'Fisio Movimento', 'Fisioterapia, pilates e RPG.', 'Av. Tancredo, 720', 'Centro', H.comercial, { instagram: 'fisiomovimento' }],
      ['Lojas', 'Moda Oeste', 'Moda masculina e feminina com provador agendado.', 'Rua do Comércio, 1001', 'Centro', H.comercial, {}],
      ['Serviços', 'Chaveiro 24h Cascavel', 'Abertura de portas, cópias e chaves codificadas.', 'Rua Pernambuco, 12', 'Centro', H.sempre, {}],
    ],
  },
];

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM c10_cities').get().n > 0) return;
  tx(() => {
    const insCat = db.prepare('INSERT INTO c10_categories (slug, name, icon, color, sort) VALUES (?, ?, ?, ?, ?)');
    const catIds = {};
    CATEGORIES.forEach(([name, icon, color], i) => {
      catIds[name] = Number(insCat.run(slugify(name), name, icon, color, i).lastInsertRowid);
    });

    const insCity = db.prepare('INSERT INTO c10_cities (slug, name, state, tagline, description, color) VALUES (?, ?, ?, ?, ?, ?)');
    const insBiz = db.prepare(`INSERT INTO c10_businesses
      (city_id, category_id, slug, name, description, address, neighborhood, phone, instagram, hours, booking_enabled, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let n = 0;
    for (const c of CITIES) {
      const cityId = Number(insCity.run(slugify(c.name), c.name, c.state, c.tagline, c.description, c.color).lastInsertRowid);
      for (const [cat, name, desc, address, hood, hours, extra] of c.businesses) {
        insBiz.run(
          cityId, catIds[cat], slugify(name), name, desc, address, hood,
          `5545000000${String(++n).padStart(3, '0')}`, extra.instagram || null, JSON.stringify(hours),
          extra.booking ? 1 : 0, extra.featured || 0
        );
      }
    }
  });
}

seed();

/* ---------------------------- Consultas ---------------------------- */

export const getCities = () =>
  db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM c10_businesses b WHERE b.city_id = c.id AND b.active = 1) AS total
              FROM c10_cities c WHERE c.active = 1 ORDER BY c.name`).all();

export const getCity = (slug) => db.prepare('SELECT * FROM c10_cities WHERE slug = ? AND active = 1').get(slug);

export const getCategories = () => db.prepare('SELECT * FROM c10_categories ORDER BY sort').all();

export const getCategory = (slug) => db.prepare('SELECT * FROM c10_categories WHERE slug = ?').get(slug);

/** Categorias com quantidade de negócios na cidade (só as que têm algum). */
export const getCityCategories = (cityId) =>
  db.prepare(`SELECT cat.*, COUNT(b.id) AS total FROM c10_categories cat
              JOIN c10_businesses b ON b.category_id = cat.id AND b.city_id = ? AND b.active = 1
              GROUP BY cat.id ORDER BY cat.sort`).all(cityId);

const BIZ_SELECT = `
  SELECT b.*, cat.name AS category_name, cat.slug AS category_slug, cat.icon AS category_icon, cat.color AS category_color
  FROM c10_businesses b JOIN c10_categories cat ON cat.id = b.category_id`;

export function searchBusinesses(cityId, { categoryId, q, featured } = {}) {
  const where = ['b.city_id = ?', 'b.active = 1'];
  const params = [cityId];
  if (categoryId) { where.push('b.category_id = ?'); params.push(categoryId); }
  if (featured) where.push('b.featured = 1');
  if (q) {
    where.push('(b.name LIKE ? OR b.description LIKE ? OR b.neighborhood LIKE ? OR cat.name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  return db.prepare(`${BIZ_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.featured DESC, b.name`).all(...params);
}

export const getBusiness = (cityId, slug) =>
  db.prepare(`${BIZ_SELECT} WHERE b.city_id = ? AND b.slug = ? AND b.active = 1`).get(cityId, slug);

export function createLead({ cityId, categoryId, businessName, contactName, phone, message }) {
  db.prepare(`INSERT INTO c10_leads (city_id, category_id, business_name, contact_name, phone, message)
              VALUES (?, ?, ?, ?, ?, ?)`).run(cityId || null, categoryId || null, businessName, contactName, phone, message || null);
}

/** Comércio com agenda online ativa, com os dados da cidade para montar links. */
export const getShop = (shopId) =>
  db.prepare(`SELECT b.*, c.slug AS city_slug, c.name AS city_name, c.state AS city_state
              FROM c10_businesses b JOIN c10_cities c ON c.id = b.city_id
              WHERE b.id = ? AND b.booking_enabled = 1 AND b.active = 1`).get(shopId);

export const bookingPath = (shop) => `/${shop.city_slug}/${shop.slug}/agendar`;

/** Slug único dentro da cidade ("barbearia-x", "barbearia-x-2"...). */
export function uniqueSlug(cityId, name, excludeId = 0) {
  const base = slugify(name) || 'negocio';
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM c10_businesses WHERE city_id = ? AND slug = ? AND id != ?').get(cityId, slug, excludeId); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}
