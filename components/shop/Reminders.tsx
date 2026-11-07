'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { Spinner } from '@/components/ui';
import { fillTemplate, useShop } from './context';
import { addDays, fmtDateLong, fmtMin, fmtPhone, today, whatsLink, STATUS_LABEL } from '@/lib/format';
import type { Appointment } from '@/lib/types';

/** Lembretes da véspera: mensagem pronta no WhatsApp com link para o cliente confirmar ou cancelar. */
export function Reminders({ date: dateArg }: { date?: string }) {
  const { settings, navigate, onError, version } = useShop();
  const date = dateArg || addDays(today(), 1);
  const [list, setList] = useState<Appointment[] | null>(null);
  useEffect(() => { api<Appointment[]>(`/api/admin/reminders?date=${date}`).then(setList).catch(onError); }, [date, version, onError]);

  const markReminded = (id: number) => {
    setList((l) => l && l.map((a) => (a.id === id ? { ...a, reminded: true } : a)));
    api(`/api/admin/appointments/${id}`, { method: 'PATCH', body: { reminded: true } }).catch(onError);
  };
  const pending = list?.filter((a) => !a.reminded) ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Lembretes</h1>
        <div className="date-nav">
          <button className={`btn sm ${date === today() ? 'primary' : ''}`} onClick={() => navigate(`/admin/lembretes/${today()}`)}>Hoje</button>
          <button className={`btn sm ${date === addDays(today(), 1) ? 'primary' : ''}`} onClick={() => navigate(`/admin/lembretes/${addDays(today(), 1)}`)}>Amanhã</button>
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && navigate(`/admin/lembretes/${e.target.value}`)} />
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>Mandar lembrete na véspera reduz muito as faltas. Clique em cada botão para abrir o WhatsApp com a mensagem pronta —
        o cliente recebe um link para <b>confirmar ou cancelar</b> sozinho, liberando o horário para outra pessoa.</p>
      {!list ? <Spinner /> : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="label">Agendamentos</div><div className="value">{list.length}</div><div className="hint">{fmtDateLong(date)}</div></div>
            <div className={`kpi ${pending.length ? 'gold' : ''}`}><div className="label">Falta lembrar</div><div className="value">{pending.length}</div></div>
            <div className="kpi"><div className="label">Confirmados</div><div className="value">{list.filter((a) => a.status === 'confirmed').length}</div></div>
          </div>
          <div className="list">
            {list.length ? list.map((a) => (
              <div className="list-item" key={a.id}>
                <span className="dot" style={{ background: a.barber_color }} />
                <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMin(a.start_min)}</div>
                <div className="grow"><b>{a.client_name}</b> <span className="small muted">{fmtPhone(a.client_phone)}</span>
                  <div className="small muted">{a.service_name} com {a.barber_name}</div></div>
                <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
                <a className={`btn sm ${a.reminded ? '' : 'whats'}`} target="_blank" onClick={() => markReminded(a.id!)}
                  href={whatsLink(a.client_phone, fillTemplate(settings.reminder_template, settings.shop_name, a, { date: fmtDateLong, time: fmtMin }))}>
                  {a.reminded ? '✓ Lembrado · reenviar' : 'Enviar lembrete'}
                </a>
              </div>
            )) : <div className="card empty">Nenhum agendamento para este dia.</div>}
          </div>
        </>
      )}
    </>
  );
}
