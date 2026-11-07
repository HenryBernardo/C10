import { db } from './db';
import { HttpError, hashPassword, verifyPassword, newToken } from './util';
import { limit, reset } from './ratelimit';
import { isTestLogin } from './seed';
import type { Role, SessionUser } from '../types';

export const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'sid';
const LOGIN_WINDOW = 15 * 60 * 1000;

export const ROLES: Record<Role, string> = { super: 'Admin geral', city: 'Admin da cidade', shop: 'Dono do comércio' };

/** Entradas de login: cada uma só aceita os tipos de usuário do seu painel. */
export const LOGIN_AREAS: Record<string, { roles: Role[]; wrong: string }> = {
  cidade: { roles: ['super', 'city'], wrong: 'Esta conta é de uma barbearia. Use a entrada das barbearias.' },
  barbearia: { roles: ['shop'], wrong: 'Esta conta é de administrador do Cidade 10. Use a entrada da cidade.' },
};

const USER_FIELDS = { id: true, name: true, email: true, role: true, city_id: true, business_id: true } as const;

export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return null;
  const s = await db().session.findFirst({
    where: { token, expires_at: { gt: new Date() }, user: { active: true } },
    select: { user: { select: USER_FIELDS } },
  });
  return s ? (s.user as SessionUser) : null;
}

/** Login com limite de tentativas erradas: 5 por e-mail+IP e 30 por IP a cada 15 minutos. */
export async function login(emailRaw: unknown, password: unknown, ip: string, area?: string) {
  const email = String(emailRaw ?? '').trim().toLowerCase();
  const byEmail = `login:${ip}:${email}`;
  const byIp = `login:${ip}`;
  const opts = (max: number, count: boolean) => ({ max, windowMs: LOGIN_WINDOW, message: 'Muitas tentativas de login.', count });
  await limit(byEmail, opts(5, false));
  await limit(byIp, opts(30, false));

  const user = await db().user.findFirst({ where: { email, active: true } });
  // Contas de teste (teste1, cidade1, barbearia1...) ficam desligadas com TEST_ACCOUNTS=0.
  const testOff = process.env.TEST_ACCOUNTS === '0' && isTestLogin(email);
  if (!user || testOff || !(await verifyPassword(String(password ?? ''), user.password))) {
    await limit(byEmail, opts(5, true));
    await limit(byIp, opts(30, true));
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  await reset(byEmail);
  const role = user.role as Role;
  const entry = area ? LOGIN_AREAS[area] : undefined;
  if (entry && !entry.roles.includes(role)) throw new HttpError(403, entry.wrong);

  await db().session.deleteMany({ where: { expires_at: { lte: new Date() } } });
  const token = newToken();
  await db().session.create({ data: { token, user_id: user.id, expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
  return { token, user: { ...user, role } };
}

export async function logout(token: string | undefined) {
  if (token) await db().session.deleteMany({ where: { token } });
}

export async function changePassword(userId: number, current: unknown, next: unknown) {
  const user = await db().user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!(await verifyPassword(String(current ?? ''), user?.password))) throw new HttpError(401, 'Senha atual incorreta.');
  await setPassword(userId, next);
}

export async function setPassword(userId: number, password: unknown) {
  if (String(password ?? '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres.');
  await db().user.update({ where: { id: userId }, data: { password: await hashPassword(String(password)) } });
  await db().session.deleteMany({ where: { user_id: userId } });
}

export async function createUser(u: { name: unknown; email: unknown; password: unknown; role: Role; cityId?: number | null; businessId?: number | null }) {
  const name = String(u.name ?? '').trim();
  const email = String(u.email ?? '').trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Informe nome e um e-mail válido.');
  if (!ROLES[u.role]) throw new HttpError(400, 'Tipo de usuário inválido.');
  if (String(u.password ?? '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres.');
  if (await db().user.findUnique({ where: { email } })) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
  const created = await db().user.create({
    data: { name, email, password: await hashPassword(String(u.password)), role: u.role, city_id: u.cityId ?? null, business_id: u.businessId ?? null },
  });
  return created.id;
}

/** Cidade que o usuário do painel pode gerenciar (admin geral escolhe; admin da cidade só a dele). */
export async function cityScope(user: SessionUser, requested: unknown): Promise<number> {
  if (user.role === 'super') {
    const id = Number(requested);
    if (!id || !(await db().city.findUnique({ where: { id } }))) throw new HttpError(400, 'Escolha a cidade.');
    return id;
  }
  if (user.role === 'city' && user.city_id) return user.city_id;
  throw new HttpError(403, 'Sem permissão.');
}

/**
 * Barbearia em que o usuário está trabalhando no painel de agenda.
 * Dono: sempre a dele. Admin da cidade / geral: a indicada no cabeçalho X-Shop-Id, se estiver no seu escopo.
 */
export async function resolveShop(shopHeader: string | null, user: SessionUser): Promise<number> {
  if (user.role === 'shop') {
    if (!user.business_id || !(await db().business.findFirst({ where: { id: user.business_id, booking_enabled: true } }))) {
      throw new HttpError(403, 'A agenda online deste comércio está desativada. Fale com o Cidade 10.');
    }
    return user.business_id;
  }
  const id = Number(shopHeader);
  const biz = id ? await db().business.findFirst({ where: { id, booking_enabled: true }, select: { city_id: true } }) : null;
  if (!biz) throw new HttpError(400, 'Escolha um comércio com agenda online.');
  if (user.role === 'city' && biz.city_id !== user.city_id) throw new HttpError(403, 'Este comércio é de outra cidade.');
  return id;
}
