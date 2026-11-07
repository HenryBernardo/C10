// Mini-roteador da API. Todas as rotas /api/* passam por app/api/[...path]/route.ts, que chama handle().
// Cada rota declara o nível de acesso: público, 'user' (logado), 'shop' (painel de uma barbearia),
// 'panel' (admin da cidade ou geral) ou 'super' (só admin geral).
import { HttpError } from '../util';
import { userFromToken, resolveShop, SESSION_COOKIE } from '../users';
import { clientIp } from '../ratelimit';
import type { SessionUser } from '../../types';

// O corpo vem do navegador: cada rota valida e converte o que usa.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Body = Record<string, any>;

export interface Ctx {
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Body;
  user: SessionUser | null;
  shopId: number;
  ip: string;
  token: string | undefined;
  setCookies: string[];
}
export interface AuthedCtx extends Ctx { user: SessionUser }

type Auth = 'user' | 'shop' | 'panel' | 'super';
type Handler = (ctx: AuthedCtx) => unknown;
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; auth?: Auth }

const routes: Route[] = [];

export function route(method: string, path: string, handler: Handler, auth?: Auth) {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, pattern, keys, handler, auth });
}

function match(method: string, pathname: string) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.pattern);
    if (m) return { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

const readCookie = (req: Request, name: string) =>
  (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];

/** Bloqueia envios feitos por outros sites (CSRF): só aceita POST/PUT/PATCH/DELETE do próprio domínio. */
function isCrossSite(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  if (req.headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

const json = (status: number, data: unknown, cookies: string[] = []) => {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(data), { status, headers });
};

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (isCrossSite(req)) throw new HttpError(403, 'Requisição bloqueada.');
    const found = match(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'Rota não encontrada.');

    let body: Body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const text = await req.text();
      if (text.length > 1_000_000) throw new HttpError(413, 'Corpo da requisição muito grande.');
      try { body = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'JSON inválido.'); }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'JSON inválido.');
    }

    const token = readCookie(req, SESSION_COOKIE);
    const ctx: Ctx = {
      req, params: found.params, query: url.searchParams, body, token,
      user: await userFromToken(token), shopId: 0, ip: clientIp(req.headers), setCookies: [],
    };
    const { auth } = found.r;
    if (auth) {
      if (!ctx.user) throw new HttpError(401, 'Faça login novamente.');
      const role = ctx.user.role;
      if (auth === 'shop') ctx.shopId = await resolveShop(req.headers.get('x-shop-id'), ctx.user);
      if (auth === 'panel' && role !== 'super' && role !== 'city') throw new HttpError(403, 'Sem permissão.');
      if (auth === 'super' && role !== 'super') throw new HttpError(403, 'Só o admin geral pode fazer isso.');
    }
    const data = await found.r.handler(ctx as AuthedCtx);
    return json(200, data ?? { ok: true }, ctx.setCookies);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: 'Erro interno. Tente de novo.' });
  }
}
