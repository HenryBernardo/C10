import Link from 'next/link';
import { Icon } from '@/components/Icon';

export default function NotFound() {
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link href="/" className="logo"><img src="/img/c10.svg" alt="" width={30} height={30} /><span>Cidade<b>10</b></span></Link>
        </div>
      </header>
      <main className="container section">
        <div className="empty">
          <Icon name="search" size={32} />
          <h1>Ops, não achamos essa página.</h1>
          <Link className="btn btn-accent" href="/">Voltar ao início</Link>
        </div>
      </main>
    </>
  );
}
