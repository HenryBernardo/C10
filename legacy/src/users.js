import { db } from './db.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';
import { HttpError } from './scheduling.js';
import { limit, reset } from './ratelimit.js';

export const SESSION_DAYS = 30;
const LOGIN_WINDOW = 15 * 60 * 1000;

export const ROLES = { super: 'Admin geral', city: 'Admin da cidade', shop: 'Dono do comércio' };

/** Entradas de login: cada uma só aceita os tipos de usuário do seu painel. */
export const LOGIN_AREAS = {
  cidade: { roles: ['super', 'city'], wrong: 'Esta conta é de uma barbearia. Use a entrada das barbearias.' },
  barbearia: { roles: ['shop'], wrong: 'Esta conta é de administrador do Cidade 10. Use a entrada da cidade.' },
};
const tokenFrom = (req) => (req.headers.cookie || '').match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];

export function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.name, u.email, u.role, u.city_id, u.business_id FROM sessions s
                     JOIN users u ON u.id = s.user_id
                     WHERE s.token = ? AND u.active = 1 AND s.expires_at > datetime('now', 'localtime')`).get(token) || null;
}

/**
 * Login com limite de tentativas erradas: 5 por e-mail+IP e 30 por IP a cada 15 minutos,
 * para dificultar quem tenta adivinhar senhas.
 */
export function login(email, password, ip, area) {
  email = String(email || '').trim().toLowerCase();
  const byEmail = { key: `login:${ip}:${email}`, max: 5 };
  const byIp = { key: `login:${ip}`, max: 30 };
  const opts = (r, count) => ({ max: r.max, windowMs: LOGIN_WINDOW, message: 'Muitas tentativas de login.', count });
  limit(byEmail.key, opts(byEmail, false));
  limit(byIp.key, opts(byIp, false));

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user || !verifyPassword(String(password || ''), user.password)) {
    limit(byEmail.key, opts(byEmail, true));
    limit(byIp.key, opts(byIp, true));
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  reset(byEmail.key);
  const entry = LOGIN_AREAS[area];
  if (entry && !entry.roles.includes(user.role)) throw new HttpError(403, entry.wrong);

  db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now', 'localtime')`).run();
  const token = newToken();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', 'localtime', '+${SESSION_DAYS} days'))`)
    .run(token, user.id);
  return { token, user };
}

export function logout(req) {
  const token = tokenFrom(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function changePassword(userId, current, next) {
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
  if (!verifyPassword(String(current || ''), user.password)) throw new HttpError(401, 'Senha atual incorreta.');
  setPassword(userId, next);
}

export function setPassword(userId, password) {
  if (String(password || '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres.');
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function createUser({ name, email, password, role, cityId = null, businessId = null }) {
  name = String(name || '').trim();
  email = String(email || '').trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Informe nome e um e-mail válido.');
  if (!ROLES[role]) throw new HttpError(400, 'Tipo de usuário inválido.');
  if (String(password || '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
  const r = db.prepare('INSERT INTO users (name, email, password, role, city_id, business_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, email, hashPassword(password), role, cityId, businessId);
  return Number(r.lastInsertRowid);
}

/** Cidade que o usuário do painel pode gerenciar (admin geral escolhe; admin da cidade só a dele). */
export function cityScope(user, requested) {
  if (user.role === 'super') {
    const id = Number(requested);
    if (!id || !db.prepare('SELECT 1 FROM c10_cities WHERE id = ?').get(id)) throw new HttpError(400, 'Escolha a cidade.');
    return id;
  }
  if (user.role === 'city') return user.city_id;
  throw new HttpError(403, 'Sem permissão.');
}

/**
 * Barbearia em que o usuário está trabalhando no painel de agenda.
 * Dono: sempre a dele. Admin da cidade / geral: a indicada no cabeçalho X-Shop-Id, se estiver no seu escopo.
 */
export function resolveShop(req, user) {
  if (user.role === 'shop') {
    const ok = db.prepare('SELECT 1 FROM c10_businesses WHERE id = ? AND booking_enabled = 1').get(user.business_id);
    if (!ok) throw new HttpError(403, 'A agenda online deste comércio está desativada. Fale com o Cidade 10.');
    return user.business_id;
  }
  const id = Number(req.headers['x-shop-id']);
  const biz = id && db.prepare('SELECT city_id FROM c10_businesses WHERE id = ? AND booking_enabled = 1').get(id);
  if (!biz) throw new HttpError(400, 'Escolha um comércio com agenda online.');
  if (user.role === 'city' && biz.city_id !== user.city_id) throw new HttpError(403, 'Este comércio é de outra cidade.');
  return id;
}
