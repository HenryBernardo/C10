// Acesso ao banco com Prisma (PostgreSQL / Supabase).
// DATABASE_URL: no Supabase, use a URL do "Transaction pooler" (porta 6543) para o site.
//
// db() devolve o cliente do Prisma; dentro de tx() devolve o cliente da transação, então as funções
// chamadas lá dentro (mesmo em outros arquivos) entram na mesma transação sem precisar repassar nada.
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';

export { Prisma };
export const TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Sao_Paulo';

type Db = Prisma.TransactionClient;

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada. Coloque a URL do banco do Supabase no .env.local (e nas variáveis da Vercel).');
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX) || 5 });
  return new PrismaClient({ adapter });
}

// Um cliente por processo (sobrevive ao recarregamento do `next dev`). Criado no primeiro uso,
// para o `next build` não precisar do banco.
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = () => (g.__prisma ??= create());

const txStore = new AsyncLocalStorage<Db>();

export function db(): Db {
  return txStore.getStore() ?? prisma();
}

/** Executa `fn` numa transação; tudo que usar db() lá dentro entra nela. */
export function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn(); // já está numa transação
  return prisma().$transaction((t) => txStore.run(t, fn), { maxWait: 10_000, timeout: 20_000 });
}
