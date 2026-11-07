// 404 para endereços que não batem com nenhuma rota (o app tem dois layouts raiz: guia e painéis).
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import '@/styles/c10.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: 'Página não encontrada · Cidade 10' };

export default function GlobalNotFound() {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <main className="container section">
          <div className="empty">
            <h1>Ops, não achamos essa página.</h1>
            <Link className="btn btn-accent" href="/">Voltar ao início</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
