import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getCity, getCityCategories } from '@/lib/server/c10';
import { CityView } from '@/components/guide/CityView';
import { ShellSkeleton } from '@/components/guide/Shell';

export async function generateMetadata({ params }: PageProps<'/[city]'>): Promise<Metadata> {
  await connection(); // lê o banco a cada visita
  const city = await getCity((await params).city);
  if (!city) return { title: 'Página não encontrada · Cidade 10' };
  const total = (await getCityCategories(city.id)).reduce((s, c) => s + (c.total ?? 0), 0);
  return {
    title: `${city.name} 10 · Comércios de ${city.name} - ${city.state}`,
    description: `${city.description ?? ''} ${total} negócios cadastrados.`.trim(),
  };
}

export default function CityPage({ params, searchParams }: PageProps<'/[city]'>) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<'/[city]'>, 'params' | 'searchParams'>) {
  const [{ city }, sp] = await Promise.all([params, searchParams]);
  return <CityView citySlug={city} q={typeof sp.q === 'string' ? sp.q : ''} />;
}
