import { currentUser, resolveShop } from './users.js';
import { HttpError } from './scheduling.js';

const routes = [];

/**
 * auth: undefined (público) | 'user' (qualquer logado) | 'shop' (painel de uma barbearia)
 *       | 'panel' (admin da cidade ou geral) | 'super' (só admin geral)
 */
export function route(method, path, handler, { auth } = {}) {
  const keys = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, pattern, keys, handler, auth });
}

export function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.pattern);
    if (m) return { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** Checa login/permissão e completa o contexto da rota (user, shopId). */
export function authorize(r, req, ctx) {
  ctx.user = currentUser(req);
  if (!r.auth) return;
  if (!ctx.user) throw new HttpError(401, 'Faça login novamente.');
  const role = ctx.user.role;
  if (r.auth === 'shop') ctx.shopId = resolveShop(req, ctx.user);
  if (r.auth === 'panel' && role !== 'super' && role !== 'city') throw new HttpError(403, 'Sem permissão.');
  if (r.auth === 'super' && role !== 'super') throw new HttpError(403, 'Só o admin geral pode fazer isso.');
}
