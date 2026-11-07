import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingTop: 80 }}>
      <div className="card empty">
        <h2>Não encontramos esta página.</h2>
        <p><Link className="btn" href="/">Voltar ao Cidade 10</Link></p>
      </div>
    </main>
  );
}
