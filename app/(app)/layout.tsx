import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui';
import '@/styles/base.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', weight: ['600', '700'], display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', weight: ['700', '800'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cidade 10',
  icons: { icon: '/img/icon.svg' },
  robots: { index: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f0f10' };

/** Layout escuro do agendamento do cliente e dos painéis (cidade e barbearia). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${playfair.variable} ${jakarta.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
