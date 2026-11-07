// Limite de tentativas em memória (suficiente para um servidor só).
// Conta eventos por chave numa janela de tempo e bloqueia ao passar do máximo.
import { HttpError } from './scheduling.js';

const buckets = new Map();

/** Lança 429 se a chave já atingiu `max` eventos na janela; senão, registra mais um quando `count` for true. */
export function limit(key, { max, windowMs, message, count = true }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const waitMin = Math.ceil((windowMs - (now - hits[0])) / 60000);
    throw new HttpError(429, `${message} Tente de novo em ${waitMin} min.`);
  }
  if (count) hits.push(now);
  buckets.set(key, hits);
}

export function reset(key) {
  buckets.delete(key);
}

/** IP do cliente (usa X-Forwarded-For só se TRUST_PROXY=1, ou seja, atrás de um proxy confiável). */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'desconhecido';
}

// Limpa chaves antigas de tempos em tempos para não crescer sem limite.
setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) if (!hits.some((t) => now - t < 60 * 60 * 1000)) buckets.delete(k);
}, 10 * 60 * 1000).unref();
