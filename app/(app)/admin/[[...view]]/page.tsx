import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopPanel } from '@/components/shop/ShopPanel';
import { Spinner } from '@/components/ui';
import '@/styles/admin.css';

export const metadata: Metadata = { title: 'Painel da Barbearia' };

/** Painel da barbearia: /admin (agenda), /admin/lembretes, /admin/clientes, /admin/fidelidade, /admin/financeiro, /admin/config. */
export default function ShopPanelPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ShopPanel />
    </Suspense>
  );
}
