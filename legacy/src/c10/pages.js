// Páginas do Cidade 10, renderizadas no servidor para aparecerem bem no Google
// ("barbearia em Foz do Iguaçu", "restaurantes em Cascavel"...).
import {
  getCities, getCity, getCategories, getCategory, getCityCategories, searchBusinesses, getBusiness,
} from './data.js';
import { icon, categoryIcon } from './icons.js';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const whats = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
const fullAddress = (b, city) => [b.address, b.neighborhood, `${city.name} - ${city.state}`].filter(Boolean).join(', ');
const mapsLink = (b, city) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(b, city))}`;
const initials = (name) => name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function openStatus(hoursJson, now = new Date()) {
  let hours;
  try { hours = JSON.parse(hoursJson || '{}'); } catch { return null; }
  const today = hours[now.getDay()];
  if (!today) return { open: false, label: 'Fechado hoje' };
  const min = now.getHours() * 60 + now.getMinutes();
  const [s, e] = today.map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  if (min >= s && min <= e) return { open: true, label: today[1] === '23:59' && today[0] === '00:00' ? 'Aberto 24h' : `Aberto até ${today[1]}` };
  if (min < s) return { open: false, label: `Abre às ${today[0]}` };
  return { open: false, label: 'Fechado agora' };
}

function layout({ title, description, body, city, mobileBar = '' }) {
  const accent = city?.color || '#0f766e';
  const cities = getCities();
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta name="theme-color" content="${esc(accent)}" />
  <link rel="icon" href="/img/c10.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/c10.css" />
  <style>:root { --accent: ${esc(accent)}; }</style>
</head>
<body class="${mobileBar ? 'has-mobile-bar' : ''}">
  <header class="topbar">
    <div class="container topbar-inner">
      <a href="/" class="logo" aria-label="Cidade 10 — início"><img src="/img/c10.svg" alt="" width="30" height="30" /><span>Cidade<b>10</b></span></a>
      ${city ? `<a href="/${city.slug}" class="city-pill">${icon('pin', 14)}<span>${esc(city.name)}</span></a>` : ''}
      <div class="spacer"></div>
      <details class="city-switch">
        <summary>Cidades ${icon('chevron', 16)}</summary>
        <div class="menu">${cities.map((c) => `<a href="/${c.slug}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}<span class="uf">${c.state}</span></a>`).join('')}</div>
      </details>
      <a href="/entrar" class="login-link" aria-label="Entrar no painel">${icon('user', 16)}<span>Entrar</span></a>
      <a href="/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}" class="btn btn-dark btn-sm hide-sm">Anuncie grátis</a>
    </div>
  </header>
  ${body}
  <footer class="footer">
    <div class="container">
      <div class="footer-inner">
        <div><a href="/" class="logo"><img src="/img/c10.svg" alt="" width="28" height="28" /><span>Cidade<b>10</b></span></a>
          <p>O guia do comércio local, cidade por cidade. Encontre, chame no WhatsApp e agende sem sair de casa.</p></div>
        <div><h4>Cidades</h4>${cities.map((c) => `<a href="/${c.slug}">${esc(c.name)}</a>`).join('')}</div>
        <div><h4>Para negócios</h4><a href="/cadastre-seu-negocio">Cadastre seu negócio</a><a href="/entrar">Entrar no painel</a><a href="/meu-horario">Meu horário</a></div>
      </div>
      <div class="footer-bottom">© ${new Date().getFullYear()} Cidade 10</div>
    </div>
  </footer>
  ${mobileBar}
</body>
</html>`;
}

function businessCard(b, city) {
  const st = openStatus(b.hours);
  return `<a class="biz-card" href="/${city.slug}/${b.slug}" style="--c:${esc(b.category_color)}">
    <div class="biz-cover">
      <div class="biz-badges">
        ${b.featured ? `<span class="tag tag-star">${icon('star', 12)} Destaque</span>` : ''}
        ${b.booking_enabled ? `<span class="tag tag-book">${icon('calendar', 12)} Agenda online</span>` : ''}
      </div>
      <span class="cover-ic">${categoryIcon(b.category_slug, 44)}</span>
    </div>
    <div class="biz-avatar">${esc(initials(b.name))}</div>
    <div class="biz-body">
      <span class="biz-cat">${esc(b.category_name)}</span>
      <h3>${esc(b.name)}</h3>
      <p>${esc(b.description)}</p>
      <div class="biz-foot">
        ${b.neighborhood ? `<span class="meta">${icon('pin', 14)} ${esc(b.neighborhood)}</span>` : ''}
        ${st ? `<span class="status ${st.open ? 'open' : ''}">${st.label}</span>` : ''}
        <span class="go">${icon('arrow', 16)}</span>
      </div>
    </div>
  </a>`;
}

function ctaBlock(city) {
  return `<section class="cta">
    <div>
      <h2>${city ? `Tem um negócio em ${esc(city.name)}?` : 'Tem um negócio?'}</h2>
      <p>Coloque seu comércio no Cidade 10 e seja encontrado por quem está procurando agora.</p>
      <ul>
        <li>${icon('check', 16)} Página própria</li>
        <li>${icon('check', 16)} Botão de WhatsApp</li>
        <li>${icon('check', 16)} Agenda online</li>
      </ul>
    </div>
    <a class="btn btn-light btn-lg" href="/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}">Cadastrar meu negócio ${icon('arrow', 16)}</a>
  </section>`;
}

/** Colagem de cards de destaque no topo da home (só em telas largas). */
function heroArt(cities) {
  const picks = cities.flatMap((c) => searchBusinesses(c.id, { featured: true }).slice(0, 2).map((b) => ({ b, c }))).slice(0, 3);
  if (!picks.length) return '';
  return `<div class="hero-art" aria-hidden="true">${picks.map(({ b, c }, i) => {
    const st = openStatus(b.hours);
    return `<div class="mini mini-${i}" style="--c:${esc(b.category_color)}">
      <div class="biz-avatar">${esc(initials(b.name))}</div>
      <div><b>${esc(b.name)}</b><span>${esc(b.category_name)} · ${esc(c.name)}</span>
        ${st ? `<span class="status ${st.open ? 'open' : ''}">${st.label}</span>` : ''}</div>
      ${b.booking_enabled ? `<span class="mini-tag">${icon('calendar', 13)} Agendar</span>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/* ------------------------------ Páginas ------------------------------ */

function homePage() {
  const cities = getCities();
  const total = cities.reduce((s, c) => s + c.total, 0);
  return layout({
    title: 'Cidade 10 · O guia do comércio da sua cidade',
    description: 'Encontre restaurantes, barbearias, mercados e serviços perto de você. Escolha sua cidade.',
    body: `
    <section class="hero">
      <div class="container hero-split">
       <div>
        <span class="chip">${icon('sparkle', 14)} O guia local da sua cidade</span>
        <h1>Tudo da sua cidade,<br /><span class="grad">em um só lugar.</span></h1>
        <p class="lead">Comércios, serviços e lugares para conhecer — com WhatsApp, horário de funcionamento e agendamento online.</p>
        <div class="stats">
          <div class="stat"><b>${cities.length}</b><span>cidades</span></div>
          <div class="stat"><b>${total}</b><span>comércios</span></div>
          <div class="stat"><b>${getCategories().length}</b><span>categorias</span></div>
        </div>
       </div>
       ${heroArt(cities)}
      </div>
    </section>
    <main class="container section" style="padding-top:8px">
      <div class="sec-head"><div><span class="kicker">Comece por aqui</span><h2>Escolha sua cidade</h2></div></div>
      <div class="city-grid">
        ${cities.map((c) => `<a class="city-card" href="/${c.slug}" style="--accent:${esc(c.color)}">
          <span class="city-uf">${c.state}</span>
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.tagline)}</p>
          <span class="city-count">${c.total} comércios ${icon('arrow', 16)}</span>
        </a>`).join('')}
        <a class="city-card city-card-soon" href="/cadastre-seu-negocio">
          <span class="city-uf">Em breve</span>
          <h3>Sua cidade aqui</h3>
          <p>Quer o Cidade 10 na sua cidade? Fale com a gente.</p>
          <span class="city-count">Saiba mais ${icon('arrow', 16)}</span>
        </a>
      </div>

      <div class="block">
        <div class="sec-head"><div><span class="kicker">Como funciona</span><h2>Do “onde tem?” ao atendimento</h2></div></div>
        <div class="steps3">
          <div class="step3"><div class="n">${icon('search', 20)}</div><h3>Encontre</h3><p>Busque por nome, categoria ou bairro e veja quem está aberto agora.</p></div>
          <div class="step3"><div class="n">${icon('chat', 20)}</div><h3>Chame</h3><p>Fale direto no WhatsApp do comércio ou veja como chegar no mapa.</p></div>
          <div class="step3"><div class="n">${icon('calendar', 20)}</div><h3>Agende</h3><p>Nos comércios com agenda online, marque seu horário em menos de um minuto.</p></div>
        </div>
      </div>

      ${ctaBlock(null)}
    </main>`,
  });
}

function cityPage(city, { category, q }) {
  const cats = getCityCategories(city.id);
  const list = searchBusinesses(city.id, { categoryId: category?.id, q });
  const featured = !category && !q ? searchBusinesses(city.id, { featured: true }) : [];
  const total = cats.reduce((s, c) => s + c.total, 0);
  const openNow = searchBusinesses(city.id).filter((b) => openStatus(b.hours)?.open).length;
  const heading = category ? `${category.name} em ${city.name}` : q ? `Resultados para “${q}”` : 'Todos os comércios';
  const action = category ? `/${city.slug}/categoria/${category.slug}` : `/${city.slug}`;
  const popular = [...cats].sort((a, b) => b.total - a.total).slice(0, 4);

  return layout({
    city,
    title: category ? `${category.name} em ${city.name} - ${city.state} · Cidade 10` : `${city.name} 10 · Comércios de ${city.name} - ${city.state}`,
    description: category
      ? `Encontre ${category.name.toLowerCase()} em ${city.name}: endereço, WhatsApp e horário de funcionamento.`
      : `${city.description} ${total} negócios cadastrados.`,
    body: `
    <section class="hero">
      <div class="container">
        <span class="chip">${icon('pin', 14)} ${esc(city.name)} · ${city.state}</span>
        <h1>${esc(city.name)}<span class="ten">10</span></h1>
        <p class="lead">${esc(city.tagline)}</p>
        <form class="search" action="${action}" method="get" role="search">
          ${icon('search', 20)}
          <input name="q" value="${esc(q || '')}" placeholder="${category ? `Buscar em ${esc(category.name.toLowerCase())}…` : 'Pizza, barbearia, farmácia…'}" aria-label="Buscar" />
          <button class="btn btn-accent">Buscar</button>
        </form>
        <div class="quick"><span>Populares:</span>${popular.map((c) => `<a href="/${city.slug}/categoria/${c.slug}">${esc(c.name)}</a>`).join('')}</div>
        <div class="stats">
          <div class="stat"><b>${total}</b><span>comércios</span></div>
          <div class="stat"><b>${openNow}</b><span>abertos agora</span></div>
          <div class="stat"><b>${cats.length}</b><span>categorias</span></div>
        </div>
      </div>
    </section>

    <main class="container" style="padding-bottom:72px">
      <div class="cats-wrap">
        <nav class="cats" aria-label="Categorias">
          <a href="/${city.slug}" class="cat ${!category ? 'active' : ''}"><span class="cat-icon">${icon('grid', 17)}</span>Todos <small>${total}</small></a>
          ${cats.map((c) => `<a href="/${city.slug}/categoria/${c.slug}" class="cat ${category?.id === c.id ? 'active' : ''}" style="--c:${esc(c.color)}">
            <span class="cat-icon">${categoryIcon(c.slug, 17)}</span>${esc(c.name)} <small>${c.total}</small></a>`).join('')}
        </nav>
      </div>

      ${featured.length ? `
      <section class="block" style="margin-top:36px">
        <div class="sec-head"><div><span class="kicker">Selecionados</span><h2>Destaques em ${esc(city.name)}</h2></div></div>
        <div class="biz-grid">${featured.map((b) => businessCard(b, city)).join('')}</div>
      </section>` : ''}

      <section class="block" style="${featured.length ? '' : 'margin-top:36px'}">
        <div class="sec-head">
          <div>${category || q ? '<span class="kicker">Resultados</span>' : '<span class="kicker">Guia completo</span>'}<h2>${esc(heading)}</h2></div>
          <span class="muted">${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}</span>
        </div>
        ${list.length
          ? `<div class="biz-grid">${list.map((b) => businessCard(b, city)).join('')}</div>`
          : `<div class="empty">${icon('search', 28)}<p>Nada encontrado por aqui.</p><a class="btn" href="/${city.slug}">Ver todos os comércios</a></div>`}
      </section>

      ${ctaBlock(city)}
    </main>`,
  });
}

function businessPage(city, b) {
  const st = openStatus(b.hours);
  let hours = {};
  try { hours = JSON.parse(b.hours || '{}'); } catch { /* sem horário */ }
  const today = new Date().getDay();
  const related = searchBusinesses(city.id, { categoryId: b.category_id }).filter((x) => x.id !== b.id).slice(0, 3);
  const bookingHref = `/${city.slug}/${b.slug}/agendar`;
  const whatsHref = b.phone ? whats(b.phone, `Olá! Vi o ${b.name} no Cidade 10 e gostaria de mais informações.`) : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.name,
    description: b.description,
    address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: city.name, addressRegion: city.state, addressCountry: 'BR' },
    ...(b.phone && { telephone: `+${b.phone}` }),
  };

  const mobileBar = `<div class="mobile-bar">
    ${b.booking_enabled ? `<a class="btn btn-accent" href="${bookingHref}">${icon('calendar', 16)} Agendar</a>` : ''}
    ${whatsHref ? `<a class="btn btn-whats" target="_blank" rel="noopener" href="${whatsHref}">${icon('chat', 16)} WhatsApp</a>` : ''}
    <a class="btn" target="_blank" rel="noopener" href="${mapsLink(b, city)}">${icon('route', 16)}${b.booking_enabled && whatsHref ? '' : ' Rota'}</a>
  </div>`;

  return layout({
    city,
    mobileBar,
    title: `${b.name} · ${b.category_name} em ${city.name} · Cidade 10`,
    description: `${b.description || ''} ${b.address || ''}, ${b.neighborhood || ''} - ${city.name}.`,
    body: `
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
    <section class="biz-hero" style="--c:${esc(b.category_color)}">
      <div class="biz-banner">
        <nav class="crumbs" aria-label="Navegação"><div class="container">
          <a href="/${city.slug}">${esc(city.name)}</a> <span>/</span> <a href="/${city.slug}/categoria/${b.category_slug}">${esc(b.category_name)}</a>
        </div></nav>
        <span class="big-ic">${categoryIcon(b.category_slug, 260)}</span>
      </div>
      <div class="container">
        <div class="biz-head">
          <div class="biz-avatar lg">${esc(initials(b.name))}</div>
          <div>
            <h1>${esc(b.name)}</h1>
            <div class="chips">
              <span class="chip">${categoryIcon(b.category_slug, 14)} ${esc(b.category_name)}</span>
              ${b.neighborhood ? `<span class="chip">${icon('pin', 14)} ${esc(b.neighborhood)}</span>` : ''}
              ${st ? `<span class="chip"><span class="status ${st.open ? 'open' : ''}">${st.label}</span></span>` : ''}
              ${b.featured ? `<span class="chip">${icon('star', 14)} Destaque</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    </section>

    <main class="container biz-layout" style="padding-bottom:72px">
      <div>
        ${b.description ? `<div class="panel"><h2>Sobre</h2><p>${esc(b.description)}</p></div>` : ''}
        <div class="panel">
          <h2>${icon('clock', 20)} Horário de funcionamento</h2>
          <table class="hours">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<tr class="${d === today ? 'today' : ''}">
            <td>${WEEKDAYS[d]}</td>
            <td>${hours[d] ? (hours[d][0] === '00:00' && hours[d][1] === '23:59' ? '24 horas' : `${hours[d][0]} – ${hours[d][1]}`) : '<span class="muted">Fechado</span>'}</td>
          </tr>`).join('')}</table>
        </div>
        ${b.address ? `<div class="panel">
          <h2>${icon('pin', 20)} Localização</h2>
          <div class="map"><iframe title="Mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            src="https://maps.google.com/maps?q=${encodeURIComponent(fullAddress(b, city))}&z=15&output=embed"></iframe></div>
        </div>` : ''}
        ${related.length ? `<section class="block" style="margin-top:36px">
          <div class="sec-head"><div><span class="kicker">Veja também</span><h2>Outros em ${esc(b.category_name.toLowerCase())}</h2></div></div>
          <div class="biz-grid">${related.map((r) => businessCard(r, city)).join('')}</div></section>` : ''}
      </div>

      <aside>
        <div class="panel sticky">
          <div class="side-title">${b.booking_enabled ? 'Agende seu horário' : 'Fale com o comércio'}</div>
          <p class="side-sub">${b.booking_enabled ? 'Escolha o serviço, o profissional e o horário em menos de um minuto.' : 'Tire dúvidas, faça pedidos ou peça orçamento.'}</p>
          ${b.booking_enabled ? `<a class="btn btn-accent btn-block btn-lg" href="${bookingHref}">${icon('calendar', 18)} Agendar online</a>` : ''}
          ${whatsHref ? `<a class="btn btn-whats btn-block" target="_blank" rel="noopener" href="${whatsHref}">${icon('chat', 17)} Chamar no WhatsApp</a>` : ''}
          <a class="btn btn-block" target="_blank" rel="noopener" href="${mapsLink(b, city)}">${icon('route', 17)} Como chegar</a>
          ${b.instagram ? `<a class="btn btn-block" target="_blank" rel="noopener" href="https://instagram.com/${esc(b.instagram)}">${icon('instagram', 17)} @${esc(b.instagram)}</a>` : ''}
          ${b.address ? `<div class="address">${icon('pin', 18)}<div><b>${esc(b.address)}</b>${esc(b.neighborhood || '')} · ${esc(city.name)} - ${city.state}</div></div>` : ''}
        </div>
      </aside>
    </main>`,
  });
}

function signupPage(cityCurrent, sent) {
  const cities = getCities();
  const cats = getCategories();
  return layout({
    city: cityCurrent,
    title: 'Cadastre seu negócio · Cidade 10',
    description: 'Coloque seu comércio no Cidade 10 e seja encontrado por quem está na sua cidade.',
    body: `
    <section class="hero" style="padding-bottom:40px">
      <div class="container">
        <span class="chip">${icon('store', 14)} Para negócios</span>
        <h1>Seu negócio<br /><span class="grad">no Cidade 10.</span></h1>
        <p class="lead">Apareça para quem está procurando na sua cidade e receba clientes pelo WhatsApp.</p>
      </div>
    </section>
    <main class="container narrow" style="padding-bottom:72px">
      <div class="signup">
        <ul class="perks">
          <li><span class="n">${icon('store', 20)}</span><div><b>Página própria</b><span>Endereço, horário, Instagram e “aberto agora” num link fácil de divulgar.</span></div></li>
          <li><span class="n">${icon('chat', 20)}</span><div><b>Clientes no WhatsApp</b><span>Um toque e o cliente já está falando com você.</span></div></li>
          <li><span class="n">${icon('calendar', 20)}</span><div><b>Agenda online</b><span>Para barbearias e salões: agendamento 24h, lembretes e controle financeiro.</span></div></li>
          <li><span class="n">${icon('search', 20)}</span><div><b>Encontrado no Google</b><span>Páginas feitas para aparecer em buscas como “barbearia em ${esc(cityCurrent?.name || 'Foz do Iguaçu')}”.</span></div></li>
        </ul>
        ${sent ? `<div class="panel success"><div class="check">${icon('check', 30)}</div><h2>Recebemos seu cadastro!</h2>
          <p class="muted">Nossa equipe vai falar com você pelo WhatsApp em breve.</p>
          <a class="btn" href="/${cityCurrent?.slug || ''}">Voltar ao guia</a></div>` : `
        <form class="panel form" method="post" action="/cadastre-seu-negocio">
          <h2 style="margin-bottom:0">Conte sobre seu negócio</h2>
          <p class="muted" style="margin-top:-8px;font-size:14px">Leva 1 minuto. A gente entra em contato.</p>
          <label>Nome do negócio<input name="business_name" required maxlength="100" placeholder="Ex.: Barbearia do Zé" /></label>
          <div class="row2">
            <label>Cidade<select name="city">${cities.map((c) => `<option value="${c.slug}" ${cityCurrent?.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              <option value="">Outra cidade</option></select></label>
            <label>Categoria<select name="category">${cats.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select></label>
          </div>
          <div class="row2">
            <label>Seu nome<input name="contact_name" required maxlength="80" autocomplete="name" /></label>
            <label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(45) 99999-9999" maxlength="20" /></label>
          </div>
          <label>Mensagem (opcional)<textarea name="message" rows="3" maxlength="500" placeholder="Ex.: quero agenda online para minha barbearia"></textarea></label>
          <button class="btn btn-accent btn-lg">Enviar cadastro ${icon('arrow', 16)}</button>
        </form>`}
      </div>
    </main>`,
  });
}

function notFound(city) {
  return {
    status: 404,
    html: layout({
      city,
      title: 'Página não encontrada · Cidade 10',
      description: 'Página não encontrada.',
      body: `<main class="container section"><div class="empty">${icon('search', 32)}<h1>Ops, não achamos essa página.</h1>
        <a class="btn btn-accent" href="/${city?.slug || ''}">Voltar</a></div></main>`,
    }),
  };
}

/** Retorna { status, html } para rotas do Cidade 10, ou null se não for uma delas. */
export function renderC10(pathname, query) {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const q = (query.get('q') || '').trim().slice(0, 80);

  if (parts.length === 0) return { status: 200, html: homePage() };
  if (parts[0] === 'cadastre-seu-negocio' && parts.length === 1) {
    return { status: 200, html: signupPage(getCity(query.get('cidade') || ''), query.has('enviado')) };
  }

  const city = getCity(parts[0]);
  if (!city) return notFound(null);
  if (parts.length === 1) return { status: 200, html: cityPage(city, { q }) };
  if (parts.length === 3 && parts[1] === 'categoria') {
    const category = getCategory(parts[2]);
    return category ? { status: 200, html: cityPage(city, { category, q }) } : notFound(city);
  }
  if (parts.length === 2) {
    const biz = getBusiness(city.id, parts[1]);
    return biz ? { status: 200, html: businessPage(city, biz) } : notFound(city);
  }
  return notFound(city);
}
