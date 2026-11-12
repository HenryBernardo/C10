import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCities } from '@/lib/server/c10';
import { Icon } from '@/components/Icon';
import { ONLY_CITY } from '@/lib/cities';
import type { City } from '@/lib/types';

function Logo() {
  return <><img src="/img/c10.svg" alt="" width={30} height={30} /><span>Cidade<b>10</b></span></>;
}

/** Topo, rodapé e barra fixa do celular, em volta do conteúdo de cada página do guia. */
export async function Shell({ city, children, mobileBar }: { city?: City | null; children: ReactNode; mobileBar?: ReactNode }) {
  const cities = await getCities();
  const home = city ? `/${city.slug}` : ONLY_CITY ? `/${ONLY_CITY}` : '/';
  const signup = `/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}`;
  return (
    <div className={mobileBar ? 'has-mobile-bar' : undefined}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href={home} className="logo" aria-label="Cidade 10 — início"><Logo /></Link>
          <Link href={`${home}#lista`} className="topbar-search" aria-label="Buscar comércios"><Icon name="search" size={16} /></Link>
          {city && <span className="city-pill"><Icon name="pin" size={14} />{city.name}</span>}
          <div className="spacer" />
          <nav className="topbar-nav hide-sm">
            <Link href={home}>Início</Link>
            <Link href={`${home}#lista`}>Comércios</Link>
            <Link href="/meu-horario">Meu horário</Link>
          </nav>
          {!ONLY_CITY && (
            <details className="city-switch">
              <summary>Cidades <Icon name="chevron" size={16} /></summary>
              <div className="menu">
                {cities.map((c) => (
                  <Link key={c.id} href={`/${c.slug}`}><span className="dot" style={{ background: c.color }} />{c.name}<span className="uf">{c.state}</span></Link>
                ))}
              </div>
            </details>
          )}
          <span className="topbar-div hide-sm" />
          <Link href="/entrar" className="login-link" aria-label="Entrar no painel"><Icon name="user" size={16} /><span>Entrar</span></Link>
          <Link href={signup} className="btn btn-sky btn-sm add-btn">Anuncie grátis <Icon name="store" size={15} /></Link>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <Link href={home} className="logo"><Logo /></Link>
            <p>O guia do comércio local. Encontre, chame no WhatsApp e agende sem sair de casa.</p>
          </div>
          {!ONLY_CITY && <div><h4>Cidades</h4>{cities.map((c) => <Link key={c.id} href={`/${c.slug}`}>{c.name}</Link>)}</div>}
          <div>
            <h4>Para você</h4>
            <Link href={`${home}#lista`}>Todos os comércios</Link>
            <Link href="/meu-horario">Meu horário</Link>
          </div>
          <div>
            <h4>Para negócios</h4>
            <Link href="/cadastre-seu-negocio">Cadastre seu negócio</Link>
            <Link href="/entrar">Entrar no painel</Link>
          </div>
        </div>
        <div className="subfooter">
          <div className="container">© {new Date().getFullYear()} Cidade 10 · Todos os direitos reservados</div>
        </div>
      </footer>
      {mobileBar}
    </div>
  );
}

/** Esqueleto mostrado enquanto os dados da página carregam. */
export function ShellSkeleton() {
  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="logo"><Logo /></Link>
        </div>
      </header>
      <section className="hero"><div className="container hero-center"><div className="skeleton" /></div></section>
    </div>
  );
}
