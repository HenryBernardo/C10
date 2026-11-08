import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getCategories, getCities, getCity } from '@/lib/server/c10';
import { ONLY_CITY } from '@/lib/cities';
import { Shell, ShellSkeleton } from '@/components/guide/Shell';
import { Icon } from '@/components/Icon';
import { sendLead } from './actions';

export const metadata: Metadata = {
  title: 'Cadastre seu negócio · Cidade 10',
  description: 'Coloque seu comércio no Cidade 10 e seja encontrado por quem está na sua cidade.',
};

export default function SignupPage({ searchParams }: PageProps<'/cadastre-seu-negocio'>) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<'/cadastre-seu-negocio'>, 'searchParams'>) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
  const [current, cities, cats] = await Promise.all([getCity(ONLY_CITY ?? one(sp.cidade)), getCities(), getCategories()]);
  const sent = 'enviado' in sp;
  const error = one(sp.erro).slice(0, 200);

  return (
    <Shell city={current}>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="container">
          <span className="chip"><Icon name="store" size={14} /> Para negócios</span>
          <h1>Seu negócio<br /><span className="grad">no Cidade 10.</span></h1>
          <p className="lead">Apareça para quem está procurando na sua cidade e receba clientes pelo WhatsApp.</p>
        </div>
      </section>
      <main className="container narrow" style={{ paddingBottom: 72 }}>
        <div className="signup">
          <ul className="perks">
            <li><span className="n"><Icon name="store" size={20} /></span><div><b>Página própria</b><span>Endereço, horário, Instagram e “aberto agora” num link fácil de divulgar.</span></div></li>
            <li><span className="n"><Icon name="chat" size={20} /></span><div><b>Clientes no WhatsApp</b><span>Um toque e o cliente já está falando com você.</span></div></li>
            <li><span className="n"><Icon name="calendar" size={20} /></span><div><b>Agenda online</b><span>Para barbearias e salões: agendamento 24h, lembretes e controle financeiro.</span></div></li>
            <li><span className="n"><Icon name="search" size={20} /></span><div><b>Encontrado no Google</b><span>Páginas feitas para aparecer em buscas como “barbearia em {current?.name || 'Foz do Iguaçu'}”.</span></div></li>
          </ul>
          {sent ? (
            <div className="panel success">
              <div className="check"><Icon name="check" size={30} /></div>
              <h2>Recebemos seu cadastro!</h2>
              <p className="muted">Nossa equipe vai falar com você pelo WhatsApp em breve.</p>
              <Link className="btn" href={`/${current?.slug || ''}`}>Voltar ao guia</Link>
            </div>
          ) : (
            <form className="panel form" action={sendLead}>
              <h2 style={{ marginBottom: 0 }}>Conte sobre seu negócio</h2>
              <p className="muted" style={{ marginTop: -8, fontSize: 14 }}>Leva 1 minuto. A gente entra em contato.</p>
              {error && <div className="form-error" role="alert">{error}</div>}
              <label>Nome do negócio<input name="business_name" required maxLength={100} placeholder="Ex.: Barbearia do Zé" /></label>
              {ONLY_CITY && <input type="hidden" name="city" value={ONLY_CITY} />}
              <div className={ONLY_CITY ? undefined : 'row2'}>
                {!ONLY_CITY && <label>Cidade
                  <select name="city" defaultValue={current?.slug ?? ''}>
                    {cities.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    <option value="">Outra cidade</option>
                  </select>
                </label>}
                <label>Categoria<select name="category">{cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
              </div>
              <div className="row2">
                <label>Seu nome<input name="contact_name" required maxLength={80} autoComplete="name" /></label>
                <label>WhatsApp<input name="phone" required inputMode="tel" autoComplete="tel" placeholder="(45) 99999-9999" maxLength={20} /></label>
              </div>
              <label>Mensagem (opcional)<textarea name="message" rows={3} maxLength={500} placeholder="Ex.: quero agenda online para minha barbearia" /></label>
              <button className="btn btn-accent btn-lg">Enviar cadastro <Icon name="arrow" size={16} /></button>
            </form>
          )}
        </div>
      </main>
    </Shell>
  );
}
