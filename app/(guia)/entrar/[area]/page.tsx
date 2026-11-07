import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import '@/styles/entrar.css';

type Props = PageProps<'/entrar/[area]'>;
const AREAS = ['cidade', 'barbearia'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area } = await params;
  return { title: `${area === 'barbearia' ? 'Painel da barbearia' : 'Painel da cidade'} · Cidade 10`, robots: { index: false } };
}

export function generateStaticParams() {
  return AREAS.map((area) => ({ area }));
}

export default function LoginPage({ params }: Props) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, 'params'>) {
  const { area } = await params;
  if (area !== 'cidade' && area !== 'barbearia') notFound();
  return (
    <div className={`login-page area-${area}`}>
      <LoginForm area={area} />
    </div>
  );
}
