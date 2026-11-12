import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon, CategoryIcon } from '@/components/Icon';
import { initials } from '@/lib/format';
import type { Business, City } from '@/lib/types';

export type OpenStatus = { open: boolean; label: string };

/** Título de seção centralizado, com uma palavra grande e clarinha ao fundo. */
export function SectionTitle({ bg, title, sub }: { bg: string; title: string; sub?: string }) {
  return (
    <div className="section-title">
      <span className="section-bg" aria-hidden="true">{bg}</span>
      <h2>{title}</h2>
      <span className="section-sep" />
      {sub && <p>{sub}</p>}
    </div>
  );
}

export function BizCard({ b, city, status }: { b: Business; city: City; status: OpenStatus | null }) {
  return (
    <Link className="biz-card" href={`/${city.slug}/${b.slug}`} style={{ '--c': b.category_color } as CSSProperties}>
      <div className="biz-media">
        <span className="biz-media-ic"><CategoryIcon slug={b.category_slug} size={88} /></span>
        {b.featured && <span className="ribbon">Destaque</span>}
        {status && <span className={`state ${status.open ? 'open' : ''}`}><Icon name="clock" size={13} /> {status.label}</span>}
        <div className="biz-media-title">
          <h3>{b.name}</h3>
          {b.neighborhood && <span><Icon name="pin" size={13} /> {b.neighborhood}, {city.name}</span>}
        </div>
        <span className="biz-avatar">{initials(b.name)}</span>
      </div>
      <div className="biz-body">
        <p>{b.description}</p>
        {b.booking_enabled && <div className="biz-feat"><Icon name="calendar" size={15} /> Agenda online: marque seu horário</div>}
      </div>
      <div className="biz-foot">
        <span className="cat-dot"><CategoryIcon slug={b.category_slug} size={16} /></span>
        <span className="biz-foot-cat">{b.category_name}</span>
        <span className="go"><Icon name="arrow" size={16} /></span>
      </div>
    </Link>
  );
}

export function Cta({ city }: { city?: City | null }) {
  return (
    <section className="cta">
      <div className="container cta-inner">
        <span className="cta-kicker">Para negócios</span>
        <h2>{city ? `Tem um negócio em ${city.name}?` : 'Tem um negócio?'}<br />Coloque ele no Cidade 10.</h2>
        <ul>
          <li><Icon name="check" size={16} /> Página própria</li>
          <li><Icon name="check" size={16} /> Botão de WhatsApp</li>
          <li><Icon name="check" size={16} /> Agenda online</li>
        </ul>
        <Link className="btn btn-sky btn-lg" href={`/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}`}>
          Cadastrar meu negócio <Icon name="arrow" size={16} />
        </Link>
      </div>
    </section>
  );
}
