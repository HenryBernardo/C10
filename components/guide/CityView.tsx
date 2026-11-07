import 'server-only';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getCity, getCategory, getCityCategories, searchBusinesses, openStatus } from '@/lib/server/c10';
import { nowMin, todayWeekday } from '@/lib/server/time';
import { Shell } from './Shell';
import { BizCard, Cta } from './BizCard';
import { Icon, CategoryIcon } from '@/components/Icon';

/** Página da cidade (e da categoria dentro da cidade), com busca, categorias e destaques. */
export async function CityView({ citySlug, categorySlug, q: rawQ }: { citySlug: string; categorySlug?: string; q?: string }) {
  await connection();
  const city = await getCity(citySlug);
  if (!city) notFound();
  const category = categorySlug ? await getCategory(categorySlug) : undefined;
  if (categorySlug && !category) notFound();
  const q = (rawQ ?? '').trim().slice(0, 80);

  const [cats, list, all, featured] = await Promise.all([
    getCityCategories(city.id),
    searchBusinesses(city.id, { categoryId: category?.id, q }),
    searchBusinesses(city.id),
    !category && !q ? searchBusinesses(city.id, { featured: true }) : Promise.resolve([]),
  ]);
  const wd = todayWeekday();
  const now = nowMin();
  const status = (b: (typeof list)[number]) => openStatus(b.hours, wd, now);
  const total = cats.reduce((s, c) => s + (c.total ?? 0), 0);
  const openNow = all.filter((b) => status(b).open).length;
  const heading = category ? `${category.name} em ${city.name}` : q ? `Resultados para “${q}”` : 'Todos os comércios';
  const action = category ? `/${city.slug}/categoria/${category.slug}` : `/${city.slug}`;
  const popular = [...cats].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 4);

  return (
    <Shell city={city}>
      <section className="hero">
        <div className="container">
          <span className="chip"><Icon name="pin" size={14} /> {city.name} · {city.state}</span>
          <h1>{city.name}<span className="ten">10</span></h1>
          <p className="lead">{city.tagline}</p>
          <form className="search" action={action} method="get" role="search">
            <Icon name="search" size={20} />
            <input name="q" defaultValue={q} placeholder={category ? `Buscar em ${category.name.toLowerCase()}…` : 'Pizza, barbearia, farmácia…'} aria-label="Buscar" />
            <button className="btn btn-accent">Buscar</button>
          </form>
          <div className="quick"><span>Populares:</span>{popular.map((c) => <Link key={c.id} href={`/${city.slug}/categoria/${c.slug}`}>{c.name}</Link>)}</div>
          <div className="stats">
            <div className="stat"><b>{total}</b><span>comércios</span></div>
            <div className="stat"><b>{openNow}</b><span>abertos agora</span></div>
            <div className="stat"><b>{cats.length}</b><span>categorias</span></div>
          </div>
        </div>
      </section>

      <main className="container" style={{ paddingBottom: 72 }}>
        <div className="cats-wrap">
          <nav className="cats" aria-label="Categorias">
            <Link href={`/${city.slug}`} className={`cat ${!category ? 'active' : ''}`}><span className="cat-icon"><Icon name="grid" size={17} /></span>Todos <small>{total}</small></Link>
            {cats.map((c) => (
              <Link key={c.id} href={`/${city.slug}/categoria/${c.slug}`} className={`cat ${category?.id === c.id ? 'active' : ''}`} style={{ '--c': c.color } as CSSProperties}>
                <span className="cat-icon"><CategoryIcon slug={c.slug} size={17} /></span>{c.name} <small>{c.total}</small>
              </Link>
            ))}
          </nav>
        </div>

        {featured.length > 0 && (
          <section className="block" style={{ marginTop: 36 }}>
            <div className="sec-head"><div><span className="kicker">Selecionados</span><h2>Destaques em {city.name}</h2></div></div>
            <div className="biz-grid">{featured.map((b) => <BizCard key={b.id} b={b} city={city} status={status(b)} />)}</div>
          </section>
        )}

        <section className="block" style={featured.length ? undefined : { marginTop: 36 }}>
          <div className="sec-head">
            <div><span className="kicker">{category || q ? 'Resultados' : 'Guia completo'}</span><h2>{heading}</h2></div>
            <span className="muted">{list.length} {list.length === 1 ? 'resultado' : 'resultados'}</span>
          </div>
          {list.length ? (
            <div className="biz-grid">{list.map((b) => <BizCard key={b.id} b={b} city={city} status={status(b)} />)}</div>
          ) : (
            <div className="empty"><Icon name="search" size={28} /><p>Nada encontrado por aqui.</p><Link className="btn" href={`/${city.slug}`}>Ver todos os comércios</Link></div>
          )}
        </section>
        <Cta city={city} />
      </main>
    </Shell>
  );
}
