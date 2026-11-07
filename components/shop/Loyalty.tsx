'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, toast } from '@/lib/client';
import { LoyaltyCard, Spinner } from '@/components/ui';
import { stop } from '@/components/panel/shared';
import { useShop } from './context';
import { fmtPhone, money, whatsLink } from '@/lib/format';
import type { LoyaltyCard as Card, LoyaltyConfig } from '@/lib/types';

type Person = Card & { id: number; name: string; phone: string };
interface Overview { config: LoyaltyConfig; ready: Person[]; close: Person[]; participants: number; redeemed_30d: number }
type Form = Omit<LoyaltyConfig, 'reward_label' | 'counts_label' | 'summary' | 'start'> & { start: string };

/** Cartão fidelidade: regras configuráveis pelo dono, pré-visualização e quem tem prêmio. */
export function LoyaltyView() {
  const { services, onError, open, settings, bookingUrl, version } = useShop();
  const [data, setData] = useState<Overview | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Overview>('/api/admin/loyalty').then((d) => { setData(d); setForm({ ...d.config, start: d.config.start ?? '' }); }).catch(onError);
  }, [version, onError]);

  if (!data || !form) return <Spinner />;
  const c = data.config;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => f && { ...f, [k]: v });
  const visible = services.filter((s) => s.active || form.services.includes(s.id) || s.id === form.reward_service);
  const prizes = data.ready.reduce((n, x) => n + x.available, 0);

  // Pré-visualização ao vivo enquanto o dono mexe nas regras.
  const goal = Math.min(100, Math.max(2, form.goal || 10));
  const svc = services.find((s) => s.id === form.reward_service);
  const reward = form.reward_type === 'service' ? `${svc?.name || 'um serviço'} grátis`
    : form.reward_type === 'percent' ? `${form.reward_percent || 0}% de desconto` : form.reward_text.trim() || 'um prêmio';
  const counts = form.services.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean);
  const sample = Math.min(goal - 1, Math.ceil(goal * 0.6));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api<LoyaltyConfig>('/api/admin/loyalty', { method: 'PUT', body: form });
      toast('Cartão fidelidade salvo.', 'success');
      const fresh = await api<Overview>('/api/admin/loyalty');
      setData(fresh);
      setForm({ ...saved, start: saved.start ?? '' });
    } catch (err) { onError(err); }
    setBusy(false);
  }

  const first = (name: string) => name.split(' ')[0];
  const rows = (list: Person[], msg: (x: Person) => string) => (
    <div className="table-wrap"><table><tbody>
      {list.map((x) => (
        <tr key={x.id} className="click" onClick={() => open({ kind: 'client', id: x.id })}>
          <td><b>{x.name}</b><div className="small muted">{fmtPhone(x.phone)}</div></td>
          <td className="num">{x.available ? `🎁 ${x.available}` : `${x.stamps % x.goal}/${x.goal}`}</td>
          <td><a className="btn whats sm" target="_blank" onClick={stop} href={whatsLink(x.phone, msg(x))}>Avisar</a></td>
        </tr>
      ))}
    </tbody></table></div>
  );

  return (
    <>
      <div className="page-head"><h1>Cartão fidelidade</h1><div className="spacer" />
        <span className={`badge ${c.enabled ? 'done' : 'cancelled'}`}>{c.enabled ? 'Ligado' : 'Desligado'}</span></div>
      {c.enabled && (
        <div className="kpis">
          <div className="kpi"><div className="label">Clientes com selos</div><div className="value">{data.participants}</div></div>
          <div className="kpi gold"><div className="label">Prêmios a usar</div><div className="value">{prizes}</div></div>
          <div className="kpi"><div className="label">Quase lá</div><div className="value">{data.close.length}</div><div className="hint">faltam 1 ou 2</div></div>
          <div className="kpi"><div className="label">Prêmios usados</div><div className="value">{data.redeemed_30d}</div><div className="hint">últimos 30 dias</div></div>
        </div>
      )}
      <div className="panel-grid">
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginBottom: 14, fontSize: 18 }}>Regras</h3>
          <label className="check" style={{ marginBottom: 14 }}><input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> <b>Ligar cartão fidelidade</b></label>
          <div className="grid-2">
            <div className="field"><label htmlFor="goal">Atendimentos para ganhar</label>
              <input className="input" type="number" min={2} max={100} id="goal" value={form.goal} onChange={(e) => set('goal', Number(e.target.value))} />
              <span className="small muted">Ex.: 10 = o cliente ganha a cada 10 visitas.</span></div>
            <div className="field"><label htmlFor="reward_type">Prêmio</label>
              <select className="input" id="reward_type" value={form.reward_type} onChange={(e) => set('reward_type', e.target.value as Form['reward_type'])}>
                <option value="service">Um serviço grátis</option>
                <option value="percent">Desconto (%)</option>
                <option value="other">Outro prêmio</option>
              </select></div>
          </div>
          {form.reward_type === 'service' && (
            <div className="field"><label>Serviço grátis</label>
              <select className="input" value={form.reward_service ?? ''} onChange={(e) => set('reward_service', Number(e.target.value))}>
                <option value="" disabled>Escolha…</option>
                {visible.map((s) => <option key={s.id} value={s.id}>{s.name} ({money(s.price_cents)})</option>)}
              </select></div>
          )}
          {form.reward_type === 'percent' && (
            <div className="field"><label>Desconto (%)</label><input className="input" type="number" min={1} max={100} value={form.reward_percent} onChange={(e) => set('reward_percent', Number(e.target.value))} /></div>
          )}
          {form.reward_type === 'other' && (
            <div className="field"><label>Qual prêmio?</label><input className="input" maxLength={80} placeholder="Ex.: uma pomada modeladora" value={form.reward_text} onChange={(e) => set('reward_text', e.target.value)} /></div>
          )}
          <div className="field"><label>Quais serviços contam selo</label>
            <div className="row wrap">{visible.map((s) => (
              <label key={s.id} className="check small"><input type="checkbox" checked={form.services.includes(s.id)}
                onChange={(e) => set('services', e.target.checked ? [...form.services, s.id] : form.services.filter((x) => x !== s.id))} /> {s.name}</label>
            ))}</div>
            <span className="small muted">Nenhum marcado = todos contam.</span></div>
          <div className="grid-2">
            <div className="field"><label>Valor mínimo (R$)</label>
              <input className="input" type="number" min={0} step={0.01} value={(form.min_cents / 100).toFixed(2)} onChange={(e) => set('min_cents', Math.round(Number(e.target.value) * 100))} />
              <span className="small muted">Atendimentos mais baratos não contam. 0 = qualquer valor.</span></div>
            <div className="field"><label>Selos valem por (dias)</label>
              <input className="input" type="number" min={0} value={form.expire_days} onChange={(e) => set('expire_days', Number(e.target.value))} />
              <span className="small muted">0 = não vencem.</span></div>
          </div>
          <div className="field"><label>Contar atendimentos a partir de</label>
            <input className="input" type="date" value={form.start} onChange={(e) => set('start', e.target.value)} />
            <span className="small muted">Ao ligar, começa a contar de hoje. Apague a data para contar todo o histórico.</span></div>
          <label className="check small" style={{ marginBottom: 16 }}><input type="checkbox" checked={form.public} onChange={(e) => set('public', e.target.checked)} /> Mostrar o cartão para o cliente na página de agendamento</label>
          <button className="btn primary" disabled={busy}>Salvar</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 8, fontSize: 18 }}>Como o cliente vê</h3>
            <p className="muted small">A cada {goal} atendimentos{counts.length ? ` (${counts.join(', ')})` : ''}, ganhe {reward}.{form.expire_days ? ` Selos valem ${form.expire_days} dias.` : ''}</p>
            <LoyaltyCard l={{ stamps: sample, goal, available: 0, missing: goal - sample, reward_label: reward }} />
            <p className="small muted" style={{ marginTop: 10 }}>Cada atendimento concluído na agenda vira um selo. Para dar o prêmio, abra o atendimento ou a ficha do cliente e toque em <b>Usar prêmio</b>.</p>
          </div>
          {c.enabled && (
            <div className="card">
              <h3 style={{ marginBottom: 8, fontSize: 18 }}>🎁 Com prêmio para usar</h3>
              {data.ready.length ? rows(data.ready, (x) => `Olá ${first(x.name)}! Você completou o cartão fidelidade da ${settings.shop_name} e ganhou ${x.reward_label}. É só agendar: ${bookingUrl()}`)
                : <p className="muted small">Ninguém ainda.</p>}
              {data.close.length > 0 && <>
                <h4 style={{ margin: '16px 0 8px' }}>Quase lá</h4>
                {rows(data.close, (x) => `Olá ${first(x.name)}! Faltam só ${x.missing} atendimento(s) para você ganhar ${x.reward_label} na ${settings.shop_name}. Agende: ${bookingUrl()}`)}
              </>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
