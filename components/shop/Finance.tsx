'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Spinner } from '@/components/ui';
import { useShop } from './context';
import { addDays, fmtDateShort, money, parseDate, today, PAYMENT_LABEL } from '@/lib/format';

interface Report {
  from: string; to: string;
  totals: { total: number; done: number; no_show: number; cancelled: number; pending: number; online: number; revenue: number; lost_no_show: number; expected: number };
  byBarber: { id: number; name: string; color: string; commission_pct: number; done: number; no_show: number; revenue: number; commission_cents: number }[];
  byService: { name: string; done: number; revenue: number }[];
  byPayment: { payment: string; n: number; revenue: number }[];
  byDay: { date: string; revenue: number; done: number }[];
}

/** Financeiro: faturamento, ticket médio, faltas, comissões por barbeiro, serviços e formas de pagamento. */
export function Finance({ range }: { range?: string }) {
  const { navigate, onError, version } = useShop();
  const t = today();
  const firstOfMonth = t.slice(0, 8) + '01';
  const lastMonthEnd = addDays(firstOfMonth, -1);
  const presets: Record<string, [string, string, string]> = {
    hoje: [t, t, 'Hoje'],
    '7d': [addDays(t, -6), t, '7 dias'],
    mes: [firstOfMonth, t, 'Este mês'],
    'mes-passado': [lastMonthEnd.slice(0, 8) + '01', lastMonthEnd, 'Mês passado'],
    '30d': [addDays(t, -29), t, '30 dias'],
  };
  const [from, to] = (range && presets[range]) || (range?.includes('_') ? range.split('_') : presets.mes);
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { api<Report>(`/api/admin/reports?from=${from}&to=${to}`).then(setR).catch(onError); }, [from, to, version, onError]);

  const custom = (f: string, e: string) => { if (f && e && f <= e) navigate(`/admin/financeiro/${f}_${e}`); };

  const header = (
    <>
      <div className="page-head">
        <h1>Financeiro</h1><div className="spacer" />
        <div className="date-nav">
          <input type="date" className="input" value={from} onChange={(e) => custom(e.target.value, to)} /> <span className="muted">até</span>
          <input type="date" className="input" value={to} onChange={(e) => custom(from, e.target.value)} />
        </div>
      </div>
      <div className="tabs">{Object.entries(presets).map(([k, [f, e, label]]) => (
        <button key={k} className={f === from && e === to ? 'active' : ''} onClick={() => navigate(`/admin/financeiro/${k}`)}>{label}</button>
      ))}</div>
    </>
  );
  if (!r) return <>{header}<Spinner /></>;

  const tt = r.totals;
  const ticket = tt.done ? tt.revenue / tt.done : 0;
  const finished = tt.done + tt.no_show;
  const noShowRate = finished ? Math.round((tt.no_show / finished) * 100) : 0;
  const onlineRate = tt.total ? Math.round((tt.online / tt.total) * 100) : 0;
  // Série diária completa (dias sem movimento aparecem zerados).
  const series: Report['byDay'] = [];
  for (let d = from; d <= to && series.length < 62; d = addDays(d, 1)) series.push(r.byDay.find((x) => x.date === d) ?? { date: d, revenue: 0, done: 0 });
  const maxRev = Math.max(1, ...series.map((s) => s.revenue));
  const maxBarber = Math.max(1, ...r.byBarber.map((b) => b.revenue));
  const maxService = Math.max(1, ...r.byService.map((s) => s.revenue));

  return (
    <>
      {header}
      <div className="kpis">
        <div className="kpi gold"><div className="label">Faturamento</div><div className="value">{money(tt.revenue)}</div><div className="hint">{tt.done} atendimento(s)</div></div>
        <div className="kpi"><div className="label">Ticket médio</div><div className="value">{money(ticket)}</div></div>
        <div className="kpi"><div className="label">A receber (agendado)</div><div className="value">{money(tt.expected)}</div><div className="hint">{tt.pending} horário(s)</div></div>
        <div className={`kpi ${tt.no_show ? 'bad' : ''}`}><div className="label">Faltas</div><div className="value">{tt.no_show}</div>
          <div className="hint">{noShowRate}% · {money(tt.lost_no_show)} perdidos</div></div>
        <div className="kpi"><div className="label">Cancelamentos</div><div className="value">{tt.cancelled}</div></div>
        <div className="kpi"><div className="label">Agendado online</div><div className="value">{onlineRate}%</div><div className="hint">dos agendamentos</div></div>
      </div>

      <div className="card">
        <div className="row"><b>Faturamento por dia</b><div className="spacer" /><span className="small muted">{fmtDateShort(from)} – {fmtDateShort(to)}</span></div>
        <div className="chart">{series.map((s) => {
          const day = parseDate(s.date).getDate();
          return (
            <div key={s.date} className="col" title={`${fmtDateShort(s.date)}: ${money(s.revenue)} (${s.done} atend.)`}>
              <div className="b" style={{ height: `${(s.revenue / maxRev) * 100}%` }} />
              <div className="l">{series.length <= 16 || day % 5 === 1 ? day : ' '}</div>
            </div>
          );
        })}</div>
      </div>

      <h3 className="section-title">Por barbeiro · comissões</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>Barbeiro</th><th className="num">Atend.</th><th className="num">Faltas</th><th className="num">Faturado</th><th />
          <th className="num">Comissão</th><th className="num">A pagar</th><th className="num">Fica p/ casa</th></tr></thead>
        <tbody>{r.byBarber.map((b) => (
          <tr key={b.id}>
            <td><span className="dot" style={{ background: b.color }} /> {b.name}</td>
            <td className="num">{b.done}</td><td className="num">{b.no_show}</td><td className="num">{money(b.revenue)}</td>
            <td><div className="bar"><span style={{ width: `${(b.revenue / maxBarber) * 100}%`, background: b.color }} /></div></td>
            <td className="num">{b.commission_pct}%</td><td className="num"><b>{money(b.commission_cents)}</b></td>
            <td className="num">{money(b.revenue - b.commission_cents)}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <div className="panel-grid" style={{ marginTop: 16 }}>
        <div className="card"><b>Serviços mais vendidos</b>
          {r.byService.length ? r.byService.map((s) => (
            <div key={s.name} style={{ marginTop: 12 }}>
              <div className="row small"><span>{s.name} <span className="muted">· {s.done}x</span></span><div className="spacer" /><b>{money(s.revenue)}</b></div>
              <div className="bar" style={{ marginTop: 5 }}><span style={{ width: `${(s.revenue / maxService) * 100}%` }} /></div>
            </div>
          )) : <p className="muted">Sem dados no período.</p>}
        </div>
        <div className="card"><b>Formas de pagamento</b>
          {r.byPayment.length ? r.byPayment.map((p) => (
            <div key={p.payment} className="row small" style={{ marginTop: 12 }}>
              <span>{PAYMENT_LABEL[p.payment] || p.payment} <span className="muted">· {p.n}x</span></span><div className="spacer" /><b>{money(p.revenue)}</b>
            </div>
          )) : <p className="muted">Sem dados no período.</p>}
        </div>
      </div>
    </>
  );
}
