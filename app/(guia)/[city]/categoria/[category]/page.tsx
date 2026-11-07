import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getCategory, getCity } from '@/lib/server/c10';
import { CityView } from '@/components/guide/CityView';
import { ShellSkeleton } from '@/components/guide/Shell';

type Props = PageProps<'/[city]/categoria/[category]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection(); // lê o banco a cada visita
  const p = await params;
  const [city, category] = await Promise.all([getCity(p.city), getCategory(p.category)]);
  if (!city || !category) return { title: 'Página não encontrada · Cidade 10' };
  return {
    title: `${category.name} em ${city.name} - ${city.state} · Cidade 10`,
    description: `Encontre ${category.name.toLowerCase()} em ${city.name}: endereço, WhatsApp e horário de funcionamento.`,
  };
}

export default function CategoryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Pick<Props, 'params' | 'searchParams'>) {
  const [p, sp] = await Promise.all([params, searchParams]);
  return <CityView citySlug={p.city} categorySlug={p.category} q={typeof sp.q === 'string' ? sp.q : ''} />;
}
