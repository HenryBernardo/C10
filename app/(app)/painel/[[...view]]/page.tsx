import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CityPanel } from '@/components/panel/CityPanel';
import { Spinner } from '@/components/ui';
import '@/styles/admin.css';

export const metadata: Metadata = { title: 'Painel · Cidade 10' };

/** Painel do Cidade 10 (/painel, /painel/comercios, /painel/pedidos, /painel/usuarios, /painel/cidades). */
export default function CityPanelPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CityPanel />
    </Suspense>
  );
}
