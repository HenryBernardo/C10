import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getShopBySlugs } from '@/lib/server/c10';
import { Booking } from '@/components/booking/Booking';
import { Spinner } from '@/components/ui';
import '@/styles/booking.css';

type Props = PageProps<'/[city]/[biz]/agendar'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection(); // lê o banco a cada visita
  const p = await params;
  const shop = await getShopBySlugs(p.city, p.biz);
  return {
    title: shop ? `${shop.name} · Agende seu horário` : 'Agenda não encontrada',
    description: shop ? `Agende online na ${shop.name}, em ${shop.city_name}. Escolha o serviço, o barbeiro e o horário.` : undefined,
    robots: { index: !!shop },
  };
}

export default function BookingPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Spinner />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Pick<Props, 'params' | 'searchParams'>) {
  await connection();
  const [p, sp] = await Promise.all([params, searchParams]);
  const shop = await getShopBySlugs(p.city, p.biz);
  if (!shop) notFound();
  return <Booking shopId={shop.id} initialCode={typeof sp.codigo === 'string' ? sp.codigo : undefined} />;
}
