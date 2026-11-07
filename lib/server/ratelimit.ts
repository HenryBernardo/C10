// Limite de tentativas guardado no banco: funciona com várias instâncias (como na Vercel,
// onde cada requisição pode cair num servidor diferente).
import { db } from './db';
import { HttpError } from './util';

interface LimitOptions { max: number; windowMs: number; message: string; count?: boolean }

/** Lança 429 se a chave já atingiu `max` eventos na janela; senão, registra mais um quando `count` for true. */
export async function limit(key: string, { max, windowMs, message, count = true }: LimitOptions) {
  const r = await db().rateLimit.aggregate({
    where: { key, hit_at: { gt: new Date(Date.now() - windowMs) } },
    _count: { _all: true },
    _min: { hit_at: true },
  });
  if (r._count._all >= max) {
    const waitMin = Math.max(1, Math.ceil((r._min.hit_at!.getTime() + windowMs - Date.now()) / 60000));
    throw new HttpError(429, `${message} Tente de novo em ${waitMin} min.`);
  }
  if (count) {
    await db().rateLimit.create({ data: { key } });
    // Faxina de vez em quando para a tabela não crescer sem limite.
    if (Math.random() < 0.02) await db().rateLimit.deleteMany({ where: { hit_at: { lt: new Date(Date.now() - 86_400_000) } } });
  }
}

export async function reset(key: string) {
  await db().rateLimit.deleteMany({ where: { key } });
}

/** IP do visitante. Na Vercel (ou com TRUST_PROXY=1) vem do X-Forwarded-For, que o proxy preenche. */
export function clientIp(headers: Headers): string {
  if (process.env.VERCEL || process.env.TRUST_PROXY === '1') {
    const fwd = (headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return 'local';
}
