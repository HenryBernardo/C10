'use client';

import { useEffect, type ReactNode } from 'react';
import { useToasts } from '@/lib/client';
import type { LoyaltyCard as Card } from '@/lib/types';

export function Toaster() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
    </div>
  );
}

/** Janela sobreposta; fecha com Esc ou clicando fora. */
export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={wide ? { maxWidth: 640 } : undefined}>{children}</div>
    </div>
  );
}

export const Spinner = () => <div className="spinner" />;

/** Cartão fidelidade com os selos. */
export function LoyaltyCard({ l, title = 'Cartão fidelidade' }: { l: Card; title?: string }) {
  const filled = l.available ? l.goal : l.stamps % l.goal;
  return (
    <div className="loyalty-card">
      <div className="head"><b>{title}</b><span className="count">{filled}/{l.goal}</span></div>
      <div className="stamps">
        {Array.from({ length: l.goal }, (_, i) =>
          i < filled ? <span key={i} className="stamp on">✂</span>
            : i === l.goal - 1 ? <span key={i} className="stamp prize">🎁</span>
            : <span key={i} className="stamp" />)}
      </div>
      <div className={`status ${l.available ? 'ready' : ''}`}>
        {l.available
          ? `🎁 ${l.available > 1 ? `${l.available} prêmios disponíveis` : 'Prêmio disponível'}: ${l.reward_label}`
          : `Faltam ${l.missing} para ganhar ${l.reward_label}`}
      </div>
    </div>
  );
}
