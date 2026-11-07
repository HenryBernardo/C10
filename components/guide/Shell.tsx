import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCities } from '@/lib/server/c10';
import { Icon } from '@/components/Icon';
import type { City } from '@/lib/types';

/** Cor de destaque da cidade (já validada como #rrggbb no cadastro). */
export function Accent({ color }: { color?: string | null }) {
  const c = /^#[0-9a-f]{6}$/i.test(color ?? '') ? color : '#0f766e';
  return <style>{`:root { --accent: ${c}; }`}</style>;
}

/** Topo, rodapé e barra fixa do celular, em volta do conteúdo de cada página do guia. */
export async function Shell({ city, children, mobileBar }: { city?: City | null; children: ReactNode; mobileBar?: ReactNode }) {
  const cities = await getCities();
  const signup = `/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}`;
  return (
    <div className={mobileBar ? 'has-mobile-bar' : undefined}>
      <Accent color={city?.color} />
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="logo" aria-label="Cidade 10 — início">
            <img src="/img/c10.svg" alt="" width={30} height={30} /><span>Cidade<b>10</b></span>
          </Link>
          {city && <Link href={`/${city.slug}`} className="city-pill"><Icon name="pin" size={14} /><span>{city.name}</span></Link>}
          <div className="spacer" />
          <details className="city-switch">
            <summary>Cidades <Icon name="chevron" size={16} /></summary>
            <div className="menu">
              {cities.map((c) => (
                <Link key={c.id} href={`/${c.slug}`}><span className="dot" style={{ background: c.color }} />{c.name}<span className="uf">{c.state}</span></Link>
              ))}
            </div>
          </details>
          <Link href="/entrar" className="login-link" aria-label="Entrar no painel"><Icon name="user" size={16} /><span>Entrar</span></Link>
          <Link href={signup} className="btn btn-dark btn-sm hide-sm">Anuncie grátis</Link>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div>
              <Link href="/" className="logo"><img src="/img/c10.svg" alt="" width={28} height={28} /><span>Cidade<b>10</b></span></Link>
              <p>O guia do comércio local, cidade por cidade. Encontre, chame no WhatsApp e agende sem sair de casa.</p>
            </div>
            <div><h4>Cidades</h4>{cities.map((c) => <Link key={c.id} href={`/${c.slug}`}>{c.name}</Link>)}</div>
            <div>
              <h4>Para negócios</h4>
              <Link href="/cadastre-seu-negocio">Cadastre seu negócio</Link>
              <Link href="/entrar">Entrar no painel</Link>
              <Link href="/meu-horario">Meu horário</Link>
            </div>
          </div>
          <div className="footer-bottom">© {new Date().getFullYear()} Cidade 10</div>
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
        <div className="container topbar-inner">
          <Link href="/" className="logo"><img src="/img/c10.svg" alt="" width={30} height={30} /><span>Cidade<b>10</b></span></Link>
        </div>
      </header>
      <section className="hero"><div className="container"><div className="skeleton" /></div></section>
    </div>
  );
}
