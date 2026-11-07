'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import Link from 'next/link';
import { api, toast } from '@/lib/client';
import { Spinner } from '@/components/ui';
import { useShop } from './context';
import { addDays, fmtDateLong, fmtMin, money, today, STATUS_LABEL } from '@/lib/format';
import type { Appointment } from '@/lib/types';

const PX = 1.6; // pixels por minuto na linha do tempo

interface AgendaData {
  date: string;
  today: string;
  barbers: { id: number; name: string; color: string; hours: { start_min: number; end_min: number; break_start: number | null; break_end: number | null } | null }[];
  blocks: { id: number; barber_id: number | null; start_min: number; end_min: number; reason: string | null }[];
  appointments: Appointment[];
}

export function Agenda({ date: dateArg }: { date?: string }) {
  const { open, navigate, onError, version, href } = useShop();
  const date = dateArg || today();
  const [data, setData] = useState<AgendaData | null>(null);
  const lastOnline = useRef<number[] | null>(null);

  // Atualiza a cada 30s e avisa quando chega agendamento online novo.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = await api<AgendaData>(`/api/admin/agenda?date=${date}`);
      if (!alive) return;
      const ids = d.appointments.filter((a) => a.source === 'online').map((a) => a.id!);
      if (lastOnline.current && ids.some((id) => !lastOnline.current!.includes(id))) toast('Novo agendamento online recebido!', 'success');
      lastOnline.current = ids;
      setData(d);
    };
    load().catch(onError);
    const timer = setInterval(() => load().catch(onError), 30_000);
    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, version]);

  const goDate = (d: string) => navigate(`/admin/agenda/${d}`);
  const active = data?.appointments.filter((a) => a.status !== 'cancelled') ?? [];
  const sum = (list: Appointment[]) => list.reduce((s, a) => s + a.price_cents, 0);
  const done = active.filter((a) => a.status === 'done');
  const noShow = active.filter((a) => a.status === 'no_show');

  return (
    <>
      <div className="page-head">
        <h1>Agenda</h1>
        <div className="date-nav">
          <button className="btn sm" title="Dia anterior" onClick={() => goDate(addDays(date, -1))}>‹</button>
          <button className="btn sm" onClick={() => goDate(today())}>Hoje</button>
          <button className="btn sm" title="Próximo dia" onClick={() => goDate(addDays(date, 1))}>›</button>
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && goDate(e.target.value)} />
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => open({ kind: 'block', date })}>Bloquear horário</button>
        <button className="btn primary" onClick={() => open({ kind: 'newAppt', opts: { date } })}>+ Agendamento</button>
      </div>
      <h3 className="day-title">{fmtDateLong(date)}</h3>
      {data && (
        <div className="kpis">
          <div className="kpi"><div className="label">Atendimentos</div><div className="value">{active.length}</div><div className="hint">{done.length} concluído(s)</div></div>
          <div className="kpi"><div className="label">A confirmar</div><div className="value">{active.filter((a) => a.status === 'scheduled').length}</div>
            <div className="hint"><Link href={href(`/admin/lembretes/${date}`)}>enviar lembretes</Link></div></div>
          <div className="kpi gold"><div className="label">Faturado</div><div className="value">{money(sum(done))}</div>
            <div className="hint">previsto {money(sum(active.filter((a) => a.status !== 'no_show')))}</div></div>
          <div className={`kpi ${noShow.length ? 'bad' : ''}`}><div className="label">Faltas</div><div className="value">{noShow.length}</div>
            <div className="hint">{money(sum(noShow))} perdidos</div></div>
        </div>
      )}
      {!data ? <Spinner /> : <Timeline data={data} />}
      <div className="legend">
        <span><span className="badge scheduled">Agendado</span></span>
        <span><span className="badge confirmed">Confirmado</span></span>
        <span><span className="badge done">Concluído</span></span>
        <span><span className="badge no_show">Faltou</span></span>
        <span>Clique num espaço vazio para encaixar um cliente.</span>
      </div>
    </>
  );
}

function Timeline({ data }: { data: AgendaData }) {
  const { open, settings, refresh, onError } = useShop();
  const { barbers: cols, appointments, blocks, date } = data;
  if (!cols.length) return <div className="card empty">Cadastre um barbeiro em Configurações.</div>;

  // Faixa visível: do primeiro expediente/agendamento ao último.
  const starts = [...cols.flatMap((c) => (c.hours ? [c.hours.start_min] : [])), ...appointments.map((a) => a.start_min)];
  const ends = [...cols.flatMap((c) => (c.hours ? [c.hours.end_min] : [])), ...appointments.map((a) => a.end_min)];
  const from = starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 480;
  const to = ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 1200;
  const height = (to - from) * PX;
  const y = (min: number) => (min - from) * PX;
  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  const halfHours: number[] = [];
  for (let m = from; m < to; m += 30) halfHours.push(m);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = date === today() && nowMin >= from && nowMin <= to;

  const clickColumn = (e: MouseEvent<HTMLDivElement>, barberId: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const step = Number(settings.slot_interval) || 15;
    const start = from + Math.floor((e.clientY - rect.top) / PX / step) * step;
    open({ kind: 'newAppt', opts: { date, barberId, start } });
  };
  const removeBlock = async (e: MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Remover este bloqueio?')) return;
    try {
      await api(`/api/admin/blocks/${id}`, { method: 'DELETE' });
      toast('Bloqueio removido.', 'success');
      refresh();
    } catch (err) { onError(err); }
  };
  const closed = (top: number, h: number, key: string) => <div key={key} className="closed" style={{ top, height: h }} />;

  return (
    <div className="timeline">
      <div className="tl-scroll" style={{ '--cols': cols.length } as CSSProperties}>
        <div className="tl-head">
          <div />
          {cols.map((b) => <div key={b.id}><span className="dot" style={{ background: b.color }} />{b.name}{!b.hours && <span className="off">folga</span>}</div>)}
        </div>
        <div className="tl-body">
          <div className="tl-hours" style={{ height }}>{hours.map((m) => <div key={m} style={{ top: y(m) }}>{fmtMin(m)}</div>)}</div>
          {cols.map((b) => {
            const h = b.hours;
            return (
              <div key={b.id} className="tl-col" style={{ height }} onClick={(e) => clickColumn(e, b.id)}>
                {halfHours.map((m) => <div key={m} className={`gridline ${m % 60 ? 'half' : ''}`} style={{ top: y(m) }} />)}
                {!h ? closed(0, height, 'off') : (
                  <>
                    {h.start_min > from && closed(0, y(h.start_min), 's')}
                    {h.end_min < to && closed(y(h.end_min), (to - h.end_min) * PX, 'e')}
                    {h.break_start != null && h.break_end != null && closed(y(h.break_start), (h.break_end - h.break_start) * PX, 'b')}
                  </>
                )}
                {blocks.filter((x) => !x.barber_id || x.barber_id === b.id).map((bl) => {
                  const s = Math.max(bl.start_min, from), e = Math.min(bl.end_min, to);
                  return e > s && (
                    <div key={bl.id} className="blocked" style={{ top: y(s), height: (e - s) * PX }} onClick={(ev) => removeBlock(ev, bl.id)}>🚫 {bl.reason || 'Bloqueado'}</div>
                  );
                })}
                {appointments.filter((a) => a.barber_id === b.id && a.status !== 'cancelled').map((a) => {
                  const hpx = (a.end_min - a.start_min) * PX;
                  const tag = { confirmed: '✔', done: '💈', no_show: '✖' }[a.status as string] ?? '';
                  return (
                    <div key={a.id} className={`appt ${a.status}`} title={`${a.client_name} · ${a.service_name} · ${STATUS_LABEL[a.status]}`}
                      style={{ '--c': b.color, top: y(a.start_min) + 1, height: hpx - 2 } as CSSProperties}
                      onClick={(e) => { e.stopPropagation(); open({ kind: 'appointment', a }); }}>
                      <span className="tag">{tag}{a.source === 'online' ? ' 🌐' : ''}</span>
                      <div className="t">{fmtMin(a.start_min)}–{fmtMin(a.end_min)}</div>
                      <div className="n">{a.client_name}</div>
                      {hpx > 50 && <div className="s">{a.service_name} · {money(a.price_cents)}</div>}
                    </div>
                  );
                })}
                {showNow && <div className="now" style={{ top: y(nowMin) }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
