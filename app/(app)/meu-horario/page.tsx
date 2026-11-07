import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Booking } from '@/components/booking/Booking';
import { Spinner } from '@/components/ui';
import '@/styles/booking.css';

export const metadata: Metadata = { title: 'Meu horário · Cidade 10' };

/** Cliente consulta, confirma ou cancela o horário pelo código (link do lembrete no WhatsApp). */
export default function MyAppointmentPage({ searchParams }: PageProps<'/meu-horario'>) {
  return (
    <Suspense fallback={<Spinner />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<'/meu-horario'>, 'searchParams'>) {
  const sp = await searchParams;
  return <Booking shopId={null} initialCode={typeof sp.codigo === 'string' ? sp.codigo : undefined} />;
}
