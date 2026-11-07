import { Suspense, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getBusiness, getCity, searchBusinesses, openStatus } from '@/lib/server/c10';
import { nowMin, todayWeekday } from '@/lib/server/time';
import { Shell, ShellSkeleton } from '@/components/guide/Shell';
import { BizCard } from '@/components/guide/BizCard';
import { Icon, CategoryIcon } from '@/components/Icon';
import { WEEKDAYS, initials, whatsLink } from '@/lib/format';
import type { Business, City } from '@/lib/types';

type Props = PageProps<'/[city]/[biz]'>;

const fullAddress = (b: Business, city: City) => [b.address, b.neighborhood, `${city.name} - ${city.state}`].filter(Boolean).join(', ');
const mapsLink = (b: Business, city: City) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(b, city))}`;

async function load(params: Props['params']) {
  const p = await params;
  const city = await getCity(p.city);
  const biz = city ? await getBusiness(city.id, p.biz) : undefined;
  return { city, biz };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection(); // lê o banco a cada visita
  const { city, biz } = await load(params);
  if (!city || !biz) return { title: 'Página não encontrada · Cidade 10' };
  return {
    title: `${biz.name} · ${biz.category_name} em ${city.name} · Cidade 10`,
    description: `${biz.description ?? ''} ${biz.address ?? ''}, ${biz.neighborhood ?? ''} - ${city.name}.`.trim(),
  };
}

export default function BusinessPage({ params }: Props) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, 'params'>) {
  await connection();
  const { city, biz: b } = await load(params);
  if (!city || !b) notFound();

  const wd = todayWeekday();
  const now = nowMin();
  const st = openStatus(b.hours, wd, now);
  const related = (await searchBusinesses(city.id, { categoryId: b.category_id })).filter((x) => x.id !== b.id).slice(0, 3);
  const bookingHref = `/${city.slug}/${b.slug}/agendar`;
  const whatsHref = b.phone ? whatsLink(b.phone, `Olá! Vi o ${b.name} no Cidade 10 e gostaria de mais informações.`) : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.name,
    description: b.description,
    address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: city.name, addressRegion: city.state, addressCountry: 'BR' },
    ...(b.phone && { telephone: `+${b.phone}` }),
  };

  const mobileBar = (
    <div className="mobile-bar">
      {b.booking_enabled && <a className="btn btn-accent" href={bookingHref}><Icon name="calendar" size={16} /> Agendar</a>}
      {whatsHref && <a className="btn btn-whats" target="_blank" rel="noopener" href={whatsHref}><Icon name="chat" size={16} /> WhatsApp</a>}
      <a className="btn" target="_blank" rel="noopener" href={mapsLink(b, city)}><Icon name="route" size={16} />{b.booking_enabled && whatsHref ? '' : ' Rota'}</a>
    </div>
  );

  return (
    <Shell city={city} mobileBar={mobileBar}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <section className="biz-hero" style={{ '--c': b.category_color } as CSSProperties}>
        <div className="biz-banner">
          <nav className="crumbs" aria-label="Navegação"><div className="container">
            <Link href={`/${city.slug}`}>{city.name}</Link> <span>/</span> <Link href={`/${city.slug}/categoria/${b.category_slug}`}>{b.category_name}</Link>
          </div></nav>
          <span className="big-ic"><CategoryIcon slug={b.category_slug} size={260} /></span>
        </div>
        <div className="container">
          <div className="biz-head">
            <div className="biz-avatar lg">{initials(b.name)}</div>
            <div>
              <h1>{b.name}</h1>
              <div className="chips">
                <span className="chip"><CategoryIcon slug={b.category_slug} size={14} /> {b.category_name}</span>
                {b.neighborhood && <span className="chip"><Icon name="pin" size={14} /> {b.neighborhood}</span>}
                <span className="chip"><span className={`status ${st.open ? 'open' : ''}`}>{st.label}</span></span>
                {b.featured && <span className="chip"><Icon name="star" size={14} /> Destaque</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container biz-layout" style={{ paddingBottom: 72 }}>
        <div>
          {b.description && <div className="panel"><h2>Sobre</h2><p>{b.description}</p></div>}
          <div className="panel">
            <h2><Icon name="clock" size={20} /> Horário de funcionamento</h2>
            <table className="hours"><tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const h = b.hours?.[d];
                return (
                  <tr key={d} className={d === wd ? 'today' : undefined}>
                    <td>{WEEKDAYS[d]}</td>
                    <td>{h ? (h[0] === '00:00' && h[1] === '23:59' ? '24 horas' : `${h[0]} – ${h[1]}`) : <span className="muted">Fechado</span>}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
          {b.address && (
            <div className="panel">
              <h2><Icon name="pin" size={20} /> Localização</h2>
              <div className="map">
                <iframe title="Mapa" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(fullAddress(b, city))}&z=15&output=embed`} />
              </div>
            </div>
          )}
          {related.length > 0 && (
            <section className="block" style={{ marginTop: 36 }}>
              <div className="sec-head"><div><span className="kicker">Veja também</span><h2>Outros em {b.category_name.toLowerCase()}</h2></div></div>
              <div className="biz-grid">{related.map((r) => <BizCard key={r.id} b={r} city={city} status={openStatus(r.hours, wd, now)} />)}</div>
            </section>
          )}
        </div>

        <aside>
          <div className="panel sticky">
            <div className="side-title">{b.booking_enabled ? 'Agende seu horário' : 'Fale com o comércio'}</div>
            <p className="side-sub">{b.booking_enabled ? 'Escolha o serviço, o profissional e o horário em menos de um minuto.' : 'Tire dúvidas, faça pedidos ou peça orçamento.'}</p>
            {b.booking_enabled && <a className="btn btn-accent btn-block btn-lg" href={bookingHref}><Icon name="calendar" size={18} /> Agendar online</a>}
            {whatsHref && <a className="btn btn-whats btn-block" target="_blank" rel="noopener" href={whatsHref}><Icon name="chat" size={17} /> Chamar no WhatsApp</a>}
            <a className="btn btn-block" target="_blank" rel="noopener" href={mapsLink(b, city)}><Icon name="route" size={17} /> Como chegar</a>
            {b.instagram && <a className="btn btn-block" target="_blank" rel="noopener" href={`https://instagram.com/${b.instagram}`}><Icon name="instagram" size={17} /> @{b.instagram}</a>}
            {b.address && <div className="address"><Icon name="pin" size={18} /><div><b>{b.address}</b>{b.neighborhood || ''} · {city.name} - {city.state}</div></div>}
          </div>
        </aside>
      </main>
    </Shell>
  );
}
