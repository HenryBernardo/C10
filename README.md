# Cidade 10

Guia do comércio local, cidade por cidade, com **agenda online para barbearias** (agendamento 24h, lembretes, clientes, financeiro e cartão fidelidade).

**Tecnologias:** Next.js 16 (App Router, React 19, Server Components, Server Actions) · TypeScript · Prisma 7 · PostgreSQL (Supabase) · hospedagem na Vercel.

## Configurar o banco (Supabase)

1. No painel do Supabase, clique em **Connect** (ou Project Settings → Database → Connection string) e copie duas URLs, trocando `[YOUR-PASSWORD]` pela senha do banco:
   - **Transaction pooler** (porta **6543**): é a que o site usa.
   - **Session pooler** (porta **5432**): é a que as migrações do Prisma usam.
2. Na pasta do projeto, crie o arquivo `.env.local` (use o [.env.example](.env.example) como modelo):
   ```
   DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   DIRECT_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ADMIN_PASSWORD=uma-senha-forte
   ```
3. Instale, crie as tabelas e coloque os dados de exemplo:
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```
   O `db:seed` só cria o que falta, então pode rodar de novo sem duplicar nada. Ele cria as cidades e comércios de exemplo, as barbearias com agenda, os logins e as contas de teste. Os exemplos podem ser apagados depois pelo painel.

As tabelas ficam com **Row Level Security** ligado e sem políticas. Assim a API pública do Supabase (chave `anon`) não enxerga nada; só o servidor do site acessa o banco.

## Rodar na sua máquina

Precisa do **Node.js 22 ou mais novo** e do `.env.local` configurado (acima).

```bash
npm run dev
```

Abra http://localhost:3000. Para ver e editar os dados direto no banco, use `npm run db:studio` (abre o Prisma Studio no navegador).

## Publicar na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em https://vercel.com → **Add New → Project** → importe o repositório (a Vercel detecta o Next.js sozinha).
3. Em **Environment Variables**, coloque:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a mesma URL do Transaction pooler do Supabase |
| `ADMIN_PASSWORD` | senha do admin geral (só usada pelo `db:seed`) |
| `TEST_ACCOUNTS` | `1` enquanto estiver testando; **`0` antes de divulgar o site** |

4. Clique em **Deploy**. A cada `git push` a Vercel publica a nova versão. O build já roda o `prisma generate`.

Quando houver uma migração nova (mudança no `prisma/schema.prisma`), rode `npm run db:migrate` com o `.env.local` apontando para o Supabase antes de publicar.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Banco Postgres usado pelo site: Transaction pooler do Supabase, porta 6543. Obrigatória. |
| `DIRECT_URL` | Conexão usada pelas migrações (Session pooler, porta 5432). Só precisa no `.env.local`. |
| `ADMIN_PASSWORD` | Senha inicial do admin geral (`admin@cidade10.com`) criado pelo seed. |
| `TEST_ACCOUNTS=0` | Recusa o login das contas de teste (`teste1`, `cidade1`, `barbearia1`…). |
| `APP_TIME_ZONE` | Fuso das datas e horários (padrão `America/Sao_Paulo`; a Vercel roda em UTC). |

## Logins

Cada painel tem a sua entrada. O botão **Entrar** no topo do guia leva para a escolha:

| Entrada | Quem entra |
|---|---|
| `/entrar/cidade` | Admin geral e admin da cidade |
| `/entrar/barbearia` | Dono da barbearia |

Contas de teste, todas com a senha **`1234`** (desligue com `TEST_ACCOUNTS=0`):

| Login | Tipo |
|---|---|
| `teste1`, `teste2`, `teste3` | Admin geral |
| `cidade1` / `cidade2` | Admin de Foz do Iguaçu / Cascavel |
| `barbearia1` / `barbearia2` | Barbearia Navalha de Ouro (Foz) / Oeste Clube (Cascavel) |

Logins de exemplo criados pelo seed (**troque as senhas**): `admin@cidade10.com` (senha do `ADMIN_PASSWORD`, padrão `cidade10admin`), `foz@cidade10.com` / `foz12345`, `cascavel@cidade10.com` / `cascavel123`, `navalha@cidade10.com` e `oeste@cidade10.com` / `barbearia123`.

## Páginas

| Endereço | Página |
|---|---|
| `/` | Escolha da cidade |
| `/foz-do-iguacu` | Página da cidade (busca com `?q=`) |
| `/foz-do-iguacu/categoria/barbearias` | Categoria dentro da cidade |
| `/foz-do-iguacu/barbearia-navalha-de-ouro` | Página do comércio |
| `/foz-do-iguacu/barbearia-navalha-de-ouro/agendar` | Agendamento online |
| `/meu-horario?codigo=XXXX` | Cliente consulta, confirma ou cancela o horário |
| `/cadastre-seu-negocio` | Pedido de cadastro de um comércio |
| `/painel` | Painel do Cidade 10: comércios, pedidos, acessos e cidades |
| `/admin` | Painel da barbearia: agenda, lembretes, clientes, fidelidade, financeiro e configurações |

As páginas do guia são geradas no servidor, o que é bom para o Google. Os painéis e o agendamento são componentes React que conversam com a API em `/api/*`.

## Agenda online da barbearia

| Dor do barbeiro | Como o sistema resolve |
|---|---|
| Passar o dia respondendo "tem horário?" | Link de agendamento 24h em 4 passos: serviço, barbeiro (ou "sem preferência"), dia/horário e dados. |
| Dois clientes no mesmo horário | Disponibilidade calculada pelo expediente, almoço, folgas e agendamentos; a reserva é revalidada numa transação com trava por barbearia. |
| Faltas sem aviso | Tela de **Lembretes** com mensagem pronta no WhatsApp e link para o cliente confirmar ou cancelar; bloqueio do agendamento online após X faltas. |
| Cancelamento em cima da hora | Prazo mínimo para cancelar online e antecedência mínima para agendar. |
| Agendamentos "fake" | Limite de horários futuros por telefone e de agendamentos por IP. |
| Encaixe de quem chega na hora | Clique num espaço vazio da agenda. |
| Folga, férias, feriado | Bloqueios por barbeiro ou para a barbearia toda. |
| Não saber quanto entrou nem a comissão | Financeiro com faturamento, ticket médio, faltas, serviços, pagamentos e comissão por barbeiro. |
| Cliente que sumiu | Filtro "Sumidos (+30 dias)" com botão para chamar de volta. |
| Fazer o cliente voltar | **Cartão fidelidade** configurável: a cada N atendimentos, um prêmio (serviço grátis, desconto ou outro). |

## Segurança

- Senhas com `scrypt`; sessão em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção, com validade de 30 dias.
- Limite de tentativas guardado no banco (funciona com várias instâncias na Vercel): login (5 erradas por e-mail a cada 15 min), agendamentos públicos (10/h por IP) e cadastro de negócio (5/h por IP).
- Envios vindos de outros sites são bloqueados (CSRF); Server Actions têm a proteção do próprio Next.js.
- Cabeçalhos de segurança e Content Security Policy em todas as respostas (`next.config.ts`).
- Permissões checadas no servidor: cada usuário só acessa a própria cidade ou o próprio comércio.

## Banco de dados

O banco é definido em [prisma/schema.prisma](prisma/schema.prisma) e acessado com o **Prisma Client** (`lib/server/db.ts`, com o adaptador `@prisma/adapter-pg`). As consultas simples usam a API do Prisma. Os relatórios e o cartão fidelidade usam `$queryRaw`, que continua com parâmetros seguros.

Para mudar a estrutura:

1. Edite o `prisma/schema.prisma`.
2. Rode `npm run db:migrate:dev -- --name o-que-mudou`. Isso cria a migração em `prisma/migrations/` e aplica no banco do `.env.local`.
3. Em produção, `npm run db:migrate` aplica as migrações que faltam.

Nunca edite uma migração que já foi aplicada.

Backup: no Supabase, em **Database → Backups** (diário nos planos pagos) ou com `pg_dump` usando a `DIRECT_URL`.

## Estrutura

```
app/(guia)/              páginas públicas do guia e telas de login (Server Components)
app/(app)/               agendamento do cliente e painéis (layout escuro)
app/api/[...path]/       entrada da API; as rotas ficam em lib/server/api
components/              componentes React (guia, agendamento, painel da cidade, painel da barbearia)
lib/server/              servidor: banco, regras da agenda, fidelidade, login, limites, seed
lib/server/api/          rotas da API (pública, painel da barbearia, painel da cidade)
lib/types.ts             tipos compartilhados entre servidor e telas
lib/generated/prisma/    Prisma Client gerado (não vai para o git; o `npm install` e o build geram de novo)
prisma/                  schema.prisma, migrações e seed
styles/                  CSS (guia, painéis, agendamento, login)
legacy/                  versão anterior (Node puro + SQLite), só para consulta, pode ser apagada
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento em http://localhost:3000 |
| `npm run build` / `npm start` | Versão de produção |
| `npm run lint` / `npm run typecheck` | Verifica o código |
| `npm run db:migrate` | Aplica as migrações que faltam (`prisma migrate deploy`) |
| `npm run db:migrate:dev -- --name x` | Cria uma migração nova a partir do `schema.prisma` |
| `npm run db:seed` | Dados de exemplo e contas de teste |
| `npm run db:studio` | Abre o Prisma Studio para ver e editar os dados |
