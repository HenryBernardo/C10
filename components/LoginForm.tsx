'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const AREAS = {
  cidade: {
    badge: 'Admin da cidade', title: 'Painel da cidade',
    sub: 'Para o admin da cidade e o admin geral do Cidade 10.',
    other: { text: 'Tem uma barbearia?', href: '/entrar/barbearia' },
    volta: /^\/(admin|painel)([/?#]|$)/,
  },
  barbearia: {
    badge: 'Barbearia', title: 'Painel da barbearia',
    sub: 'Agenda, barbeiros, serviços, clientes e financeiro.',
    other: { text: 'É admin da cidade?', href: '/entrar/cidade' },
    volta: /^\/admin([/?#]|$)/,
  },
} as const;

export type LoginArea = keyof typeof AREAS;

/** Formulário de login de um painel. `volta` (só caminhos internos do painel) é para onde ir depois de entrar. */
export function LoginForm({ area }: { area: LoginArea }) {
  const cfg = AREAS[area];
  const volta = useSearchParams().get('volta');
  const safeVolta = volta && cfg.volta.test(volta) ? volta : null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Quem já está logado vai direto para o painel.
  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((me) => {
      if (me.authenticated) location.replace(safeVolta || (me.user.role === 'shop' ? '/admin' : '/painel'));
    }).catch(() => {});
  }, [safeVolta]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password'), area }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível entrar.');
      location.href = safeVolta || data.redirect;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="box">
      <Link href="/" className="logo"><img src="/img/c10.svg" alt="" width={36} height={36} /><span>Cidade<b>10</b></span></Link>
      <span className="badge">{cfg.badge}</span>
      <h1>{cfg.title}</h1>
      <p className="sub">{cfg.sub}</p>
      <form className="form" onSubmit={submit}>
        {error && <div className="err" role="alert">{error}</div>}
        <label>E-mail ou login<input name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn btn-navy btn-lg" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <p className="back">{cfg.other.text} <Link href={cfg.other.href}>Entre por aqui</Link></p>
      <Link className="back" href="/">← Voltar ao guia</Link>
    </div>
  );
}
