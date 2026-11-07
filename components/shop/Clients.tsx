'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, toast } from '@/lib/client';
import { LoyaltyCard, Modal, Spinner } from '@/components/ui';
import { stop } from '@/components/panel/shared';
import { useShop } from './context';
import { addDays, fmtDateShort, fmtMin, fmtPhone, maskPhone, money, today, whatsLink, STATUS_LABEL } from '@/lib/format';
import type { Appointment, LoyaltyCard as Card } from '@/lib/types';

interface ClientRow {
  id: number; name: string; phone: string; notes: string | null; blocked: boolean;
  visits: number; no_shows: number; cancellations: number; total_spent: number; last_visit: string | null; next_visit: string | null;
  loyalty?: Card;
}
interface ClientDetail extends ClientRow {
  history: Appointment[];
  loyalty?: Card & { history: { kind: string; stamps: number; reward: string | null; note: string | null; created_at: string }[] };
}

type Filter = 'all' | 'away' | 'noshow' | 'top' | 'prize';

export function Clients({ openId }: { openId?: number }) {
  const { open, onError, settings, bookingUrl, version } = useShop();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { api<ClientRow[]>(`/api/admin/clients?q=${encodeURIComponent(debounced)}`).then(setRows).catch(onError); }, [debounced, version, onError]);
  useEffect(() => { if (openId) open({ kind: 'client', id: openId }); }, [openId, open]);

  const limit = addDays(today(), -30);
  const loyal = !!rows?.some((c) => c.loyalty);
  let list = rows ?? [];
  if (filter === 'away') list = list.filter((c) => c.last_visit && c.last_visit < limit && !c.next_visit);
  if (filter === 'noshow') list = list.filter((c) => c.no_shows > 0).sort((a, b) => b.no_shows - a.no_shows);
  if (filter === 'top') list = [...list].sort((a, b) => b.total_spent - a.total_spent).slice(0, 30);
  if (filter === 'prize') list = list.filter((c) => c.loyalty?.available);
  const tabs: [Filter, string][] = [['all', 'Todos'], ['away', 'Sumidos (+30 dias)'], ['noshow', 'Com faltas'], ['top', 'Mais fiéis'], ...(loyal ? [['prize', '🎁 Com prêmio'] as [Filter, string]] : [])];

  return (
    <>
      <div className="page-head">
        <h1>Clientes</h1><div className="spacer" />
        <input className="input" placeholder="Buscar por nome ou telefone" style={{ maxWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tabs">{tabs.map(([k, label]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}</button>)}</div>
      {!rows ? <Spinner /> : list.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Cliente</th><th>WhatsApp</th><th className="num">Visitas</th><th className="num">Faltas</th>
            <th className="num">Total gasto</th>{loyal && <th>Fidelidade</th>}<th>Última visita</th><th>Próximo</th>{filter === 'away' && <th />}</tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id} className="click" onClick={() => open({ kind: 'client', id: c.id })}>
              <td><b>{c.name}</b> {c.blocked && <span className="badge no_show">bloqueado</span>}</td>
              <td>{fmtPhone(c.phone)}</td>
              <td className="num">{c.visits}</td>
              <td className="num" style={c.no_shows ? { color: '#ff9f96' } : undefined}>{c.no_shows}</td>
              <td className="num">{money(c.total_spent)}</td>
              {loyal && <td>{!c.loyalty ? '' : c.loyalty.available
                ? <span className="badge done">🎁 {c.loyalty.available > 1 ? `${c.loyalty.available} prêmios` : 'prêmio'}</span>
                : `${c.loyalty.stamps % c.loyalty.goal}/${c.loyalty.goal}`}</td>}
              <td>{c.last_visit ? fmtDateShort(c.last_visit) : '—'}</td>
              <td>{c.next_visit ? fmtDateShort(c.next_visit) : '—'}</td>
              {filter === 'away' && <td><a className="btn whats sm" target="_blank" onClick={stop} href={whatsLink(c.phone,
                `Olá ${c.name.split(' ')[0]}! Faz tempo que você não aparece na ${settings.shop_name}. Bora dar um trato no visual? Agende aqui: ${bookingUrl()}`)}>Chamar de volta</a></td>}
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="card empty">Nenhum cliente encontrado.</div>}
    </>
  );
}

export function ClientModal({ id }: { id: number }) {
  const { close, open, refresh, onError, settings, bookingUrl } = useShop();
  const [c, setC] = useState<ClientDetail | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<ClientDetail>(`/api/admin/clients/${id}`).then((d) => { setC(d); setPhone(fmtPhone(d.phone)); }).catch(onError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const loyaltyAction = async (path: 'redeem' | 'adjust', body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/clients/${id}/loyalty/${path}`, { method: 'POST', body });
      toast(msg, 'success');
      await load();
      refresh();
    } catch (err) { onError(err); }
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/api/admin/clients/${id}`, { method: 'PUT', body: { name: f.get('name'), phone, notes: f.get('notes'), blocked: f.get('blocked') === 'on' } });
      toast('Cliente atualizado.', 'success');
      close();
      refresh();
    } catch (err) { onError(err); setBusy(false); }
  }

  if (!c) return <Modal onClose={close} wide><Spinner /></Modal>;
  const l = c.loyalty;
  return (
    <Modal onClose={close} wide>
      <h3>{c.name}</h3>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi"><div className="label">Visitas</div><div className="value">{c.visits}</div></div>
        <div className="kpi"><div className="label">Faltas</div><div className="value">{c.no_shows}</div></div>
        <div className="kpi"><div className="label">Cancel.</div><div className="value">{c.cancellations}</div></div>
        <div className="kpi gold"><div className="label">Gasto</div><div className="value" style={{ fontSize: 18 }}>{money(c.total_spent)}</div></div>
      </div>
      {l && (
        <div style={{ marginBottom: 16 }}>
          <LoyaltyCard l={l} />
          <div className="row wrap" style={{ marginTop: 8 }}>
            {l.available > 0 && <button type="button" className="btn primary sm" onClick={() =>
              confirm(`Usar o prêmio "${l.reward_label}" agora? O cartão volta a contar.`) && loyaltyAction('redeem', {}, 'Prêmio usado.')}>🎁 Usar prêmio</button>}
            <button type="button" className="btn sm" onClick={() => loyaltyAction('adjust', { stamps: 1, note: 'ajuste no painel' }, 'Cartão atualizado.')}>+1 selo</button>
            <button type="button" className="btn sm" onClick={() => loyaltyAction('adjust', { stamps: -1, note: 'ajuste no painel' }, 'Cartão atualizado.')}>−1 selo</button>
            {l.available > 0 && <a className="btn whats sm" target="_blank" href={whatsLink(c.phone,
              `Olá ${c.name.split(' ')[0]}! Você completou o cartão fidelidade da ${settings.shop_name} e ganhou ${l.reward_label}. É só agendar: ${bookingUrl()}`)}>Avisar que ganhou</a>}
          </div>
          {l.history.length > 0 && (
            <div className="small muted" style={{ marginTop: 8 }}>
              {l.history.slice(0, 5).map((h) => `${fmtDateShort(h.created_at.slice(0, 10))}: ${h.kind === 'redeem'
                ? `prêmio usado (${h.reward})` : `${h.stamps > 0 ? '+' : ''}${h.stamps} selo(s) à mão${h.note ? ` — ${h.note}` : ''}`}`).join(' · ')}
            </div>
          )}
        </div>
      )}
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={c.name} required /></div>
          <div className="field"><label>WhatsApp</label><input className="input" required value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
        </div>
        <div className="field"><label>Anotações (preferências, tipo de corte, alergias…)</label><textarea className="input" name="notes" defaultValue={c.notes ?? ''} /></div>
        <label className="check small"><input type="checkbox" name="blocked" defaultChecked={c.blocked} /> Bloquear agendamento online deste cliente</label>
        <div className="actions">
          <a className="btn whats" target="_blank" href={whatsLink(c.phone, `Olá ${c.name.split(' ')[0]}!`)}>WhatsApp</a>
          <div className="spacer" />
          <button type="button" className="btn" onClick={close}>Fechar</button>
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
      <h4 className="section-title" style={{ fontSize: 16 }}>Histórico</h4>
      {c.history.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Data</th><th>Serviço</th><th>Barbeiro</th><th className="num">Valor</th><th>Status</th></tr></thead>
          <tbody>{c.history.map((a) => (
            <tr key={a.id} className="click" onClick={() => open({ kind: 'appointment', a })}>
              <td>{fmtDateShort(a.date)} {fmtMin(a.start_min)}</td><td>{a.service_name}</td><td>{a.barber_name}</td>
              <td className="num">{money(a.price_cents)}</td><td><span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted">Sem atendimentos ainda.</p>}
    </Modal>
  );
}
