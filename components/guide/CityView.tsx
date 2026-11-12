import 'server-only';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getCity, getCategory, getCityCategories, searchBusinesses, openStatus } from '@/lib/server/c10';
import { nowMin, todayWeekday } from '@/lib/server/time';
import { Shell } from './Shell';
import { BizCard, Cta, SectionTitle } from './BizCard';
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
  const heading = category ? category.name : q ? `“${q}”` : 'Todos os comércios';
  const popular = [...cats].sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 5);

  return (
    <Shell city={city}>
      <section className="hero">
        <div className="container hero-center">
          <span className="hero-line" />
          <h1>{category ? `${category.name} em ${city.name}` : `Explore os melhores lugares de ${city.name}`}</h1>
          <p className="lead">{city.tagline}. Encontre comércios e serviços, chame no WhatsApp e agende online.</p>

          {/* A busca sempre vai para a página da cidade; se escolher uma categoria, ela redireciona. */}
          <form className="main-search" action={`/${city.slug}`} method="get" role="search">
            <label className="ms-item">
              <Icon name="search" size={17} />
              <input name="q" defaultValue={q} placeholder="O que você está procurando?" aria-label="Buscar" />
            </label>
            <label className="ms-item">
              <Icon name="grid" size={17} />
              <select name="categoria" defaultValue={category?.slug ?? ''} aria-label="Categoria">
                <option value="">Todas as categorias</option>
                {cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <button className="btn btn-navy">Buscar <Icon name="search" size={16} /></button>
          </form>

          <span className="hero-sep" />
          <p className="hero-quick">Só dando uma olhada? Busque por categoria:</p>
          <nav className="hero-cats" aria-label="Categorias populares">
            {popular.map((c) => (
              <Link key={c.id} href={`/${city.slug}/categoria/${c.slug}`}>
                <CategoryIcon slug={c.slug} size={30} /><span>{c.name}</span>
              </Link>
            ))}
          </nav>
        </div>
        <a href="#lista" className="hero-down" aria-label="Ver comércios"><Icon name="chevron" size={18} /></a>
      </section>

      <div className="list-bar" id="lista">
        <div className="container list-bar-inner">
          <div className="list-bar-title">Resultados para: <b>{heading}</b></div>
          <div className="list-bar-info">
            <span><b>{list.length}</b> {list.length === 1 ? 'comércio' : 'comércios'}</span>
            <span className="dot-open"><b>{openNow}</b> abertos agora</span>
          </div>
        </div>
      </div>

      <div className="cats-wrap">
        <nav className="container cats" aria-label="Categorias">
          <Link href={`/${city.slug}#lista`} className={`cat ${!category ? 'active' : ''}`}><span className="cat-icon"><Icon name="grid" size={15} /></span>Todos <small>{total}</small></Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/${city.slug}/categoria/${c.slug}#lista`} className={`cat ${category?.id === c.id ? 'active' : ''}`} style={{ '--c': c.color } as CSSProperties}>
              <span className="cat-icon"><CategoryIcon slug={c.slug} size={15} /></span>{c.name} <small>{c.total}</small>
            </Link>
          ))}
        </nav>
      </div>

      <main>
        {featured.length > 0 && (
          <section className="section">
            <div className="container">
              <SectionTitle bg="Destaques" title={`Destaques em ${city.name}`} sub="Selecionados pela equipe do Cidade 10 para você conhecer." />
              <div className="biz-grid">{featured.map((b) => <BizCard key={b.id} b={b} city={city} status={status(b)} />)}</div>
            </div>
          </section>
        )}

        <section className={`section ${featured.length ? 'section-gray' : ''}`}>
          <div className="container">
            <SectionTitle
              bg={category || q ? 'Resultados' : 'Guia'}
              title={category || q ? heading : `Todos os comércios de ${city.name}`}
              sub={`${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} · veja endereço, horário e fale direto no WhatsApp.`}
            />
            {list.length ? (
              <div className="biz-grid">{list.map((b) => <BizCard key={b.id} b={b} city={city} status={status(b)} />)}</div>
            ) : (
              <div className="empty"><Icon name="search" size={28} /><p>Nada encontrado por aqui.</p><Link className="btn btn-navy" href={`/${city.slug}`}>Ver todos os comércios</Link></div>
            )}
          </div>
        </section>
      </main>
      <Cta city={city} />
    </Shell>
  );
}
