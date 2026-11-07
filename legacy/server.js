import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import './src/seed.js';
import './src/routes.js';
import './src/c10/admin-routes.js';
import { matchRoute, authorize } from './src/router.js';
import { renderC10 } from './src/c10/pages.js';
import { createLead, getCity, getCategory, getBusiness } from './src/c10/data.js';
import { normalizePhone } from './src/scheduling.js';
import { limit, clientIp } from './src/ratelimit.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// Rotas "bonitas" para as páginas estáticas. O resto é do Cidade 10.
const PAGES = {
  '/entrar': 'entrar.html', '/entrar/cidade': 'entrar.html', '/entrar/barbearia': 'entrar.html', '/painel': 'painel.html', '/admin': 'admin.html', '/meu-horario': 'index.html' };

// Cabeçalhos de segurança em todas as respostas. A CSP só libera o próprio site,
// as fontes do Google e o mapa do Google embutido na página do comércio.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    'frame-src https://maps.google.com https://www.google.com',
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
  ...(process.env.COOKIE_SECURE === '1' && { 'Strict-Transport-Security': 'max-age=31536000' }),
};

/**
 * Bloqueia envios (POST/PUT/PATCH/DELETE) vindos de outros sites — proteção contra CSRF
 * em cima do cookie SameSite. Navegadores sempre mandam Origin/Sec-Fetch-Site nesses casos.
 */
function isCrossSite(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return true;
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return Boolean(origin);
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

function leadError(res, status, message) {
  sendHtml(res, status, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cadastro · Cidade 10</title><link rel="stylesheet" href="/css/c10.css" /></head>
    <body><main class="container section"><div class="empty"><h1>Quase lá</h1><p>${message}</p>
    <a class="btn btn-accent" href="/cadastre-seu-negocio">Voltar ao formulário</a></div></main></body></html>`);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': MIME['.html'] });
  res.end(html);
}

/** Formulário "Cadastre seu negócio" (HTML puro, funciona sem JavaScript). */
async function handleLead(req, res) {
  try {
    limit(`lead:${clientIp(req)}`, { max: 5, windowMs: 60 * 60 * 1000, message: 'Muitos cadastros enviados daqui.' });
  } catch (err) {
    return leadError(res, 429, err.message);
  }
  const form = new URLSearchParams(await readRaw(req));
  const field = (k, max) => String(form.get(k) || '').trim().slice(0, max);
  const city = getCity(field('city', 80));
  const lead = {
    cityId: city?.id,
    categoryId: getCategory(field('category', 80))?.id,
    businessName: field('business_name', 100),
    contactName: field('contact_name', 80),
    phone: normalizePhone(field('phone', 20)),
    message: field('message', 500),
  };
  if (!lead.businessName || !lead.contactName || lead.phone.length < 12) {
    return leadError(res, 400, 'Preencha o nome do negócio, seu nome e um WhatsApp válido com DDD.');
  }
  createLead(lead);
  res.writeHead(303, { Location: `/cadastre-seu-negocio?enviado=1${city ? `&cidade=${city.slug}` : ''}` });
  res.end();
}

/** /:cidade/:comercio/agendar — página de agendamento de um comércio com agenda online. */
async function serveBooking(res, pathname) {
  const m = pathname.match(/^\/([^/]+)\/([^/]+)\/agendar$/);
  if (!m) return false;
  const city = getCity(decodeURIComponent(m[1]));
  const biz = city && getBusiness(city.id, decodeURIComponent(m[2]));
  if (!biz?.booking_enabled) return false;
  const html = await readFile(join(PUBLIC_DIR, 'index.html'), 'utf8');
  sendHtml(res, 200, html.replace('<body>', `<body data-shop="${biz.id}">`));
  return true;
}

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1e6) throw Object.assign(new Error('Corpo da requisição muito grande.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readBody(req) {
  const raw = await readRaw(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

async function serveStatic(res, pathname) {
  const file = PAGES[pathname] || pathname.slice(1);
  const full = normalize(join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) return false;
  try {
    if (!(await stat(full)).isFile()) return false;
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(await readFile(full));
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    if (isCrossSite(req)) return sendJson(res, 403, { error: 'Envio bloqueado: origem não permitida.' });
    if (url.pathname.startsWith('/api/')) {
      const r = matchRoute(req.method, url.pathname);
      if (!r) return sendJson(res, 404, { error: 'Rota não encontrada.' });
      const ctx = { params: r.params, query: url.searchParams, res };
      authorize(r, req, ctx);
      ctx.body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const result = await r.handler(req, ctx);
      return sendJson(res, 200, result ?? { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/cadastre-seu-negocio') return await handleLead(req, res);
    if (req.method === 'GET' && (await serveStatic(res, url.pathname))) return;
    if (req.method === 'GET' && (await serveBooking(res, url.pathname))) return;
    if (req.method === 'GET') {
      const page = renderC10(url.pathname, url.searchParams);
      if (page) return sendHtml(res, page.status, page.html);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada');
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    sendJson(res, status, { error: status === 500 ? 'Erro interno. Tente novamente.' : err.message });
  }
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  A porta ${PORT} já está em uso (o sistema já está rodando em outra janela?).`);
  console.error('  Feche a outra janela ou use outra porta:  $env:PORT=3001; npm start\n');
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`  Cidade 10:           http://localhost:${PORT}`);
  console.log(`  Painel da cidade:    http://localhost:${PORT}/entrar/cidade`);
  console.log(`  Painel da barbearia: http://localhost:${PORT}/entrar/barbearia`);
});
