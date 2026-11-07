'use client';
// Painel da barbearia (/admin). O dono acessa a dele; admins abrem pelo link /admin?loja=ID.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, setShopHeader, toast } from '@/lib/client';
import { Spinner } from '@/components/ui';
import { useErrorHandler } from '@/components/panel/shared';
import { ShopContext, type ShopCtx, type ShopModal } from './context';
import { Agenda } from './Agenda';
import { Reminders } from './Reminders';
import { Clients, ClientModal } from './Clients';
import { LoyaltyView } from './Loyalty';
import { Finance } from './Finance';
import { Config, ServiceModal, BarberModal } from './Config';
import { AppointmentModal, NewAppointmentModal, BlockModal } from './AppointmentModals';
import type { Barber, Service, Settings } from '@/lib/types';

const VIEWS = {
  agenda: ['📅', 'Agenda'], lembretes: ['🔔', 'Lembretes'], clientes: ['👥', 'Clientes'],
  fidelidade: ['🎁', 'Fidelidade'], financeiro: ['💰', 'Financeiro'], config: ['⚙️', 'Configurações'],
} as const;
type View = keyof typeof VIEWS;

interface Context { user: { name: string; role: string; role_label: string }; shop: ShopCtx['shop'] }

export function ShopPanel() {
  const router = useRouter();
  const parts = usePathname().split('/').filter(Boolean); // ['admin', view?, arg?]
  const loja = useSearchParams().get('loja');
  const [context, setContext] = useState<Context | null>(null);
  const [base, setBase] = useState<{ settings: Settings; services: Service[]; barbers: Barber[] } | null>(null);
  const [modal, setModal] = useState<ShopModal>(null);
  const [version, setVersion] = useState(0);

  // Com ?loja= quem está aqui é um admin abrindo a agenda de uma barbearia: entra pela cidade.
  const loginUrl = useCallback(() => `${loja ? '/entrar/cidade' : '/entrar/barbearia'}?volta=${encodeURIComponent(location.pathname + location.search)}`, [loja]);
  const onError = useErrorHandler(loginUrl);

  const reloadBase = useCallback(async () => {
    const [settings, services, barbers] = await Promise.all([
      api<Settings>('/api/admin/settings'), api<Service[]>('/api/admin/services'), api<Barber[]>('/api/admin/barbers'),
    ]);
    setBase({ settings, services, barbers });
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api<{ authenticated: boolean; user?: { role: string } }>('/api/auth/me');
      if (!me.authenticated) { location.href = loginUrl(); return; }
      if (me.user!.role !== 'shop') {
        if (!loja) { location.href = '/painel'; return; }
        setShopHeader(loja);
      }
      setContext(await api<Context>('/api/admin/context'));
      await reloadBase();
    })().catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (base) document.title = `Painel · ${base.settings.shop_name}`;
  }, [base]);

  const href = useCallback((path: string) => (loja ? `${path}?loja=${encodeURIComponent(loja)}` : path), [loja]);

  const ctx = useMemo<ShopCtx | null>(() => context && base && {
    shop: context.shop,
    ...base,
    reloadBase,
    refresh: () => setVersion((v) => v + 1),
    version,
    open: setModal,
    close: () => setModal(null),
    onError,
    href,
    navigate: (path) => router.push(href(path)),
    bookingUrl: () => location.origin + context.shop.booking_path,
  }, [context, base, reloadBase, version, onError, href, router]);

  if (!ctx || !context) return <div className="main"><Spinner /></div>;

  const view = (parts[1] && parts[1] in VIEWS ? parts[1] : 'agenda') as View;
  const arg = parts[2];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(ctx!.bookingUrl());
      toast('Link copiado! Coloque na bio do Instagram e no WhatsApp.', 'success');
    } catch {
      prompt('Copie o link:', ctx!.bookingUrl());
    }
  }

  return (
    <ShopContext.Provider value={ctx}>
      <div className="app">
        <aside className="side">
          <div className="side-brand"><img src="/img/icon.svg" alt="" width={30} height={30} /><span className="brand">{ctx.settings.shop_name}</span></div>
          <nav className="nav-links">
            {(Object.keys(VIEWS) as View[]).map((v) => (
              <Link key={v} href={href(`/admin/${v}`)} className={view === v ? 'active' : undefined}><span>{VIEWS[v][0]}</span>{VIEWS[v][1]}</Link>
            ))}
          </nav>
          <div className="side-foot">
            {loja && <Link className="btn ghost sm block" href="/painel">← Painel da cidade</Link>}
            <a className="btn ghost sm block" href={context.shop.booking_path} target="_blank">Ver página de agendamento</a>
            <button className="btn ghost sm block" onClick={copyLink}>Copiar link para clientes</button>
            <button className="btn ghost sm block" onClick={async () => {
              await api('/api/auth/logout', { method: 'POST' });
              location.href = loja ? '/entrar/cidade' : '/entrar/barbearia';
            }}>Sair</button>
            <div className="small muted" style={{ padding: '4px 6px' }}>{context.user.name} · {context.user.role_label}</div>
          </div>
        </aside>

        <main className="main">
          {view === 'agenda' && <Agenda key={arg} date={arg} />}
          {view === 'lembretes' && <Reminders key={arg} date={arg} />}
          {view === 'clientes' && <Clients openId={arg ? Number(arg) : undefined} />}
          {view === 'fidelidade' && <LoyaltyView />}
          {view === 'financeiro' && <Finance key={arg} range={arg} />}
          {view === 'config' && <Config tab={arg} />}
        </main>
      </div>

      {modal?.kind === 'appointment' && <AppointmentModal a={modal.a} />}
      {modal?.kind === 'newAppt' && <NewAppointmentModal {...modal.opts} />}
      {modal?.kind === 'block' && <BlockModal date={modal.date} />}
      {modal?.kind === 'client' && <ClientModal id={modal.id} />}
      {modal?.kind === 'service' && <ServiceModal s={modal.s} />}
      {modal?.kind === 'barber' && <BarberModal b={modal.b} />}
    </ShopContext.Provider>
  );
}
