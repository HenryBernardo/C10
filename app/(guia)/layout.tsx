import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import '@/styles/c10.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', weight: ['600', '700', '800'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cidade 10 · O guia do comércio da sua cidade',
  description: 'Encontre restaurantes, barbearias, mercados e serviços perto de você. Escolha sua cidade.',
  icons: { icon: '/img/c10.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0f766e' };

/** Layout do guia público (páginas das cidades e dos comércios) e das telas de login. */
export default function GuideLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
