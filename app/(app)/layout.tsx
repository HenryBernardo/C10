import type { Metadata, Viewport } from 'next';
import { Raleway, Roboto } from 'next/font/google';
import { Toaster } from '@/components/ui';
import '@/styles/base.css';

const raleway = Raleway({ subsets: ['latin'], variable: '--font-head', weight: ['600', '700', '800'], display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cidade 10',
  icons: { icon: '/img/icon.svg' },
  robots: { index: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2e3f6e' };

/** Layout do agendamento do cliente e dos painéis (cidade e barbearia). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${raleway.variable} ${roboto.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
