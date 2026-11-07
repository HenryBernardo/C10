// Dados de exemplo (cidades, comércios, barbearias, logins e contas de teste).
// Uso: `npm run db:seed` — só cria o que está faltando, pode rodar de novo sem duplicar.
import { seedIfEmpty } from '../lib/server/seed';
import { prisma } from '../lib/server/db';

try { process.loadEnvFile('.env.local'); } catch { /* sem .env.local: usa o ambiente */ }

async function main() {
  await seedIfEmpty(true);
  await prisma().$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
