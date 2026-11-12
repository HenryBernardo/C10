import type { Metadata, Viewport } from 'next';
import { Raleway, Roboto } from 'next/font/google';
import '@/styles/c10.css';

const raleway = Raleway({ subsets: ['latin'], variable: '--font-head', weight: ['600', '700', '800'], display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cidade 10 · O guia do comércio da sua cidade',
  description: 'Encontre restaurantes, barbearias, mercados e serviços perto de você. Escolha sua cidade.',
  icons: { icon: '/img/c10.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#2e3f6e' };

/** Layout do guia público (páginas das cidades e dos comércios) e das telas de login. */
export default function GuideLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${raleway.variable} ${roboto.variable}`}>
      <body>{children}</body>
    </html>
  );
}
