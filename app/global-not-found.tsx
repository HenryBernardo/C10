// 404 para endereços que não batem com nenhuma rota (o app tem dois layouts raiz: guia e painéis).
import type { Metadata } from 'next';
import { Raleway, Roboto } from 'next/font/google';
import Link from 'next/link';
import '@/styles/c10.css';

const raleway = Raleway({ subsets: ['latin'], variable: '--font-head', weight: ['600', '700', '800'], display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '700'], display: 'swap' });

export const metadata: Metadata = { title: 'Página não encontrada · Cidade 10' };

export default function GlobalNotFound() {
  return (
    <html lang="pt-BR" className={`${raleway.variable} ${roboto.variable}`}>
      <body>
        <main className="container section">
          <div className="empty">
            <h1>Ops, não achamos essa página.</h1>
            <Link className="btn btn-navy" href="/">Voltar ao início</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
