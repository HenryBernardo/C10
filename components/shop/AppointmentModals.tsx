'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, toast } from '@/lib/client';
import { LoyaltyCard, Modal } from '@/components/ui';
import { fillTemplate, useShop, type NewApptOptions } from './context';
import {
  fmtDateLong, fmtDuration, fmtMin, fmtPhone, maskPhone, money, today, whatsLink, PAYMENT_LABEL, STATUS_LABEL,
} from '@/lib/format';
import type { Appointment, LoyaltyCard as Card, Payment } from '@/lib/types';

interface ClientDetail { no_shows: number; visits: number; total_spent: number; loyalty?: Card }

/** Detalhe do agendamento: concluir com forma de pagamento, confirmar, remarcar, falta, cancelar, usar prêmio. */
export function AppointmentModal({ a }: { a: Appointment }) {
  const { close, refresh, onError, open, settings, href } = useShop();
  const [client, setClient] = useState<ClientDetail | null>(null);
  useEffect(() => { api<ClientDetail>(`/api/admin/clients/${a.client_id}`).then(setClient).catch(onError); }, [a.client_id, onError]);

  const patch = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body });
      toast(msg, 'success');
      close();
      refresh();
    } catch (err) { onError(err); }
  };
  const usePrize = async () => {
    if (!client?.loyalty || !confirm(`Usar o prêmio "${client.loyalty.reward_label}" neste atendimento? O valor é ajustado e o cartão volta a contar.`)) return;
    try {
      await api(`/api/admin/clients/${a.client_id}/loyalty/redeem`, { method: 'POST', body: { appointmentId: a.id } });
      toast('Prêmio aplicado!', 'success');
      close();
      refresh();
    } catch (err) { onError(err); }
  };
  const active = a.status === 'scheduled' || a.status === 'confirmed';
  const reminder = fillTemplate(settings.reminder_template, settings.shop_name, a, { date: fmtDateLong, time: fmtMin });

  return (
    <Modal onClose={close}>
      <div className="detail-head">
        <span className="avatar" style={{ background: a.barber_color, width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#111', fontWeight: 700 }}>{a.client_name[0]}</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>{a.client_name}</h3>
          <a href={whatsLink(a.client_phone, `Olá ${a.client_name.split(' ')[0]}!`)} target="_blank" className="small">{fmtPhone(a.client_phone)}</a>
        </div>
        <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      {!!client?.no_shows && <div className="alert">⚠ Este cliente já faltou {client.no_shows} vez(es) sem avisar.</div>}
      {client?.loyalty && (
        <div style={{ marginBottom: 12 }}>
          <LoyaltyCard l={client.loyalty} />
          {client.loyalty.available > 0 && a.status !== 'cancelled' && a.status !== 'no_show' && (
            <button className="btn primary block" style={{ marginTop: 8 }} onClick={usePrize}>🎁 Usar prêmio neste atendimento</button>
          )}
        </div>
      )}
      <dl className="detail-grid">
        <dt>Serviço</dt><dd>{a.service_name}</dd>
        <dt>Barbeiro</dt><dd>{a.barber_name}</dd>
        <dt>Quando</dt><dd>{fmtDateLong(a.date)}, {fmtMin(a.start_min)}–{fmtMin(a.end_min)}</dd>
        <dt>Valor</dt><dd>{money(a.price_cents)}{a.payment ? ` · ${PAYMENT_LABEL[a.payment]}` : ''}</dd>
        <dt>Origem</dt><dd>{a.source === 'online' ? 'Agendamento online' : 'Pelo painel'} · código {a.code}</dd>
        {client && <><dt>Histórico</dt><dd>{client.visits} visita(s) · {money(client.total_spent)} gastos</dd></>}
        {a.notes && <><dt>Obs.</dt><dd>{a.notes}</dd></>}
      </dl>
      {active ? (
        <>
          <a className="btn whats block" target="_blank" href={whatsLink(a.client_phone, reminder)}
            onClick={() => api(`/api/admin/appointments/${a.id}`, { method: 'PATCH', body: { reminded: true } }).catch(onError)}>
            {a.reminded ? 'Reenviar lembrete' : 'Enviar lembrete no WhatsApp'}
          </a>
          <div className="field" style={{ margin: '14px 0 6px' }}><label>Concluir atendimento — forma de pagamento</label>
            <div className="pay-row">
              {(['pix', 'dinheiro', 'cartao'] as Payment[]).map((p) => (
                <button key={p} className="btn ok sm" onClick={() => patch({ status: 'done', payment: p }, 'Atendimento concluído.')}>✓ {PAYMENT_LABEL[p]}</button>
              ))}
            </div></div>
          <div className="btn-grid" style={{ marginTop: 10 }}>
            {a.status === 'scheduled' && <button className="btn" onClick={() => patch({ status: 'confirmed' }, 'Confirmado.')}>Marcar confirmado</button>}
            <button className="btn" onClick={() => open({ kind: 'newAppt', opts: { editing: a } })}>Remarcar</button>
            <button className="btn danger" onClick={() => confirm('Marcar que o cliente faltou?') && patch({ status: 'no_show' }, 'Falta registrada.')}>Faltou</button>
            <button className="btn danger" onClick={() => confirm('Cancelar este agendamento? O horário volta a ficar livre.') && patch({ status: 'cancelled' }, 'Agendamento cancelado.')}>Cancelar</button>
          </div>
        </>
      ) : (
        <div className="btn-grid">
          <button className="btn" onClick={() => patch({ status: 'confirmed' }, 'Agendamento reaberto.')}>Reabrir agendamento</button>
          {a.status === 'done' && (
            <div className="pay-row">
              {(['pix', 'dinheiro', 'cartao'] as Payment[]).map((p) => (
                <button key={p} className={`btn sm ${a.payment === p ? 'sel' : ''}`} onClick={() => patch({ payment: p }, 'Pagamento atualizado.')}>{PAYMENT_LABEL[p]}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="actions">
        <Link className="btn ghost" href={href(`/admin/clientes/${a.client_id}`)} onClick={close}>Ficha do cliente</Link>
        <button className="btn" onClick={close}>Fechar</button>
      </div>
    </Modal>
  );
}

/** Cria (ou remarca, com `editing`) um agendamento pelo painel. */
export function NewAppointmentModal({ date: initDate = today(), barberId, start, editing }: NewApptOptions) {
  const { close, refresh, onError, services, barbers, navigate } = useShop();
  const pathname = usePathname();
  const activeServices = services.filter((s) => s.active);
  const activeBarbers = barbers.filter((b) => b.active);
  const [serviceId, setServiceId] = useState(editing?.service_id ?? activeServices[0]?.id);
  const [barber, setBarber] = useState(editing?.barber_id ?? barberId ?? activeBarbers[0]?.id);
  const [date, setDate] = useState(editing?.date ?? initDate);
  const [time, setTime] = useState(editing ? fmtMin(editing.start_min) : start != null ? fmtMin(start) : '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<{ name: string; phone: string }[]>([]);
  const freeKey = `${serviceId}|${barber}|${date}`;
  const [freeRes, setFreeRes] = useState<{ key: string; value: { time: string }[] | string }>({ key: '', value: [] });
  const free = freeRes.key === freeKey ? freeRes.value : null;
  const [busy, setBusy] = useState(false);

  // Horários livres do barbeiro no dia (ao remarcar, o próprio horário conta como livre).
  useEffect(() => {
    if (!serviceId || !barber || !date) return;
    let alive = true;
    api<{ time: string }[]>(`/api/admin/availability?service=${serviceId}&barber=${barber}&date=${date}&exclude=${editing?.id ?? ''}`)
      .then((s) => alive && setFreeRes({ key: freeKey, value: s.slice(0, 40) }))
      .catch((e: Error) => alive && setFreeRes({ key: freeKey, value: e.message }));
    return () => { alive = false; };
  }, [serviceId, barber, date, editing?.id, freeKey]);

  // Sugere clientes já cadastrados enquanto digita o nome.
  useEffect(() => {
    if (editing || name.trim().length < 2 || found.some((c) => c.name === name.trim())) return;
    const t = setTimeout(() => api<{ name: string; phone: string }[]>(`/api/admin/clients?q=${encodeURIComponent(name.trim())}`).then(setFound).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [name, editing, found]);
  const typeName = (value: string) => {
    setName(value);
    const match = found.find((c) => c.name === value.trim());
    if (match) setPhone(fmtPhone(match.phone));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { serviceId, barberId: barber, date, start: time, force: f.get('force') === 'on' };
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/admin/appointments/${editing.id}`, { method: 'PATCH', body });
        toast('Horário remarcado. Avise o cliente pelo WhatsApp.', 'success');
      } else {
        await api('/api/admin/appointments', { method: 'POST', body: { ...body, name, phone, notes: f.get('notes') } });
        toast('Agendamento criado.', 'success');
      }
      close();
      const current = pathname.split('/')[3] || today();
      if (pathname.startsWith('/admin') && (pathname === '/admin' || pathname.startsWith('/admin/agenda')) && date !== current) navigate(`/admin/agenda/${date}`);
      else refresh();
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal onClose={close}>
      <h3>{editing ? `Remarcar · ${editing.client_name}` : 'Novo agendamento'}</h3>
      <form onSubmit={submit}>
        {!editing && (
          <div className="grid-2">
            <div className="field"><label>Cliente</label>
              <input className="input" list="clients-dl" required autoComplete="off" placeholder="Nome" value={name} onChange={(e) => typeName(e.target.value)} />
              <datalist id="clients-dl">{found.slice(0, 8).map((c) => <option key={c.phone} value={c.name}>{fmtPhone(c.phone)}</option>)}</datalist></div>
            <div className="field"><label>WhatsApp</label>
              <input className="input" required inputMode="tel" placeholder="(11) 98765-4321" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
          </div>
        )}
        <div className="grid-2">
          <div className="field"><label>Serviço</label>
            <select className="input" value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
              {activeServices.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtDuration(s.duration_min)} · {money(s.price_cents)}</option>)}
            </select></div>
          <div className="field"><label>Barbeiro</label>
            <select className="input" value={barber} onChange={(e) => setBarber(Number(e.target.value))}>
              {activeBarbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
        </div>
        <div className="grid-2">
          <div className="field"><label>Data</label><input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>Horário</label><input className="input" type="time" step={300} required value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field"><label>Horários livres</label>
          <div className="pay-row">
            {free === null ? <span className="small muted">Carregando…</span>
              : typeof free === 'string' ? <span className="small muted">{free}</span>
              : free.length ? free.map((s) => <button key={s.time} type="button" className={`btn sm ${time === s.time ? 'sel' : ''}`} onClick={() => setTime(s.time)}>{s.time}</button>)
              : <span className="small muted">Nenhum horário livre neste dia (use o encaixe se necessário).</span>}
          </div></div>
        {!editing && <div className="field"><label>Observação</label><input className="input" name="notes" maxLength={300} /></div>}
        <label className="check small"><input type="checkbox" name="force" /> Encaixe fora do expediente (ignora horário de trabalho e almoço)</label>
        <div className="actions">
          <button type="button" className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{editing ? 'Salvar novo horário' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function BlockModal({ date = today() }: { date?: string }) {
  const { close, refresh, onError, barbers } = useShop();
  const [allDay, setAllDay] = useState(true);
  const [ds, setDs] = useState(date);
  const [de, setDe] = useState(date);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api('/api/admin/blocks', {
        method: 'POST',
        body: {
          barber_id: f.get('barber') || null, date_start: ds, date_end: de,
          start: allDay ? null : f.get('ts'), end: allDay ? null : f.get('te'), reason: f.get('reason'),
        },
      });
      toast('Horário bloqueado.', 'success');
      close();
      refresh();
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal onClose={close}>
      <h3>Bloquear horário</h3>
      <p className="small muted" style={{ marginTop: -6 }}>Folga, férias, médico, curso… Clientes não conseguirão agendar nesse período.</p>
      <form onSubmit={submit}>
        <div className="field"><label>Quem</label>
          <select className="input" name="barber">
            <option value="">Barbearia inteira</option>
            {barbers.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
        <div className="grid-2">
          <div className="field"><label>De</label><input className="input" type="date" required value={ds} onChange={(e) => { setDs(e.target.value); if (de < e.target.value) setDe(e.target.value); }} /></div>
          <div className="field"><label>Até</label><input className="input" type="date" required value={de} onChange={(e) => setDe(e.target.value)} /></div>
        </div>
        <label className="check small" style={{ marginBottom: 12 }}><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Dia inteiro</label>
        {!allDay && (
          <div className="grid-2">
            <div className="field"><label>Das</label><input className="input" type="time" name="ts" defaultValue="12:00" /></div>
            <div className="field"><label>Até</label><input className="input" type="time" name="te" defaultValue="14:00" /></div>
          </div>
        )}
        <div className="field"><label>Motivo</label><input className="input" name="reason" maxLength={120} placeholder="Ex.: Folga, Férias, Médico" /></div>
        <div className="actions"><button type="button" className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={busy}>Bloquear</button></div>
      </form>
    </Modal>
  );
}
