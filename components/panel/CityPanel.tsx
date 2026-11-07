'use client';
// Painel do Cidade 10: admin geral (todas as cidades) e admin da cidade (só a dele).
// Telas: início, comércios, pedidos de cadastro, acessos e cidades (só admin geral).

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, store, toast } from '@/lib/client';
import { Modal, Spinner } from '@/components/ui';
import { PasswordModal, stop, useErrorHandler } from './shared';
import { money, fmtPhone, fmtDateShort, maskPhone, WEEKDAYS, whatsLink } from '@/lib/format';
import type { Business, Category, City, Hours, LeadStatus, Role } from '@/lib/types';

const CITY_KEY = 'c10:painel:cidade';
const LEAD_STATUS: Record<LeadStatus, string> = { novo: 'Novo', contatado: 'Contatado', cadastrado: 'Cadastrado', descartado: 'Descartado' };
const LEAD_BADGE: Record<LeadStatus, string> = { novo: 'scheduled', contatado: 'confirmed', cadastrado: 'done', descartado: 'cancelled' };
const ROLE_LABEL: Record<Role, string> = { super: 'Admin geral', city: 'Admin da cidade', shop: 'Dono do comércio' };

interface Ctx { user: { id: number; name: string; role: Role; role_label: string; city_id: number | null }; cities: City[]; categories: Category[] }
interface Lead { id: number; city_id: number | null; category_id: number | null; business_name: string; contact_name: string; phone: string; message: string | null; status: LeadStatus; created_at: string; city_name: string | null; category_name: string | null }
interface UserRow { id: number; name: string; email: string; role: Role; active: boolean; city_name: string | null; business_name: string | null; booking_enabled: boolean | null }
type BizForm = Partial<Business> & { lead?: Lead };
type NewUser = { role?: Role; business_id?: number; name?: string };
type ModalState =
  | { kind: 'business'; b: BizForm }
  | { kind: 'user'; preset: NewUser }
  | { kind: 'editUser'; u: UserRow }
  | { kind: 'loginInfo'; name: string; email: string; password: string; role: Role }
  | { kind: 'city'; c?: City }
  | { kind: 'password' }
  | null;

const VIEWS = { inicio: 'Início', comercios: 'Comércios', pedidos: 'Pedidos', usuarios: 'Acessos', cidades: 'Cidades' } as const;
const ICONS: Record<keyof typeof VIEWS, string> = { inicio: '🏠', comercios: '🏪', pedidos: '📨', usuarios: '👤', cidades: '🌎' };
type View = keyof typeof VIEWS;

export function CityPanel() {
  const router = useRouter();
  const parts = usePathname().split('/').filter(Boolean); // ['painel', view?, sub?]
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [cityId, setCityIdState] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [refresh, setRefresh] = useState(0);
  const goLogin = () => '/entrar/cidade?volta=/painel';
  const onError = useErrorHandler(goLogin);
  const reload = () => setRefresh((n) => n + 1);

  const loadCtx = useCallback(async () => {
    const c = await api<Ctx>('/api/panel/context');
    setCtx(c);
    return c;
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api<{ authenticated: boolean; user?: { role: Role } }>('/api/auth/me');
      if (!me.authenticated) { location.href = goLogin(); return; }
      if (me.user!.role === 'shop') { location.href = '/admin'; return; }
      const c = await loadCtx();
      const saved = store.get<number | null>(CITY_KEY, null);
      setCityIdState(c.cities.find((x) => x.id === saved)?.id ?? c.cities[0]?.id ?? null);
    })().catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ctx) return <div className="main"><Spinner /></div>;
  const isSuper = ctx.user.role === 'super';
  let view = (parts[1] ?? 'inicio') as View;
  if (!(view in VIEWS) || (view === 'cidades' && !isSuper)) view = 'inicio';
  const city = ctx.cities.find((c) => c.id === cityId) ?? null;
  const setCityId = (id: number) => { setCityIdState(id); store.set(CITY_KEY, id); };
  const p = { ctx, city: city!, isSuper, open: setModal, onError, refresh };

  return (
    <div className="app theme-cidade">
      <aside className="side">
        <div className="side-brand"><img src="/img/c10.svg" alt="" width={30} height={30} /><span className="brand">Cidade<b>10</b></span></div>
        <div className="city-select">
          {isSuper ? (
            <select className="input" value={cityId ?? ''} onChange={(e) => setCityId(Number(e.target.value))}>
              {ctx.cities.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.state}{c.active ? '' : ' (inativa)'}</option>)}
            </select>
          ) : <div className="fixed">📍 {city?.name}</div>}
        </div>
        <nav className="nav-links">
          {(Object.keys(VIEWS) as View[]).filter((v) => v !== 'cidades' || isSuper).map((v) => (
            <Link key={v} href={v === 'inicio' ? '/painel' : `/painel/${v}`} className={view === v ? 'active' : undefined}>
              <span>{ICONS[v]}</span>{VIEWS[v]}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <a className="btn ghost sm block" href={city ? `/${city.slug}` : '/'} target="_blank">Ver página da cidade</a>
          <button className="btn ghost sm block" onClick={() => setModal({ kind: 'password' })}>Minha senha</button>
          <button className="btn ghost sm block" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/entrar/cidade'; }}>Sair</button>
          <div className="small muted" style={{ padding: '4px 6px' }}>{ctx.user.name} · {ctx.user.role_label}</div>
        </div>
      </aside>

      <main className="main">
        {!city && view !== 'cidades' ? <div className="card empty">Nenhuma cidade cadastrada ainda.</div>
          : view === 'inicio' ? <Home key={`${cityId}-${refresh}`} {...p} />
          : view === 'comercios' ? <Businesses key={`${cityId}-${refresh}`} {...p} />
          : view === 'pedidos' ? <Leads key={`${cityId}-${refresh}-${parts[2]}`} {...p} showAll={isSuper && parts[2] === 'todos'} />
          : view === 'usuarios' ? <Users key={refresh} {...p} />
          : <Cities key={refresh} {...p} />}
      </main>

      {modal?.kind === 'business' && city && (
        <BusinessModal ctx={ctx} city={city} b={modal.b} onClose={() => setModal(null)} onError={onError}
          onSaved={(newId, ownerName) => {
            if (newId) {
              toast('Comércio criado. Agora crie o acesso do dono para ele configurar a agenda.', 'success');
              setModal({ kind: 'user', preset: { role: 'shop', business_id: newId, name: ownerName } });
            } else setModal(null);
            reload();
          }} />
      )}
      {modal?.kind === 'user' && city && (
        <UserModal ctx={ctx} city={city} isSuper={isSuper} preset={modal.preset} onClose={() => setModal(null)} onError={onError}
          onCreated={(info) => { setModal({ kind: 'loginInfo', ...info }); reload(); }} />
      )}
      {modal?.kind === 'editUser' && (
        <EditUserModal u={modal.u} selfId={ctx.user.id} onClose={() => setModal(null)} onError={onError}
          onSaved={(pw) => { setModal(pw ? { kind: 'loginInfo', name: modal.u.name, email: modal.u.email, password: pw, role: modal.u.role } : null); if (!pw) toast('Acesso atualizado.', 'success'); reload(); }} />
      )}
      {modal?.kind === 'loginInfo' && <LoginInfoModal {...modal} onClose={() => setModal(null)} />}
      {modal?.kind === 'city' && (
        <CityModal c={modal.c} onClose={() => setModal(null)} onError={onError}
          onSaved={async (newId, created) => {
            setModal(null);
            await loadCtx();
            if (newId) setCityId(newId);
            toast(created ? 'Cidade criada! Agora cadastre os comércios e o admin dela.' : 'Cidade salva.', 'success');
            reload();
          }} />
      )}
      {modal?.kind === 'password' && <PasswordModal onClose={() => setModal(null)} onDone={() => router.push(goLogin())} />}
    </div>
  );
}

type ViewProps = { ctx: Ctx; city: City; isSuper: boolean; open: (m: ModalState) => void; onError: (e: unknown) => void; refresh: number };

/** Carrega dados de uma tela; recarrega quando `deps` mudam. */
function useData<T>(url: string | null, onError: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    api<T>(url).then((d) => alive && setData(d)).catch(onError);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return data;
}

/* ------------------------------- Início ------------------------------- */

interface Overview {
  counts: { total: number; active: number; featured: number; booking: number };
  leads: number;
  appts: { n: number; revenue: number };
  byCategory: { name: string; icon: string; n: number }[];
  shops: { id: number; name: string; appts: number }[];
}

function Home({ city, open, onError }: ViewProps) {
  const o = useData<Overview>(`/api/panel/overview?city=${city.id}`, onError);
  if (!o) return <Spinner />;
  const max = Math.max(1, ...o.byCategory.map((c) => c.n));
  return (
    <>
      <div className="page-head"><h1>{city.name}</h1><div className="spacer" />
        <a className="btn" href={`/${city.slug}`} target="_blank">Ver página</a>
        <button className="btn primary" onClick={() => open({ kind: 'business', b: {} })}>+ Comércio</button></div>
      <div className="kpis">
        <div className="kpi gold"><div className="label">Comércios ativos</div><div className="value">{o.counts.active}</div><div className="hint">{o.counts.total} cadastrados</div></div>
        <div className="kpi"><div className="label">Destaques</div><div className="value">{o.counts.featured}</div></div>
        <div className="kpi"><div className="label">Com agenda online</div><div className="value">{o.counts.booking}</div></div>
        <div className={`kpi ${o.leads ? 'gold' : ''}`}><div className="label">Pedidos novos</div><div className="value">{o.leads}</div>
          <div className="hint"><Link href="/painel/pedidos">ver pedidos</Link></div></div>
        <div className="kpi"><div className="label">Agendamentos (30 dias)</div><div className="value">{o.appts.n}</div>
          <div className="hint">{money(o.appts.revenue)} movimentados</div></div>
      </div>
      <div className="panel-grid">
        <div className="card"><b>Comércios por categoria</b>
          {o.byCategory.map((c) => (
            <div key={c.name} style={{ marginTop: 10 }}>
              <div className="row small"><span>{c.icon} {c.name}</span><div className="spacer" /><b>{c.n}</b></div>
              <div className="bar" style={{ marginTop: 4 }}><span style={{ width: `${(c.n / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card"><b>Agendas online</b>
          {o.shops.length ? o.shops.map((s) => (
            <div key={s.id} className="row small" style={{ marginTop: 12 }}>
              <span>💈 {s.name}</span><div className="spacer" /><span className="muted">{s.appts} agend. em 30 dias</span>
              <a className="btn sm" href={`/admin?loja=${s.id}`}>Abrir</a>
            </div>
          )) : <p className="muted small" style={{ marginTop: 10 }}>Nenhum comércio com agenda online ainda. Ative em Comércios → editar → &quot;Agenda online&quot;.</p>}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Comércios ------------------------------ */

function Businesses({ ctx, city, open, onError }: ViewProps) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cat, setCat] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useData<Business[]>(`/api/panel/businesses?city=${city.id}&q=${encodeURIComponent(debounced)}&category=${cat}`, onError);

  return (
    <>
      <div className="page-head"><h1>Comércios</h1><div className="spacer" />
        <input className="input" placeholder="Buscar por nome ou bairro" style={{ maxWidth: 240 }} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 190 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {ctx.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => open({ kind: 'business', b: {} })}>+ Comércio</button></div>
      {!list ? <Spinner /> : list.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Comércio</th><th>Categoria</th><th>Bairro</th><th>Status</th><th>Dono (acesso)</th><th /></tr></thead>
          <tbody>{list.map((b) => (
            <tr key={b.id} className="click" onClick={() => open({ kind: 'business', b })}>
              <td><b>{b.name}</b>{b.featured && <> <span className="pill on">★ destaque</span></>}</td>
              <td>{b.category_icon} {b.category_name}</td>
              <td>{b.neighborhood || '—'}</td>
              <td>{b.active ? <span className="pill on">no ar</span> : <span className="pill off">oculto</span>} {b.booking_enabled && <span className="pill on">📅 agenda</span>}</td>
              <td className="small">{b.owners || <span className="muted">—</span>}</td>
              <td><div className="row-actions">
                <a className="btn sm" href={`/${b.city_slug}/${b.slug}`} target="_blank" onClick={stop}>Ver</a>
                {b.booking_enabled && <a className="btn sm" href={`/admin?loja=${b.id}`} onClick={stop}>Agenda</a>}
                <button className="btn sm" onClick={(e) => { stop(e); open({ kind: 'user', preset: { role: 'shop', business_id: b.id } }); }}>+ Acesso</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="card empty">Nenhum comércio encontrado.</div>}
    </>
  );
}

function BusinessModal({ ctx, city, b, onClose, onSaved, onError }: {
  ctx: Ctx; city: City; b: BizForm; onClose: () => void; onSaved: (newId: number | null, ownerName?: string) => void; onError: (e: unknown) => void;
}) {
  const [hours, setHours] = useState<Hours>(b.hours ?? {});
  const [booking, setBooking] = useState(!!b.booking_enabled);
  const [phone, setPhone] = useState(fmtPhone(b.phone));
  const [busy, setBusy] = useState(false);
  const barberCat = ctx.categories.find((c) => c.slug === 'barbearias')?.id;

  const toggleDay = (d: number, on: boolean) => setHours((h) => {
    const next = { ...h };
    if (on) next[d] = h[d] ?? ['08:00', '18:00']; else delete next[d];
    return next;
  });
  const setTime = (d: number, k: 0 | 1, v: string) => setHours((h) => {
    const cur = [...(h[d] ?? ['08:00', '18:00'])] as [string, string];
    cur[k] = v;
    return { ...h, [d]: cur };
  });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      city_id: city.id, lead_id: b.lead?.id,
      name: f.get('name'), category_id: Number(f.get('category_id')), description: f.get('description'),
      address: f.get('address'), neighborhood: f.get('neighborhood'), phone, instagram: f.get('instagram'),
      hours, active: f.get('active') === 'on', featured: f.get('featured') === 'on', booking_enabled: booking,
    };
    setBusy(true);
    try {
      const r = await api<{ id?: number }>(b.id ? `/api/panel/businesses/${b.id}` : '/api/panel/businesses', { method: b.id ? 'PUT' : 'POST', body });
      if (!r.id || !booking) toast('Comércio salvo.', 'success');
      onSaved(r.id && booking ? r.id : null, b.lead?.contact_name);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal onClose={onClose} wide>
      <h3>{b.id ? 'Editar comércio' : `Novo comércio em ${city.name}`}</h3>
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={b.name} required maxLength={100} /></div>
          <div className="field"><label>Categoria</label>
            <select className="input" name="category_id" required defaultValue={b.category_id ?? ''}
              onChange={(e) => { if (!b.id && Number(e.target.value) === barberCat) setBooking(true); }}>
              <option value="">Escolha…</option>
              {ctx.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select></div>
        </div>
        <div className="field"><label>Descrição (aparece na página)</label><textarea className="input" name="description" maxLength={500} rows={2} defaultValue={b.description ?? ''} /></div>
        <div className="grid-2">
          <div className="field"><label>Endereço</label><input className="input" name="address" defaultValue={b.address ?? ''} placeholder="Rua, número" /></div>
          <div className="field"><label>Bairro</label><input className="input" name="neighborhood" defaultValue={b.neighborhood ?? ''} /></div>
          <div className="field"><label>WhatsApp</label><input className="input" inputMode="tel" placeholder="(45) 99999-9999" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
          <div className="field"><label>Instagram</label><input className="input" name="instagram" defaultValue={b.instagram ? `@${b.instagram}` : ''} placeholder="@perfil" /></div>
        </div>
        <div className="field"><label>Horário de funcionamento</label></div>
        <div className="hours-grid">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} style={{ display: 'contents' }}>
              <label className="lbl check"><input type="checkbox" checked={!!hours[d]} onChange={(e) => toggleDay(d, e.target.checked)} />{WEEKDAYS[d]}</label>
              <div className={`hrow ${hours[d] ? '' : 'off'}`}>
                <input className="input" type="time" value={hours[d]?.[0] ?? '08:00'} onChange={(e) => setTime(d, 0, e.target.value)} /> às
                <input className="input" type="time" value={hours[d]?.[1] ?? '18:00'} onChange={(e) => setTime(d, 1, e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <div className="toggles" style={{ marginTop: 16 }}>
          <label className="check"><input type="checkbox" name="active" defaultChecked={b.active ?? true} /> No ar (aparece no guia)</label>
          <label className="check"><input type="checkbox" name="featured" defaultChecked={!!b.featured} /> Destaque na página da cidade</label>
          <label className="check"><input type="checkbox" checked={booking} onChange={(e) => setBooking(e.target.checked)} /> Agenda online (sistema de agendamento)</label>
          <div className="small muted hint">Libera o painel de agenda para o dono e o botão &quot;Agendar online&quot; na página.</div>
        </div>
        <div className="actions">
          {b.id && <a className="btn ghost" href={`/${city.slug}/${b.slug}`} target="_blank">Ver página</a>}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------- Pedidos de cadastro --------------------------- */

function Leads({ city, isSuper, open, onError, showAll }: ViewProps & { showAll: boolean }) {
  const [version, setVersion] = useState(0);
  const leads = useData<Lead[]>(`/api/panel/leads?city=${showAll ? 'all' : city.id}&v=${version}`, onError);
  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/api/panel/leads/${id}`, { method: 'PATCH', body: { status } });
      toast('Pedido atualizado.', 'success');
      setVersion((v) => v + 1);
    } catch (err) { onError(err); }
  };
  return (
    <>
      <div className="page-head"><h1>Pedidos de cadastro</h1><div className="spacer" />
        {isSuper && (
          <div className="tabs" style={{ margin: 0 }}>
            <Link href="/painel/pedidos" className={showAll ? '' : 'active'}>{city.name}</Link>
            <Link href="/painel/pedidos/todos" className={showAll ? 'active' : ''}>Todas as cidades</Link>
          </div>
        )}
      </div>
      <p className="muted" style={{ marginTop: -8 }}>Donos de comércio que preencheram &quot;Cadastre seu negócio&quot;. Fale com eles pelo WhatsApp e cadastre com um clique.</p>
      {!leads ? <Spinner /> : leads.length ? (
        <div className="list">{leads.map((l) => (
          <div className="list-item" key={l.id}>
            <div className="grow"><b>{l.business_name}</b> <span className="muted small">· {l.category_name || 'sem categoria'}{showAll ? ` · ${l.city_name || 'Outra cidade'}` : ''}</span>
              <div className="small">{l.contact_name} · {fmtPhone(l.phone)} <span className="muted">· {fmtDateShort(l.created_at.slice(0, 10))}</span></div>
              {l.message && <div className="small muted" style={{ marginTop: 4 }}>“{l.message}”</div>}</div>
            <span className={`badge ${LEAD_BADGE[l.status]}`}>{LEAD_STATUS[l.status]}</span>
            <select className="input" style={{ width: 'auto', padding: '6px 8px' }} value={l.status} onChange={(e) => setStatus(l.id, e.target.value)}>
              {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <a className="btn whats sm" target="_blank" href={whatsLink(l.phone, `Olá ${l.contact_name.split(' ')[0]}! Aqui é do Cidade 10, recebemos o cadastro do ${l.business_name}.`)}>WhatsApp</a>
            {l.status !== 'cadastrado' && l.city_id === city.id && (
              <button className="btn primary sm" onClick={() => open({ kind: 'business', b: { name: l.business_name, category_id: l.category_id ?? undefined, phone: l.phone, lead: l } })}>Cadastrar</button>
            )}
          </div>
        ))}</div>
      ) : <div className="card empty">Nenhum pedido por enquanto.</div>}
    </>
  );
}

/* ------------------------------- Acessos ------------------------------- */

function Users({ isSuper, open, onError }: ViewProps) {
  const users = useData<UserRow[]>('/api/panel/users', onError);
  return (
    <>
      <div className="page-head"><h1>Acessos</h1><div className="spacer" /><button className="btn primary" onClick={() => open({ kind: 'user', preset: {} })}>+ Acesso</button></div>
      <p className="muted" style={{ marginTop: -8 }}>{isSuper
        ? 'Admins das cidades e donos de comércio. Cada um só vê o que é dele.'
        : 'Donos de comércio da sua cidade. Com o acesso eles gerenciam a própria agenda online.'}</p>
      {!users ? <Spinner /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Onde</th><th>Status</th></tr></thead>
          <tbody>
            {users.length ? users.map((u) => (
              <tr key={u.id} className="click" onClick={() => open({ kind: 'editUser', u })}>
                <td><b>{u.name}</b></td><td>{u.email}</td><td>{ROLE_LABEL[u.role]}</td>
                <td>{u.role === 'city' ? u.city_name : u.role === 'shop'
                  ? <>{u.business_name}{!u.booking_enabled && <> <span className="pill off">agenda desativada</span></>}</> : 'Todas as cidades'}</td>
                <td>{u.active ? <span className="pill on">ativo</span> : <span className="pill off">desativado</span>}</td>
              </tr>
            )) : <tr><td colSpan={5} className="empty">Nenhum acesso ainda.</td></tr>}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function UserModal({ ctx, city, isSuper, preset, onClose, onCreated, onError }: {
  ctx: Ctx; city: City; isSuper: boolean; preset: NewUser; onClose: () => void;
  onCreated: (info: { name: string; email: string; password: string; role: Role }) => void; onError: (e: unknown) => void;
}) {
  const businesses = useData<Business[]>(`/api/panel/businesses?city=${city.id}`, onError);
  const [role, setRole] = useState<Role>(preset.role ?? (isSuper ? 'city' : 'shop'));
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const generate = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    setPw([...crypto.getRandomValues(new Uint8Array(10))].map((x) => chars[x % chars.length]).join(''));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { role, name: String(f.get('name')), email: String(f.get('email')), password: pw, city_id: Number(f.get('city_id')), business_id: Number(f.get('business_id')) };
    setBusy(true);
    try {
      await api('/api/panel/users', { method: 'POST', body });
      onCreated(body);
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <h3>Novo acesso</h3>
      <form onSubmit={submit}>
        {isSuper && (
          <div className="field"><label>Tipo</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        )}
        <div className="field" hidden={role !== 'city'}><label>Cidade</label>
          <select className="input" name="city_id" defaultValue={city.id}>{ctx.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field" hidden={role !== 'shop'}><label>Comércio ({city.name})</label>
          {!businesses ? <Spinner /> : (
            <select className="input" name="business_id" defaultValue={preset.business_id}>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}{b.booking_enabled ? ' · 📅' : ''}</option>)}
            </select>
          )}
          <span className="small muted">Comércios com 📅 têm agenda online. Sem ela, o dono não tem o que gerenciar.</span></div>
        <div className="grid-2">
          <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={preset.name} required /></div>
          <div className="field"><label>E-mail (login)</label><input className="input" type="email" name="email" required /></div>
        </div>
        <div className="field"><label>Senha inicial</label>
          <div className="row"><input className="input" required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="btn" onClick={generate}>Gerar</button></div>
          <span className="small muted">Envie para a pessoa e peça para trocar no primeiro acesso.</span></div>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Criar acesso</button></div>
      </form>
    </Modal>
  );
}

/** Dados de acesso prontos para enviar por WhatsApp. */
function LoginInfoModal({ name, email, password, role, onClose }: { name: string; email: string; password: string; role: Role; onClose: () => void }) {
  const text = `Olá ${name.split(' ')[0]}! Seu acesso ao painel do Cidade 10:\n${location.origin}/entrar/${role === 'shop' ? 'barbearia' : 'cidade'}\nE-mail: ${email}\nSenha: ${password}\nTroque a senha no primeiro acesso.`;
  return (
    <Modal onClose={onClose}>
      <h3>Acesso criado ✓</h3>
      <textarea className="input" rows={6} readOnly value={text} />
      <div className="actions">
        <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copiado!', 'success'))}>Copiar</button>
        <button className="btn primary" onClick={onClose}>Pronto</button>
      </div>
    </Modal>
  );
}

function EditUserModal({ u, selfId, onClose, onSaved, onError }: { u: UserRow; selfId: number; onClose: () => void; onSaved: (pw: string) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get('password') || '');
    setBusy(true);
    try {
      await api(`/api/panel/users/${u.id}`, { method: 'PUT', body: { name: f.get('name'), active: u.id === selfId || f.get('active') === 'on', password: pw || undefined } });
      onSaved(pw);
    } catch (err) { onError(err); setBusy(false); }
  }
  return (
    <Modal onClose={onClose}>
      <h3>{u.name}</h3>
      <p className="muted small" style={{ marginTop: -8 }}>{u.email} · {ROLE_LABEL[u.role]}</p>
      <form onSubmit={submit}>
        <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={u.name} required /></div>
        <div className="field"><label>Nova senha (deixe em branco para manter)</label><input className="input" name="password" minLength={6} autoComplete="new-password" /></div>
        <label className="check"><input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === selfId} /> Acesso ativo</label>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------- Cidades ------------------------------- */

function Cities({ ctx, open }: ViewProps) {
  return (
    <>
      <div className="page-head"><h1>Cidades</h1><div className="spacer" /><button className="btn primary" onClick={() => open({ kind: 'city' })}>+ Cidade</button></div>
      <div className="list">
        {ctx.cities.map((c) => (
          <div key={c.id} className="list-item click" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'city', c })}>
            <span className="dot" style={{ background: c.color, width: 14, height: 14 }} />
            <div className="grow"><b>{c.name} - {c.state}</b> {!c.active && <span className="pill off">inativa</span>}
              <div className="small muted">{c.tagline} · /{c.slug}</div></div>
            <a className="btn sm" href={`/${c.slug}`} target="_blank" onClick={stop}>Ver</a>
          </div>
        ))}
      </div>
    </>
  );
}

function CityModal({ c, onClose, onSaved, onError }: { c?: City; onClose: () => void; onSaved: (newId: number | null, created: boolean) => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get('name'), state: f.get('state'), color: f.get('color'), tagline: f.get('tagline'), description: f.get('description'), active: f.get('active') === 'on' };
    setBusy(true);
    try {
      const r = await api<{ id?: number }>(c ? `/api/panel/cities/${c.id}` : '/api/panel/cities', { method: c ? 'PUT' : 'POST', body });
      onSaved(r.id ?? null, !c);
    } catch (err) { onError(err); setBusy(false); }
  }
  return (
    <Modal onClose={onClose}>
      <h3>{c ? `Editar ${c.name}` : 'Nova cidade'}</h3>
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={c?.name} required /></div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field"><label>UF</label><input className="input" name="state" defaultValue={c?.state ?? 'PR'} maxLength={2} required style={{ textTransform: 'uppercase' }} /></div>
            <div className="field"><label>Cor</label><input className="input" type="color" name="color" defaultValue={c?.color ?? '#0f766e'} style={{ height: 44, padding: 4 }} /></div>
          </div>
        </div>
        <div className="field"><label>Frase de destaque</label><input className="input" name="tagline" defaultValue={c?.tagline ?? ''} placeholder="Tudo de [cidade] em um só lugar" /></div>
        <div className="field"><label>Descrição (Google)</label><textarea className="input" name="description" rows={2} defaultValue={c?.description ?? ''} /></div>
        <label className="check"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Cidade no ar</label>
        {!c && <p className="small muted">O endereço da página é criado a partir do nome e não muda depois.</p>}
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
      </form>
    </Modal>
  );
}
