'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, toast } from '@/lib/client';
import { Modal, Spinner } from '@/components/ui';
import { PasswordModal } from '@/components/panel/shared';
import { useShop } from './context';
import { fmtDateLong, fmtDateShort, fmtDuration, fmtMin, fmtPhone, maskPhone, money, WEEKDAYS } from '@/lib/format';
import type { Barber, BarberHour, Service } from '@/lib/types';

const TABS = { barbearia: 'Barbearia', servicos: 'Serviços', barbeiros: 'Barbeiros e horários', bloqueios: 'Folgas e bloqueios' } as const;
type Tab = keyof typeof TABS;

export function Config({ tab: tabArg }: { tab?: string }) {
  const { navigate } = useShop();
  const tab = (tabArg && tabArg in TABS ? tabArg : 'barbearia') as Tab;
  return (
    <>
      <div className="page-head"><h1>Configurações</h1></div>
      <div className="tabs">{(Object.keys(TABS) as Tab[]).map((k) => (
        <button key={k} className={k === tab ? 'active' : ''} onClick={() => navigate(`/admin/config/${k}`)}>{TABS[k]}</button>
      ))}</div>
      {tab === 'barbearia' && <ShopSettings />}
      {tab === 'servicos' && <Services />}
      {tab === 'barbeiros' && <Barbers />}
      {tab === 'bloqueios' && <Blocks />}
    </>
  );
}

function ShopSettings() {
  const { settings, reloadBase, onError, bookingUrl } = useShop();
  const [phone, setPhone] = useState(fmtPhone(settings.shop_phone));
  const [pw, setPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const num = (id: keyof typeof settings, label: string, hint: string) => (
    <div className="field"><label htmlFor={id}>{label}</label>
      <input className="input" type="number" min={0} id={id} name={id} defaultValue={settings[id]} /><span className="small muted">{hint}</span></div>
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { ...Object.fromEntries(new FormData(e.currentTarget)), shop_phone: phone };
    setBusy(true);
    try {
      await api('/api/admin/settings', { method: 'PUT', body });
      await reloadBase();
      toast('Configurações salvas.', 'success');
    } catch (err) { onError(err); }
    setBusy(false);
  }

  return (
    <div className="panel-grid">
      <form className="card" onSubmit={submit}>
        <h3 style={{ marginBottom: 14, fontSize: 18 }}>Dados e regras</h3>
        <div className="field"><label>Nome da barbearia</label><input className="input" name="shop_name" defaultValue={settings.shop_name} required /></div>
        <div className="field"><label>WhatsApp da barbearia</label><input className="input" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
        <div className="field"><label>Endereço</label><input className="input" name="shop_address" defaultValue={settings.shop_address} /></div>
        <div className="grid-2">
          {num('slot_interval', 'Intervalo da grade (min)', 'De quanto em quanto tempo aparecem horários.')}
          {num('min_advance_min', 'Antecedência mínima (min)', 'Evita agendamento "em cima da hora".')}
          {num('max_days_ahead', 'Agenda aberta (dias)', 'Até quantos dias à frente o cliente vê.')}
          {num('cancel_limit_hours', 'Cancelar online até (horas antes)', 'Depois disso, só pelo WhatsApp.')}
          {num('max_active_per_phone', 'Agendamentos por cliente', 'Máximo de horários futuros por telefone.')}
          {num('block_after_no_shows', 'Bloquear após X faltas', 'Cliente que falta muito precisa falar com você.')}
        </div>
        <div className="field"><label>Mensagem de lembrete (WhatsApp)</label>
          <textarea className="input" name="reminder_template" rows={4} defaultValue={settings.reminder_template} />
          <span className="small muted">Variáveis: {'{cliente} {barbearia} {servico} {barbeiro} {data} {hora} {link}'}</span></div>
        <button className="btn primary" disabled={busy}>Salvar</button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8, fontSize: 18 }}>Link de agendamento</h3>
          <p className="small muted">Divulgue na bio do Instagram, no status do WhatsApp e no Google Meu Negócio.</p>
          <div className="row"><input className="input" readOnly value={bookingUrl()} />
            <button className="btn" onClick={() => navigator.clipboard.writeText(bookingUrl()).then(() => toast('Link copiado!', 'success'))}>Copiar</button></div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8, fontSize: 18 }}>Minha senha</h3>
          <button className="btn" onClick={() => setPw(true)}>Alterar senha</button>
        </div>
      </div>
      {pw && <PasswordModal onClose={() => setPw(false)} onDone={() => { location.href = '/entrar/barbearia'; }} />}
    </div>
  );
}

function Services() {
  const { services, open } = useShop();
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="muted">Preço e duração definem a agenda online.</span><div className="spacer" />
        <button className="btn primary" onClick={() => open({ kind: 'service' })}>+ Serviço</button></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Serviço</th><th>Duração</th><th className="num">Preço</th><th>Status</th></tr></thead>
        <tbody>{services.map((s) => (
          <tr key={s.id} className="click" onClick={() => open({ kind: 'service', s })}>
            <td><b>{s.name}</b><div className="small muted">{s.description}</div></td>
            <td>{fmtDuration(s.duration_min)}</td><td className="num">{money(s.price_cents)}</td>
            <td>{s.active ? <span className="badge done">Ativo</span> : <span className="badge cancelled">Inativo</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

export function ServiceModal({ s }: { s?: Service }) {
  const { close, reloadBase, onError } = useShop();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: f.get('name'), description: f.get('description'), duration_min: Number(f.get('duration')),
      price_cents: Math.round(Number(f.get('price')) * 100), active: f.get('active') === 'on',
    };
    setBusy(true);
    try {
      await api(s ? `/api/admin/services/${s.id}` : '/api/admin/services', { method: s ? 'PUT' : 'POST', body });
      toast('Serviço salvo.', 'success');
      close();
      await reloadBase();
    } catch (err) { onError(err); setBusy(false); }
  }
  return (
    <Modal onClose={close}>
      <h3>{s ? 'Editar serviço' : 'Novo serviço'}</h3>
      <form onSubmit={submit}>
        <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={s?.name} required maxLength={60} /></div>
        <div className="field"><label>Descrição</label><input className="input" name="description" defaultValue={s?.description ?? ''} maxLength={200} /></div>
        <div className="grid-2">
          <div className="field"><label>Duração (min)</label><input className="input" type="number" min={5} step={5} name="duration" defaultValue={s?.duration_min ?? 30} required /></div>
          <div className="field"><label>Preço (R$)</label><input className="input" type="number" min={0} step={0.01} name="price" defaultValue={((s?.price_cents ?? 0) / 100).toFixed(2)} required /></div>
        </div>
        <label className="check"><input type="checkbox" name="active" defaultChecked={s?.active ?? true} /> Disponível para agendamento</label>
        <div className="actions"><button type="button" className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
      </form>
    </Modal>
  );
}

function Barbers() {
  const { barbers, open } = useShop();
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="muted">Defina dias, horários e almoço de cada barbeiro.</span><div className="spacer" />
        <button className="btn primary" onClick={() => open({ kind: 'barber' })}>+ Barbeiro</button></div>
      <div className="list">{barbers.map((b) => (
        <div key={b.id} className="list-item click" style={{ cursor: 'pointer' }} onClick={() => open({ kind: 'barber', b })}>
          <span className="dot" style={{ background: b.color, width: 14, height: 14 }} />
          <div className="grow"><b>{b.name}</b> {!b.active && <span className="badge cancelled">Inativo</span>}
            <div className="small muted">{b.hours.length
              ? [...b.hours].sort((x, y) => x.weekday - y.weekday).map((h) => `${WEEKDAYS[h.weekday].slice(0, 3)} ${h.start}–${h.end}`).join(' · ')
              : 'Sem horários definidos'}</div></div>
          <span className="small muted">Comissão {b.commission_pct}%</span>
        </div>
      ))}</div>
    </>
  );
}

type HourRow = { on: boolean; start: string; end: string; break_start: string; break_end: string };

export function BarberModal({ b }: { b?: Barber }) {
  const { close, reloadBase, onError } = useShop();
  const [phone, setPhone] = useState(fmtPhone(b?.phone));
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState<Record<number, HourRow>>(() => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const h = b?.hours.find((x) => x.weekday === wd);
    return [wd, { on: !!h, start: h?.start ?? '09:00', end: h?.end ?? '19:00', break_start: h ? h.break_start ?? '' : '12:00', break_end: h ? h.break_end ?? '' : '13:00' }];
  })));
  const setH = (wd: number, patch: Partial<HourRow>) => setHours((all) => ({ ...all, [wd]: { ...all[wd], ...patch } }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const list: BarberHour[] = Object.entries(hours).filter(([, h]) => h.on).map(([wd, h]) => ({
      weekday: Number(wd), start: h.start, end: h.end, break_start: h.break_start || null, break_end: h.break_end || null,
    }));
    const body = { name: f.get('name'), phone, commission_pct: Number(f.get('commission')), color: f.get('color'), active: f.get('active') === 'on', hours: list };
    setBusy(true);
    try {
      await api(b ? `/api/admin/barbers/${b.id}` : '/api/admin/barbers', { method: b ? 'PUT' : 'POST', body });
      toast('Barbeiro salvo.', 'success');
      close();
      await reloadBase();
    } catch (err) { onError(err); setBusy(false); }
  }

  return (
    <Modal onClose={close} wide>
      <h3>{b ? 'Editar barbeiro' : 'Novo barbeiro'}</h3>
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="field"><label>Nome</label><input className="input" name="name" defaultValue={b?.name} required maxLength={60} /></div>
          <div className="field"><label>WhatsApp</label><input className="input" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} /></div>
          <div className="field"><label>Comissão (%)</label><input className="input" type="number" min={0} max={100} name="commission" defaultValue={b?.commission_pct ?? 50} /></div>
          <div className="field"><label>Cor na agenda</label><input className="input" type="color" name="color" defaultValue={b?.color ?? '#c8a24a'} style={{ height: 44, padding: 4 }} /></div>
        </div>
        <div className="field"><label>Horário de trabalho (deixe o almoço em branco se não houver)</label></div>
        <div className="hours-grid">{[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const h = hours[wd];
          return (
            <div key={wd} style={{ display: 'contents' }}>
              <label className="lbl check"><input type="checkbox" checked={h.on} onChange={(e) => setH(wd, { on: e.target.checked })} />{WEEKDAYS[wd]}</label>
              <div className={`hrow ${h.on ? '' : 'off'}`}>
                <input className="input" type="time" value={h.start} onChange={(e) => setH(wd, { start: e.target.value })} /> às
                <input className="input" type="time" value={h.end} onChange={(e) => setH(wd, { end: e.target.value })} />
                <span className="small muted">almoço</span>
                <input className="input" type="time" value={h.break_start} onChange={(e) => setH(wd, { break_start: e.target.value })} /> –
                <input className="input" type="time" value={h.break_end} onChange={(e) => setH(wd, { break_end: e.target.value })} />
              </div>
            </div>
          );
        })}</div>
        <label className="check" style={{ marginTop: 14 }}><input type="checkbox" name="active" defaultChecked={b?.active ?? true} /> Ativo (aparece para os clientes)</label>
        <div className="actions"><button type="button" className="btn" onClick={close}>Cancelar</button><button className="btn primary" disabled={busy}>Salvar</button></div>
      </form>
    </Modal>
  );
}

interface BlockRow { id: number; reason: string | null; barber_name: string | null; date_start: string; date_end: string; start_min: number; end_min: number }

function Blocks() {
  const { open, onError, version, refresh } = useShop();
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  useEffect(() => { api<BlockRow[]>('/api/admin/blocks').then(setBlocks).catch(onError); }, [version, onError]);
  const remove = async (id: number) => {
    try {
      await api(`/api/admin/blocks/${id}`, { method: 'DELETE' });
      toast('Bloqueio removido.', 'success');
      refresh();
    } catch (err) { onError(err); }
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}><span className="muted">Folgas, férias e feriados. Os horários somem da agenda online.</span><div className="spacer" />
        <button className="btn primary" onClick={() => open({ kind: 'block' })}>+ Bloqueio</button></div>
      {!blocks ? <Spinner /> : (
        <div className="list">{blocks.length ? blocks.map((bl) => (
          <div key={bl.id} className="list-item">
            <div className="grow"><b>{bl.reason || 'Bloqueio'}</b> <span className="muted">· {bl.barber_name || 'Barbearia inteira'}</span>
              <div className="small muted">
                {bl.date_start === bl.date_end ? fmtDateLong(bl.date_start) : `${fmtDateShort(bl.date_start)} a ${fmtDateShort(bl.date_end)}`}
                {bl.start_min === 0 && bl.end_min === 1440 ? ' · dia inteiro' : ` · ${fmtMin(bl.start_min)}–${fmtMin(bl.end_min)}`}
              </div></div>
            <button className="btn danger sm" onClick={() => remove(bl.id)}>Remover</button>
          </div>
        )) : <div className="card empty">Nenhum bloqueio futuro.</div>}</div>
      )}
    </>
  );
}
