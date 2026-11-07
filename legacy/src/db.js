import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/barbearia.db', import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

// Versão do banco em PRAGMA user_version.
// Versão 2 é a base: várias barbearias (cada uma é um comércio do Cidade 10) e usuários com papéis.
// Bancos anteriores à base só tinham dados de exemplo, então são recriados.
// IMPORTANTE: o esquema base abaixo fica congelado. Qualquer mudança de estrutura daqui
// pra frente entra como uma nova migração em MIGRATIONS (logo depois do esquema base), que nunca apaga dados.
const BASE_VERSION = 2;
const startVersion = db.prepare('PRAGMA user_version').get().user_version;
if (startVersion < BASE_VERSION) {
  const old = db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).get().n;
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS appointments; DROP TABLE IF EXISTS barber_hours; DROP TABLE IF EXISTS blocks;
    DROP TABLE IF EXISTS clients; DROP TABLE IF EXISTS services; DROP TABLE IF EXISTS barbers;
    DROP TABLE IF EXISTS settings; DROP TABLE IF EXISTS shop_settings; DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS c10_leads; DROP TABLE IF EXISTS c10_businesses;
    DROP TABLE IF EXISTS c10_categories; DROP TABLE IF EXISTS c10_cities;
  `);
  if (old) console.log('\n  Banco atualizado para a nova versão — dados de exemplo recriados.');
}
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS c10_cities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  state       TEXT NOT NULL,
  tagline     TEXT,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#0f766e',
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS c10_categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  icon  TEXT NOT NULL,
  color TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS c10_businesses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id         INTEGER NOT NULL REFERENCES c10_cities(id) ON DELETE CASCADE,
  category_id     INTEGER NOT NULL REFERENCES c10_categories(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  address         TEXT,
  neighborhood    TEXT,
  phone           TEXT,             -- WhatsApp com DDI, só dígitos
  instagram       TEXT,
  hours           TEXT,             -- JSON: { "1": ["08:00","18:00"], ... } (0 = domingo)
  booking_enabled INTEGER NOT NULL DEFAULT 0, -- tem agenda online (sistema de agendamento)
  featured        INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (city_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_c10_biz_city ON c10_businesses(city_id, category_id);

-- Pedidos de cadastro enviados por donos de comércio.
CREATE TABLE IF NOT EXISTS c10_leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  city_id       INTEGER REFERENCES c10_cities(id),
  category_id   INTEGER REFERENCES c10_categories(id),
  business_name TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  phone         TEXT NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'novo', -- novo | contatado | cadastrado | descartado
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Papéis: super (admin geral), city (admin de uma cidade), shop (dono de um comércio com agenda).
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL,
  city_id     INTEGER REFERENCES c10_cities(id),
  business_id INTEGER REFERENCES c10_businesses(id),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

/* ---------- Agendamento: tudo separado por shop_id (= c10_businesses.id) ---------- */

CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id INTEGER NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (shop_id, key)
);

CREATE TABLE IF NOT EXISTS barbers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id        INTEGER NOT NULL,
  name           TEXT NOT NULL,
  phone          TEXT,
  commission_pct REAL NOT NULL DEFAULT 50,
  color          TEXT NOT NULL DEFAULT '#c8a24a',
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS barber_hours (
  barber_id   INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL,          -- 0 = domingo ... 6 = sábado
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  break_start INTEGER,
  break_end   INTEGER,
  PRIMARY KEY (barber_id, weekday)
);

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  duration_min INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1
);

-- Bloqueios: folga, férias, compromisso. barber_id NULL = barbearia inteira.
CREATE TABLE IF NOT EXISTS blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    INTEGER NOT NULL,
  barber_id  INTEGER REFERENCES barbers(id) ON DELETE CASCADE,
  date_start TEXT NOT NULL,
  date_end   TEXT NOT NULL,
  start_min  INTEGER NOT NULL DEFAULT 0,
  end_min    INTEGER NOT NULL DEFAULT 1440,
  reason     TEXT
);

CREATE TABLE IF NOT EXISTS clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  notes      TEXT,
  blocked    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (shop_id, phone)
);

CREATE TABLE IF NOT EXISTS appointments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id     INTEGER NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  barber_id   INTEGER NOT NULL REFERENCES barbers(id),
  service_id  INTEGER NOT NULL REFERENCES services(id),
  client_id   INTEGER NOT NULL REFERENCES clients(id),
  date        TEXT NOT NULL,
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | confirmed | done | cancelled | no_show
  source      TEXT NOT NULL DEFAULT 'online',    -- online | admin
  payment     TEXT,                              -- pix | dinheiro | cartao
  notes       TEXT,
  reminded    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_appt_barber_date ON appointments(barber_id, date);
CREATE INDEX IF NOT EXISTS idx_appt_shop_date ON appointments(shop_id, date);
`);
if (startVersion < BASE_VERSION) db.exec(`PRAGMA user_version = ${BASE_VERSION}`);

/** Migrações em ordem. Cada uma roda uma única vez, dentro de uma transação. */
const MIGRATIONS = [
  {
    version: 3,
    name: 'sessões com prazo de validade',
    sql: `ALTER TABLE sessions ADD COLUMN expires_at TEXT;
          UPDATE sessions SET expires_at = datetime(created_at, '+30 days');
          CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`,
  },
  {
    version: 4,
    name: 'cartão fidelidade',
    sql: `CREATE TABLE loyalty_entries (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id        INTEGER NOT NULL,
            client_id      INTEGER NOT NULL REFERENCES clients(id),
            kind           TEXT NOT NULL,    -- redeem (prêmio usado) | adjust (selos somados/tirados à mão)
            stamps         INTEGER NOT NULL, -- redeem: selos que sobraram no cartão; adjust: selos somados (ou tirados)
            reward         TEXT,
            appointment_id INTEGER REFERENCES appointments(id),
            note           TEXT,
            created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
          );
          CREATE INDEX idx_loyalty_client ON loyalty_entries(client_id, id);`,
  },
];

for (const m of MIGRATIONS) {
  if (db.prepare('PRAGMA user_version').get().user_version >= m.version) continue;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
    db.exec('COMMIT');
    if (startVersion >= BASE_VERSION) console.log(`  Banco atualizado: ${m.name} (versão ${m.version}).`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const DEFAULT_SETTINGS = {
  slot_interval: '15',          // grade de horários (min)
  min_advance_min: '60',        // antecedência mínima para agendar online
  max_days_ahead: '30',         // até quantos dias à frente o cliente pode agendar
  cancel_limit_hours: '2',      // cliente só cancela online até X horas antes
  max_active_per_phone: '2',    // agendamentos futuros simultâneos por telefone
  block_after_no_shows: '3',    // bloqueia agendamento online após X faltas
  // Cartão fidelidade (ver src/loyalty.js)
  loyalty_enabled: '0',
  loyalty_goal: '10',           // atendimentos para ganhar o prêmio
  loyalty_services: '',         // ids dos serviços que contam, separados por vírgula ('' = todos)
  loyalty_min_cents: '0',       // atendimentos abaixo deste valor não contam
  loyalty_reward_type: 'service', // service | percent | other
  loyalty_reward_service: '',
  loyalty_reward_percent: '50',
  loyalty_reward_text: '',
  loyalty_expire_days: '0',     // selos valem por X dias (0 = não vencem)
  loyalty_start: '',            // só contam atendimentos a partir desta data
  loyalty_public: '1',          // mostra o cartão para o cliente na página de agendamento
  reminder_template:
    'Olá {cliente}! Passando para lembrar do seu horário na {barbearia}: {servico} com {barbeiro} em {data} às {hora}. Confirma sua presença? Se não puder vir, cancele pelo link: {link}',
};

/** Configurações da agenda de uma barbearia. Nome, telefone e endereço vêm do cadastro no Cidade 10. */
export function getSettings(shopId) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM shop_settings WHERE shop_id = ?').all(shopId)) out[r.key] = r.value;
  const biz = db.prepare('SELECT name, phone, address, neighborhood FROM c10_businesses WHERE id = ?').get(shopId);
  out.shop_name = biz?.name || '';
  out.shop_phone = biz?.phone || '';
  out.shop_address = biz?.address || '';
  out.shop_neighborhood = biz?.neighborhood || '';
  return out;
}

export function setSetting(shopId, key, value) {
  if (key === 'shop_name' || key === 'shop_phone' || key === 'shop_address') {
    const col = { shop_name: 'name', shop_phone: 'phone', shop_address: 'address' }[key];
    db.prepare(`UPDATE c10_businesses SET ${col} = ? WHERE id = ?`).run(String(value), shopId);
    return;
  }
  db.prepare(`INSERT INTO shop_settings (shop_id, key, value) VALUES (?, ?, ?)
              ON CONFLICT(shop_id, key) DO UPDATE SET value = excluded.value`).run(shopId, key, String(value));
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
