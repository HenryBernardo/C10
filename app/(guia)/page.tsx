import { Suspense, type CSSProperties } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { getCategories, getCities, searchBusinesses, openStatus } from '@/lib/server/c10';
import { nowMin, todayWeekday } from '@/lib/server/time';
import { Shell, ShellSkeleton } from '@/components/guide/Shell';
import { Cta } from '@/components/guide/BizCard';
import { Icon } from '@/components/Icon';
import { initials } from '@/lib/format';

export default function HomePage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  await connection();
  const [cities, categories] = await Promise.all([getCities(), getCategories()]);
  const total = cities.reduce((s, c) => s + (c.total ?? 0), 0);
  const wd = todayWeekday();
  const now = nowMin();
  // Colagem de cards de destaque no topo (só em telas largas).
  const picks = (await Promise.all(cities.map(async (c) => (await searchBusinesses(c.id, { featured: true })).slice(0, 2).map((b) => ({ b, c })))))
    .flat().slice(0, 3);

  return (
    <Shell>
      <section className="hero">
        <div className="container hero-split">
          <div>
            <span className="chip"><Icon name="sparkle" size={14} /> O guia local da sua cidade</span>
            <h1>Tudo da sua cidade,<br /><span className="grad">em um só lugar.</span></h1>
            <p className="lead">Comércios, serviços e lugares para conhecer — com WhatsApp, horário de funcionamento e agendamento online.</p>
            <div className="stats">
              <div className="stat"><b>{cities.length}</b><span>cidades</span></div>
              <div className="stat"><b>{total}</b><span>comércios</span></div>
              <div className="stat"><b>{categories.length}</b><span>categorias</span></div>
            </div>
          </div>
          {picks.length > 0 && (
            <div className="hero-art" aria-hidden="true">
              {picks.map(({ b, c }, i) => {
                const st = openStatus(b.hours, wd, now);
                return (
                  <div key={b.id} className={`mini mini-${i}`} style={{ '--c': b.category_color } as CSSProperties}>
                    <div className="biz-avatar">{initials(b.name)}</div>
                    <div>
                      <b>{b.name}</b><span>{b.category_name} · {c.name}</span>
                      <span className={`status ${st.open ? 'open' : ''}`}>{st.label}</span>
                    </div>
                    {b.booking_enabled && <span className="mini-tag"><Icon name="calendar" size={13} /> Agendar</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <main className="container section" style={{ paddingTop: 8 }}>
        <div className="sec-head"><div><span className="kicker">Comece por aqui</span><h2>Escolha sua cidade</h2></div></div>
        <div className="city-grid">
          {cities.map((c) => (
            <Link key={c.id} className="city-card" href={`/${c.slug}`} style={{ '--accent': c.color } as CSSProperties}>
              <span className="city-uf">{c.state}</span>
              <h3>{c.name}</h3>
              <p>{c.tagline}</p>
              <span className="city-count">{c.total} comércios <Icon name="arrow" size={16} /></span>
            </Link>
          ))}
          <Link className="city-card city-card-soon" href="/cadastre-seu-negocio">
            <span className="city-uf">Em breve</span>
            <h3>Sua cidade aqui</h3>
            <p>Quer o Cidade 10 na sua cidade? Fale com a gente.</p>
            <span className="city-count">Saiba mais <Icon name="arrow" size={16} /></span>
          </Link>
        </div>

        <div className="block">
          <div className="sec-head"><div><span className="kicker">Como funciona</span><h2>Do “onde tem?” ao atendimento</h2></div></div>
          <div className="steps3">
            <div className="step3"><div className="n"><Icon name="search" size={20} /></div><h3>Encontre</h3><p>Busque por nome, categoria ou bairro e veja quem está aberto agora.</p></div>
            <div className="step3"><div className="n"><Icon name="chat" size={20} /></div><h3>Chame</h3><p>Fale direto no WhatsApp do comércio ou veja como chegar no mapa.</p></div>
            <div className="step3"><div className="n"><Icon name="calendar" size={20} /></div><h3>Agende</h3><p>Nos comércios com agenda online, marque seu horário em menos de um minuto.</p></div>
          </div>
        </div>
        <Cta />
      </main>
    </Shell>
  );
}
