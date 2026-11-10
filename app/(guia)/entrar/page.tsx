import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import '@/styles/entrar.css';

export const metadata: Metadata = { title: 'Entrar · Cidade 10', robots: { index: false } };

/** Escolha do tipo de acesso: painel da cidade ou da barbearia. */
export default function ChooseLogin() {
  return (
    <div className="login-page">
      <div className="box wide">
        <Link href="/" className="logo"><img src="/img/c10.svg" alt="" width={36} height={36} /><span>Cidade<b>10</b></span></Link>
        <h1>Entrar no painel</h1>
        <p className="sub">Escolha o seu tipo de acesso.</p>
        <div className="choices">
          <Link className="choice" href="/entrar/cidade" style={{ '--c': '#4f46e5' } as CSSProperties}>
            <span className="ico"><Icon name="pin" size={24} /></span>
            <span><b>Admin da cidade</b><small>Comércios, pedidos de cadastro e acessos da sua cidade.</small></span>
            <span className="go">→</span>
          </Link>
          <Link className="choice" href="/entrar/barbearia" style={{ '--c': '#b45309' } as CSSProperties}>
            <span className="ico"><Icon name="scissors" size={24} /></span>
            <span><b>Barbearia</b><small>Agenda, barbeiros, serviços, clientes e financeiro.</small></span>
            <span className="go">→</span>
          </Link>
        </div>
        <Link className="back" href="/">← Voltar ao guia</Link>
      </div>
    </div>
  );
}
