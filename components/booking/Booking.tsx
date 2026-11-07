'use client';
// Agendamento online do cliente (4 etapas) e "Meu horário" (consultar, confirmar e cancelar pelo código).
// Com shopId: página de agendamento da barbearia. Sem shopId: só a consulta por código (/meu-horario).

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, store, toast, ApiError } from '@/lib/client';
import { LoyaltyCard, Spinner } from '@/components/ui';
import {
  money, fmtDuration, fmtDateLong, fmtMin, addDays, parseDate, today, WEEKDAYS_SHORT, MONTHS, maskPhone, whatsLink,
  googleCalendarLink, STATUS_LABEL,
} from '@/lib/format';
import type { PublicAppointment } from '@/lib/types';

const STORE_KEY = 'barbearia:bookings';
const PROFILE_KEY = 'barbearia:perfil';

interface Info {
  settings: { shop_name: string; shop_phone: string; shop_address: string; max_days_ahead: number; cancel_limit_hours: number };
  today: string;
  page_path: string;
  city_name: string;
  services: { id: number; name: string; description: string | null; duration_min: number; price_cents: number }[];
  barbers: { id: number; name: string; color: string; weekdays: number[] }[];
  loyalty: { summary: string } | null;
}
type Slot = { time: string; start: number; barbers: number[] };
type Saved = { code: string; date: string; start: number };

export function Booking({ shopId, initialCode }: { shopId: number | null; initialCode?: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lookup, setLookup] = useState<{ open: boolean; code: string; nonce: number }>({ open: !shopId || !!initialCode, code: initialCode ?? '', nonce: 0 });
  const [upcomingKey, setUpcomingKey] = useState(0);
  const lookupRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!shopId) return;
    api<Info>(`/api/public/shops/${shopId}/info`).then(setInfo).catch((e: Error) => setLoadError(e.message));
  }, [shopId]);

  useEffect(() => {
    document.title = shopId ? (info ? `${info.settings.shop_name} · Agende seu horário` : 'Agende seu horário') : 'Meu horário · Cidade 10';
  }, [info, shopId]);

  const showLookup = (code = '') => {
    setLookup((l) => ({ open: true, code, nonce: l.nonce + 1 }));
    setTimeout(() => lookupRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const refreshUpcoming = () => setUpcomingKey((k) => k + 1);

  const s = info?.settings;
  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <img src="/img/icon.svg" alt="" className="logo" />
          <h1 className="brand">{shopId ? s?.shop_name ?? 'Barbearia' : 'Meu horário'}</h1>
          <p className="muted">{shopId ? (s ? `${s.shop_address} · ${info!.city_name}` : '') : 'Consulte, confirme ou cancele seu agendamento.'}</p>
          {shopId && info && (
            <div className="row hero-actions">
              <a className="btn ghost sm" href={info.page_path}>Página no Cidade 10</a>
              <a className="btn ghost sm" target="_blank" rel="noopener" href={whatsLink(s!.shop_phone, `Olá, ${s!.shop_name}!`)}>WhatsApp</a>
              <button className="btn ghost sm" onClick={() => showLookup()}>Meus horários</button>
            </div>
          )}
        </div>
      </header>

      <main className="wrap">
        <Upcoming key={upcomingKey} onOpen={showLookup} />
        {shopId && (
          <section className="card booking" id="booking">
            {loadError ? <p className="empty">Não foi possível carregar a agenda. {loadError}</p>
              : !info ? <Spinner />
              : !info.services.length || !info.barbers.length
                ? <p className="empty">A agenda online desta barbearia está sendo configurada. Fale com ela pelo WhatsApp.</p>
                : <Wizard info={info} shopId={shopId} onBooked={refreshUpcoming} />}
          </section>
        )}
        {lookup.open && (
          <section className="card" id="lookup" ref={lookupRef}>
            <Lookup key={lookup.nonce} initialCode={lookup.code} onChange={refreshUpcoming} />
          </section>
        )}
      </main>

      <footer className="foot muted small">Agendamento online pelo <Link href="/">Cidade 10</Link> · <Link href="/entrar/barbearia">Área do barbeiro</Link></footer>
    </>
  );
}

/* ------------------------------ Etapas ------------------------------ */

type State = { step: 1 | 2 | 3 | 4 | 5; serviceId: number | null; barberId: number | null; date: string | null; slot: Slot | null };
const STEPS = ['Serviço', 'Barbeiro', 'Horário', 'Seus dados'];

function Wizard({ info, shopId, onBooked }: { info: Info; shopId: number; onBooked: () => void }) {
  const [st, setSt] = useState<State>({ step: 1, serviceId: null, barberId: null, date: null, slot: null });
  const [booked, setBooked] = useState<PublicAppointment | null>(null);
  const top = useRef<HTMLOListElement>(null);
  const service = info.services.find((x) => x.id === st.serviceId) ?? null;

  const go = (patch: Partial<State>) => {
    setSt((s) => ({ ...s, ...patch }));
    top.current?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <ol className="steps" ref={top}>
        {STEPS.map((label, i) => (
          <li key={label} className={`${st.step === i + 1 ? 'active' : ''} ${st.step > i + 1 ? 'done' : ''}`}>{label}</li>
        ))}
      </ol>
      <div>
        {st.step === 1 && (
          <>
            <h2 className="step-title">Qual serviço?</h2>
            <p className="step-sub muted">Escolha o que você quer fazer hoje.</p>
            {info.loyalty && <div className="loyalty-banner">🎁 <span><b>Cartão fidelidade:</b> {info.loyalty.summary}</span></div>}
            <div className="options">
              {info.services.map((s) => (
                <button key={s.id} className={`option ${st.serviceId === s.id ? 'selected' : ''}`} onClick={() => go({ serviceId: s.id, slot: null, step: 2 })}>
                  <div className="info"><div className="name">{s.name}</div>{s.description && <div className="desc">{s.description}</div>}</div>
                  <div className="price">{money(s.price_cents)}<small>{fmtDuration(s.duration_min)}</small></div>
                </button>
              ))}
            </div>
          </>
        )}

        {st.step === 2 && (
          <>
            <h2 className="step-title">Com quem?</h2>
            <p className="step-sub muted">Escolha seu barbeiro ou deixe que a gente encaixe no primeiro horário livre.</p>
            <div className="options">
              {[{ id: null, name: 'Sem preferência', color: '', sub: 'Mais horários disponíveis' }, ...info.barbers.map((b) => ({ ...b, sub: 'Barbeiro' }))].map((b) => (
                <button key={b.id ?? 'any'} className={`option ${st.barberId === b.id ? 'selected' : ''}`} onClick={() => go({ barberId: b.id, slot: null, step: 3 })}>
                  {b.id ? <span className="avatar" style={{ background: b.color }}>{b.name[0]}</span> : <span className="avatar any">★</span>}
                  <div className="info"><div className="name">{b.name}</div><div className="desc">{b.sub}</div></div>
                </button>
              ))}
            </div>
            <div className="nav"><button className="btn" onClick={() => go({ step: 1 })}>Voltar</button></div>
          </>
        )}

        {st.step === 3 && service && (
          <Schedule info={info} shopId={shopId} service={service} st={st}
            onPick={(patch) => setSt((s) => ({ ...s, ...patch }))} onBack={() => go({ step: 2 })} onNext={() => go({ step: 4 })} />
        )}

        {st.step === 4 && service && st.slot && st.date && (
          <Details info={info} shopId={shopId} service={service} st={st} onBack={() => go({ step: 3 })}
            onTaken={() => go({ slot: null, step: 3 })}
            onDone={(appt) => { setBooked(appt); go({ step: 5 }); onBooked(); }} />
        )}

        {st.step === 5 && booked && (
          <Success appt={booked} info={info} onNew={() => { setBooked(null); go({ step: 1, serviceId: null, barberId: null, date: null, slot: null }); }} />
        )}
      </div>
    </>
  );
}

function Schedule({ info, shopId, service, st, onPick, onBack, onNext }: {
  info: Info; shopId: number; service: Info['services'][number]; st: State;
  onPick: (p: Partial<State>) => void; onBack: () => void; onNext: () => void;
}) {
  const days = Array.from({ length: info.settings.max_days_ahead + 1 }, (_, i) => addDays(info.today, i));
  const worksOn = useCallback((date: string) => {
    const wd = parseDate(date).getDay();
    const barbers = st.barberId ? info.barbers.filter((b) => b.id === st.barberId) : info.barbers;
    return barbers.some((b) => b.weekdays.includes(wd));
  }, [info, st.barberId]);
  const date = st.date && worksOn(st.date) ? st.date : days.find(worksOn) ?? days[0];
  // Resultado da última busca, marcado com a chave da busca: se a chave mudou, está carregando.
  const reqKey = `${date}|${service.id}|${st.barberId ?? ''}`;
  const [res, setRes] = useState<{ key: string; slots?: Slot[]; error?: string; nextFree?: string }>({ key: '' });
  const loading = res.key !== reqKey;
  const { slots, error = '', nextFree = null } = loading ? { slots: null } : res;
  const daysRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (date !== st.date) onPick({ date }); }, [date, st.date, onPick]);
  useEffect(() => { daysRef.current?.querySelector('.selected')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [date]);

  useEffect(() => {
    let alive = true;
    const fetchSlots = (d: string) => {
      const q = new URLSearchParams({ service: String(service.id), date: d });
      if (st.barberId) q.set('barber', String(st.barberId));
      return api<Slot[]>(`/api/public/shops/${shopId}/availability?${q}`);
    };
    fetchSlots(date).then(async (list) => {
      let next: string | undefined;
      // Sem horários: procura o próximo dia livre (até 14 dias).
      for (let i = 1; !list.length && i <= 14; i++) {
        const d = addDays(date, i);
        if (d > addDays(info.today, info.settings.max_days_ahead)) break;
        if (!worksOn(d)) continue;
        if ((await fetchSlots(d).catch(() => [])).length) { next = d; break; }
      }
      if (alive) setRes({ key: reqKey, slots: list, nextFree: next });
    }).catch((e: Error) => alive && setRes({ key: reqKey, error: e.message }));
    return () => { alive = false; };
  }, [date, service.id, st.barberId, shopId, info, worksOn, reqKey]);

  const groups: [string, number, number][] = [['Manhã', 0, 720], ['Tarde', 720, 1080], ['Noite', 1080, 1440]];
  return (
    <>
      <h2 className="step-title">Quando?</h2>
      <p className="step-sub muted">{service.name} · {fmtDuration(service.duration_min)}</p>
      <div className="days" ref={daysRef}>
        {days.map((d) => {
          const dt = parseDate(d);
          return (
            <button key={d} className={`day ${d === date ? 'selected' : ''}`} disabled={!worksOn(d)} onClick={() => onPick({ date: d, slot: null })}>
              <div className="wd">{d === info.today ? 'Hoje' : WEEKDAYS_SHORT[dt.getDay()]}</div>
              <div className="dn">{dt.getDate()}</div>
              <div className="mo">{MONTHS[dt.getMonth()]}</div>
            </button>
          );
        })}
      </div>
      <div>
        {error ? <p className="empty">{error}</p>
          : !slots ? <Spinner />
          : !slots.length ? (
            <div className="empty">Sem horários livres em {fmtDateLong(date)}.
              {nextFree && <><br /><br /><button className="btn sm" onClick={() => onPick({ date: nextFree, slot: null })}>Próximo dia livre: {fmtDateLong(nextFree)}</button></>}
            </div>
          ) : groups.map(([label, from, to]) => {
            const list = slots.filter((s) => s.start >= from && s.start < to);
            return list.length > 0 && (
              <div className="period" key={label}><h4>{label}</h4><div className="slots">
                {list.map((s) => (
                  <button key={s.start} className={`slot ${st.slot?.start === s.start ? 'selected' : ''}`} onClick={() => onPick({ slot: s })}>{s.time}</button>
                ))}
              </div></div>
            );
          })}
      </div>
      <div className="nav">
        <button className="btn" onClick={onBack}>Voltar</button>
        <button className="btn primary" disabled={!st.slot} onClick={onNext}>Continuar</button>
      </div>
    </>
  );
}

function Summary({ service, barberName, date, start, end, price }: { service: string; barberName: string; date: string; start: number; end?: number; price: number }) {
  return (
    <div className="summary">
      <div className="line"><span>Serviço</span><span>{service}</span></div>
      <div className="line"><span>Barbeiro</span><span>{barberName}</span></div>
      <div className="line"><span>Data</span><span>{fmtDateLong(date)}</span></div>
      <div className="line"><span>Horário</span><span>{fmtMin(start)}{end ? ` – ${fmtMin(end)}` : ''}</span></div>
      <div className="line total"><span>Total</span><span>{money(price)}</span></div>
    </div>
  );
}

function Details({ info, shopId, service, st, onBack, onTaken, onDone }: {
  info: Info; shopId: number; service: Info['services'][number]; st: State;
  onBack: () => void; onTaken: () => void; onDone: (a: PublicAppointment) => void;
}) {
  const [profile] = useState(() => store.get(PROFILE_KEY, { name: '', phone: '' }));
  const [phone, setPhone] = useState(profile.phone);
  const [busy, setBusy] = useState(false);
  const barber = info.barbers.find((b) => b.id === st.barberId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name')).trim();
    if (phone.replace(/\D/g, '').length < 10) return toast('Informe um WhatsApp válido com DDD.', 'error');
    setBusy(true);
    try {
      const appt = await api<PublicAppointment>(`/api/public/shops/${shopId}/appointments`, {
        method: 'POST',
        body: { serviceId: service.id, barberId: st.barberId, date: st.date, start: st.slot!.start, name, phone, notes: f.get('notes') },
      });
      store.set(PROFILE_KEY, { name, phone });
      store.set(STORE_KEY, [...store.get<Saved[]>(STORE_KEY, []).filter((x) => x.code !== appt.code), { code: appt.code, date: appt.date, start: appt.start_min }]);
      onDone(appt);
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
      if (err instanceof ApiError && err.status === 409 && err.message.includes('ocupado')) onTaken();
    }
  }

  return (
    <>
      <h2 className="step-title">Quase lá!</h2>
      <p className="step-sub muted">Confira o resumo e informe seus dados.</p>
      <Summary service={service.name} barberName={barber ? barber.name : 'Primeiro disponível'} date={st.date!}
        start={st.slot!.start} end={st.slot!.start + service.duration_min} price={service.price_cents} />
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="name">Seu nome</label>
          <input className="input" id="name" name="name" required autoComplete="name" maxLength={80} defaultValue={profile.name} /></div>
        <div className="field"><label htmlFor="phone">WhatsApp (com DDD)</label>
          <input className="input" id="phone" required inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
        <div className="field"><label htmlFor="notes">Observação (opcional)</label>
          <input className="input" id="notes" name="notes" maxLength={200} placeholder="Ex.: degradê baixo, tesoura em cima" /></div>
        <p className="small muted">Cancelamentos online até {info.settings.cancel_limit_hours}h antes do horário.</p>
        <div className="nav">
          <button className="btn" type="button" onClick={onBack}>Voltar</button>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Agendando…' : 'Confirmar agendamento'}</button>
        </div>
      </form>
    </>
  );
}

function LoyaltyBlock({ a }: { a: PublicAppointment }) {
  const l = a.loyalty;
  if (!l?.goal) return null;
  return (
    <div style={{ margin: '14px 0' }}>
      <LoyaltyCard l={l} title={`Seu cartão fidelidade${a.shop_name ? ` · ${a.shop_name}` : ''}`} />
      <p className="small muted" style={{ margin: '6px 0 0', textAlign: 'left' }}>{l.summary} Cada atendimento concluído vale um selo.</p>
    </div>
  );
}

function Success({ appt, info, onNew }: { appt: PublicAppointment; info: Info; onNew: () => void }) {
  const s = info.settings;
  const msg = `Olá! Acabei de agendar ${appt.service_name} com ${appt.barber_name} em ${fmtDateLong(appt.date)} às ${appt.start}. Código: ${appt.code}`;
  return (
    <div className="success">
      <div className="check">✓</div>
      <h2 className="step-title">Horário reservado!</h2>
      <p className="muted">Guarde seu código para consultar ou cancelar:</p>
      <div className="code">{appt.code}</div>
      <Summary service={appt.service_name} barberName={appt.barber_name} date={appt.date} start={appt.start_min} end={appt.end_min} price={appt.price_cents} />
      <LoyaltyBlock a={appt} />
      <div className="stack">
        <a className="btn primary block" target="_blank" rel="noopener" href={googleCalendarLink({
          title: `${appt.service_name} - ${s.shop_name}`, date: appt.date, startMin: appt.start_min, endMin: appt.end_min,
          details: `Barbeiro: ${appt.barber_name}\nCódigo: ${appt.code}\n${location.origin}/meu-horario?codigo=${appt.code}`, location: s.shop_address,
        })}>Adicionar à minha agenda</a>
        <a className="btn whats block" target="_blank" rel="noopener" href={whatsLink(s.shop_phone, msg)}>Avisar a barbearia no WhatsApp</a>
        <button className="btn block" onClick={onNew}>Fazer outro agendamento</button>
      </div>
    </div>
  );
}

/* ------------------------- Meus horários ------------------------- */

function Upcoming({ onOpen }: { onOpen: (code: string) => void }) {
  const [appts, setAppts] = useState<PublicAppointment[]>([]);
  useEffect(() => {
    const saved = store.get<Saved[]>(STORE_KEY, []).filter((x) => x.date >= today());
    if (!saved.length) return;
    Promise.all(saved.map((x) => api<PublicAppointment>(`/api/public/appointments/${x.code}`).catch(() => null))).then((list) => {
      const active = list.filter((a): a is PublicAppointment => !!a && ['scheduled', 'confirmed'].includes(a.status));
      store.set(STORE_KEY, active.map((a) => ({ code: a.code, date: a.date, start: a.start_min })));
      setAppts(active);
    });
  }, []);
  if (!appts.length) return null;
  return (
    <section className="card">
      <h3 style={{ marginBottom: 8 }}>Seus próximos horários</h3>
      {appts.map((a) => (
        <div className="upcoming-item" key={a.code}>
          <span className="avatar" style={{ background: a.barber_color }}>{a.barber_name[0]}</span>
          <div style={{ flex: 1 }}>
            <div><b>{a.service_name}</b> com {a.barber_name}</div>
            <div className="small muted">{a.shop_name}</div>
            <div className="small muted">{fmtDateLong(a.date)} às {a.start}</div>
          </div>
          <button className="btn sm" onClick={() => onOpen(a.code)}>Ver</button>
        </div>
      ))}
    </section>
  );
}

function Lookup({ initialCode, onChange }: { initialCode: string; onChange: () => void }) {
  const [code, setCode] = useState(initialCode);
  // query = código buscado (n muda para buscar de novo depois de confirmar/cancelar).
  const [query, setQuery] = useState({ code: initialCode, n: 0 });
  const [result, setResult] = useState<{ q?: typeof query; appt?: PublicAppointment; error?: string }>({});
  const load = (c: string) => setQuery((q) => ({ code: c, n: q.n + 1 }));

  useEffect(() => {
    if (!query.code) return;
    let alive = true;
    api<PublicAppointment>(`/api/public/appointments/${encodeURIComponent(query.code)}`)
      .then((appt) => alive && setResult({ q: query, appt }))
      .catch((e: Error) => alive && setResult({ q: query, error: e.message }));
    return () => { alive = false; };
  }, [query]);

  const state = result.q === query ? result : { loading: !!query.code };
  const a = 'appt' in state ? state.appt : undefined;
  const active = a && ['scheduled', 'confirmed'].includes(a.status);
  const act = async (path: 'confirm' | 'cancel') => {
    if (path === 'cancel' && !confirm('Tem certeza que deseja cancelar este horário?')) return;
    try {
      await api(`/api/public/appointments/${a!.code}/${path}`, { method: 'POST' });
      toast(path === 'confirm' ? 'Presença confirmada. Até lá!' : 'Horário cancelado.', 'success');
      load(a!.code);
      onChange();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <>
      <h3 style={{ marginBottom: 10 }}>Consultar agendamento</h3>
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(code.trim()); }}>
        <input className="input" placeholder="Código (ex.: K7Q2XM)" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} style={{ textTransform: 'uppercase' }} />
        <button className="btn primary">Buscar</button>
      </form>
      {'loading' in state && state.loading && <Spinner />}
      {'error' in state && state.error && <p className="empty">{state.error}</p>}
      {a && (
        <>
          <div style={{ marginTop: 14 }} className="row">
            <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
            <span className="small muted">{a.shop_name} · código {a.code}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Summary service={a.service_name} barberName={a.barber_name} date={a.date} start={a.start_min} end={a.end_min} price={a.price_cents} />
          </div>
          <LoyaltyBlock a={a} />
          {active && (
            <div className="row wrap">
              {a.status === 'scheduled' && <button className="btn ok" onClick={() => act('confirm')}>Confirmar presença</button>}
              <button className="btn danger" onClick={() => act('cancel')}>Cancelar horário</button>
              <a className="btn whats" target="_blank" rel="noopener" href={whatsLink(a.shop_phone, `Olá! Preciso remarcar meu horário (código ${a.code}).`)}>Remarcar pelo WhatsApp</a>
            </div>
          )}
        </>
      )}
    </>
  );
}
