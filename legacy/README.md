# Cidade 10

Guia do comércio local, cidade por cidade. Cada cidade tem sua página ("Foz do Iguaçu 10", "Cascavel 10") com busca, categorias, destaques e uma página para cada negócio (WhatsApp, como chegar, Instagram, horário com "aberto agora"). Barbearias podem ter **agenda online própria**.

Não precisa instalar nada além do **Node.js 22.13+** (usa o SQLite embutido do Node, zero dependências).

```bash
npm start
```

Abra http://localhost:3000. Durante o desenvolvimento, use `npm run dev`: o servidor reinicia sozinho quando um arquivo muda.

Variáveis opcionais:

| Variável | Para quê |
|---|---|
| `PORT` | Porta (padrão 3000) |
| `DB_PATH` | Arquivo do banco (padrão `data/barbearia.db`) |
| `ADMIN_PASSWORD` | Senha inicial do admin geral |
| `COOKIE_SECURE=1` | Em produção com HTTPS: cookie de login só por HTTPS + HSTS |
| `TEST_ACCOUNTS=0` | Desliga as contas de teste (`teste1`, `cidade1`, `barbearia1`…) — obrigatório ao publicar |
| `TRUST_PROXY=1` | Atrás de um proxy (Railway, Render, Nginx): usa o IP real do visitante nos limites de tentativas |

Para começar do zero, pare o servidor e apague a pasta `data/` — ela é recriada com dados de exemplo.

## Banco de dados e atualizações

O banco é atualizado por **migrações** (`MIGRATIONS` em `src/db.js`): ao iniciar, o servidor aplica só as que faltam, cada uma uma única vez e sem apagar dados. Para mudar a estrutura, acrescente uma migração nova com o próximo número de versão — nunca edite o esquema base.

Faça backup copiando o arquivo `data/barbearia.db` com o servidor parado.

## Segurança

- Senhas com `scrypt`; login por cookie `HttpOnly` + `SameSite`, sessões expiram em 30 dias.
- Limite de tentativas: login (5 erradas por e-mail a cada 15 min, 30 por IP), agendamentos públicos (10 por hora por IP) e "Cadastre seu negócio" (5 por hora por IP).
- Envios vindos de outros sites são bloqueados (proteção contra CSRF).
- Cabeçalhos de segurança em todas as respostas, incluindo Content Security Policy (sem scripts embutidos no HTML).
- Permissões checadas no servidor: cada usuário só acessa a própria cidade ou o próprio comércio.

## Páginas públicas

| Endereço | Página |
|---|---|
| `/` | Escolha da cidade |
| `/foz-do-iguacu` | Página da cidade (busca com `?q=`) |
| `/foz-do-iguacu/categoria/barbearias` | Categoria dentro da cidade |
| `/foz-do-iguacu/barbearia-navalha-de-ouro` | Página do negócio |
| `/foz-do-iguacu/barbearia-navalha-de-ouro/agendar` | Agendamento online (só comércios com agenda ativada) |
| `/meu-horario?codigo=XXXX` | Cliente consulta, confirma ou cancela o horário |
| `/cadastre-seu-negocio` | Formulário para donos de comércio pedirem cadastro |

As páginas do guia são geradas no servidor (bom para o Google). Os negócios de exemplo são fictícios e os telefones são inválidos de propósito.

## Painéis e acessos

Cada painel tem a sua entrada; **`/entrar`** (botão **Entrar** no topo do guia) mostra a escolha:

| Entrada | Quem entra |
|---|---|
| `/entrar/cidade` | Admin geral e admin da cidade |
| `/entrar/barbearia` | Dono da barbearia |

Uma conta que tentar entrar pela entrada errada recebe um aviso indicando a certa. Cada um só vê o que é dele.

| Tipo | O que faz | Painel |
|---|---|---|
| **Admin geral** | Cria e edita cidades; cria admins de cidade; vê tudo e todos os pedidos | `/painel` (escolhe a cidade no menu) |
| **Admin da cidade** | Cadastra/edita comércios da cidade (destaque, ocultar, horário, ativar agenda online), atende os pedidos de cadastro, cria o acesso dos donos e abre a agenda de qualquer barbearia da cidade | `/painel` |
| **Dono do comércio** | Gerencia a própria agenda: barbeiros, serviços, agenda do dia, lembretes, clientes, financeiro e configurações | `/admin` |

Contas de teste (senha **`1234`** em todas; recriadas a cada start se faltarem):

| Login | Tipo | Entrada |
|---|---|---|
| `teste1`, `teste2`, `teste3` | Admin geral | `/entrar/cidade` |
| `cidade1` | Admin de Foz do Iguaçu | `/entrar/cidade` |
| `cidade2` | Admin de Cascavel | `/entrar/cidade` |
| `barbearia1` | Barbearia Navalha de Ouro (Foz) | `/entrar/barbearia` |
| `barbearia2` | Barbearia Oeste Clube (Cascavel) | `/entrar/barbearia` |

**Antes de publicar**, desligue-as com `TEST_ACCOUNTS=0` (ou `NODE_ENV=production`): elas ficam desativadas e não entram mais.

Logins de exemplo (criados no primeiro start — **troque as senhas**):

| Tipo | E-mail | Senha |
|---|---|---|
| Admin geral | `admin@cidade10.com` | `cidade10admin` |
| Admin de Foz do Iguaçu | `foz@cidade10.com` | `foz12345` |
| Admin de Cascavel | `cascavel@cidade10.com` | `cascavel123` |
| Barbearia Navalha de Ouro (Foz) | `navalha@cidade10.com` | `barbearia123` |
| Barbearia Oeste Clube (Cascavel) | `oeste@cidade10.com` | `barbearia123` |

Fluxo típico de um novo cliente do Cidade 10: o dono preenche "Cadastre seu negócio" → o admin da cidade vê em **Pedidos**, chama no WhatsApp e clica **Cadastrar** → marca "Agenda online" → cria o **acesso** do dono (o painel monta a mensagem com login e senha para enviar) → o dono entra, cadastra barbeiros e serviços e divulga o link de agendamento.

## Agenda online da barbearia

| Dor do barbeiro | Como o sistema resolve |
|---|---|
| Passar o dia respondendo "tem horário?" | Link de agendamento 24h. O cliente escolhe serviço, barbeiro (ou "sem preferência"), dia e horário em 4 passos. |
| Dois clientes no mesmo horário | Disponibilidade calculada a partir do expediente, almoço, folgas e agendamentos; a reserva é revalidada numa transação. |
| Faltas sem aviso | Tela de **Lembretes** com mensagem de WhatsApp pronta e link para o cliente confirmar ou cancelar sozinho; registro de faltas; bloqueio do agendamento online após X faltas. |
| Cliente cancelando em cima da hora | Prazo mínimo de cancelamento online e antecedência mínima para agendar. |
| Agendamentos "fake" | Limite de horários futuros por telefone. |
| Encaixe de quem chega na hora | Clique num espaço vazio da agenda e encaixe o cliente. |
| Folga, férias, feriado | Bloqueios por barbeiro ou para a barbearia toda. |
| Não saber quanto entrou nem a comissão | Financeiro com faturamento, ticket médio, perdas com faltas, serviços, formas de pagamento e comissão por barbeiro. |
| Cliente que sumiu | Filtro "Sumidos (+30 dias)" com botão para chamar de volta no WhatsApp. |
| Fazer o cliente voltar | **Cartão fidelidade** (menu Fidelidade): a cada N atendimentos o cliente ganha um prêmio. |

### Cartão fidelidade

O dono liga e configura tudo em **Fidelidade**, com pré-visualização de como o cliente vê:

- quantos atendimentos para ganhar;
- o prêmio (um serviço grátis, um desconto em % ou outro prêmio escrito à mão);
- quais serviços contam selo;
- valor mínimo do atendimento;
- validade dos selos;
- a partir de que data contar;
- se o cartão aparece para o cliente.

Cada atendimento **concluído** na agenda vira um selo. Para dar o prêmio, use **Usar prêmio** no atendimento (o valor já é ajustado) ou na ficha do cliente. Na ficha também dá para somar ou tirar selos à mão, por exemplo de quem tinha cartão de papel. A tela mostra quem tem prêmio para usar e quem está quase lá, com botão para avisar no WhatsApp. O cliente vê o cartão com os selos na página de agendamento, no "Meu horário" e depois de agendar.

Mudar as regras recalcula os cartões na hora. Os selos que sobram depois de um prêmio continuam valendo: quem tinha 12 num cartão de 10 fica com 2. A Navalha de Ouro já vem com um cartão de exemplo: a cada 5 atendimentos, um corte grátis.

Cada barbearia tem seus próprios barbeiros, serviços, clientes, agenda e configurações — nada é compartilhado entre elas.

## Estrutura

```
server.js                servidor HTTP (API, páginas estáticas e do guia)
src/db.js                esquema SQLite e configurações da agenda
src/seed.js              dados e logins de exemplo
src/users.js             login, sessões e permissões por tipo de usuário
src/router.js            rotas da API e checagem de acesso
src/scheduling.js        regras de disponibilidade, reserva, remarcação e cancelamento
src/routes.js            API de login, agendamento público e painel da barbearia
src/loyalty.js           cartão fidelidade (regras, selos e prêmios)
src/c10/data.js          cidades, categorias e comércios
src/c10/pages.js         páginas do guia
src/c10/admin-routes.js  API do painel do Cidade 10
public/entrar.html       login
public/painel.html       painel do Cidade 10 (admin geral / da cidade)
public/admin.html        painel da barbearia
public/index.html        agendamento do cliente e "Meu horário"
```

## Próximos passos possíveis

- Upload de fotos/logo dos comércios e gerenciamento das categorias pelo painel.
- Envio automático de lembretes pela API oficial do WhatsApp (hoje é com um clique, pelo `wa.me`).
- Sinal/pagamento antecipado via Pix para reduzir faltas.
- Recuperação de senha por e-mail.
- Publicar em um servidor com HTTPS para os clientes acessarem pela internet.
