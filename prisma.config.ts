// Configuração do Prisma CLI (migrações, seed, Studio).
// O Prisma 7 não lê o .env sozinho: carregamos o .env.local aqui.
import { defineConfig } from 'prisma/config';

try { process.loadEnvFile('.env.local'); } catch { /* sem .env.local: usa as variáveis do ambiente (ex.: Vercel) */ }

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrações precisam de conexão direta/sessão (porta 5432). O site usa DATABASE_URL (pooler, porta 6543).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
