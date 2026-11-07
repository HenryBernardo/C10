import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon, CategoryIcon } from '@/components/Icon';
import { initials } from '@/lib/format';
import type { Business, City } from '@/lib/types';

export type OpenStatus = { open: boolean; label: string };

export function BizCard({ b, city, status }: { b: Business; city: City; status: OpenStatus | null }) {
  return (
    <Link className="biz-card" href={`/${city.slug}/${b.slug}`} style={{ '--c': b.category_color } as CSSProperties}>
      <div className="biz-cover">
        <div className="biz-badges">
          {b.featured && <span className="tag tag-star"><Icon name="star" size={12} /> Destaque</span>}
          {b.booking_enabled && <span className="tag tag-book"><Icon name="calendar" size={12} /> Agenda online</span>}
        </div>
        <span className="cover-ic"><CategoryIcon slug={b.category_slug} size={44} /></span>
      </div>
      <div className="biz-avatar">{initials(b.name)}</div>
      <div className="biz-body">
        <span className="biz-cat">{b.category_name}</span>
        <h3>{b.name}</h3>
        <p>{b.description}</p>
        <div className="biz-foot">
          {b.neighborhood && <span className="meta"><Icon name="pin" size={14} /> {b.neighborhood}</span>}
          {status && <span className={`status ${status.open ? 'open' : ''}`}>{status.label}</span>}
          <span className="go"><Icon name="arrow" size={16} /></span>
        </div>
      </div>
    </Link>
  );
}

export function Cta({ city }: { city?: City | null }) {
  return (
    <section className="cta">
      <div>
        <h2>{city ? `Tem um negócio em ${city.name}?` : 'Tem um negócio?'}</h2>
        <p>Coloque seu comércio no Cidade 10 e seja encontrado por quem está procurando agora.</p>
        <ul>
          <li><Icon name="check" size={16} /> Página própria</li>
          <li><Icon name="check" size={16} /> Botão de WhatsApp</li>
          <li><Icon name="check" size={16} /> Agenda online</li>
        </ul>
      </div>
      <Link className="btn btn-light btn-lg" href={`/cadastre-seu-negocio${city ? `?cidade=${city.slug}` : ''}`}>
        Cadastrar meu negócio <Icon name="arrow" size={16} />
      </Link>
    </section>
  );
}
