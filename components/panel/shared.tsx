'use client';
// Peças comuns dos dois painéis (cidade e barbearia).

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, toast, ApiError } from '@/lib/client';
import { Modal } from '@/components/ui';

/** Trata erro de API: sessão expirada volta para o login; o resto vira aviso. */
export function useErrorHandler(loginUrl: () => string) {
  const url = useRef(loginUrl);
  useEffect(() => { url.current = loginUrl; });
  // Função estável: pode entrar nas dependências de efeitos sem recarregar dados à toa.
  return useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      location.href = url.current();
      return;
    }
    console.error(err);
    toast(err instanceof Error ? err.message : 'Algo deu errado.', 'error');
  }, []);
}

export function PasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'PUT', body: { current: f.get('current'), next: f.get('next') } });
      toast('Senha alterada. Entre novamente.', 'success');
      setTimeout(onDone, 1200);
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <h3>Minha senha</h3>
      <form onSubmit={submit}>
        <div className="field"><label>Senha atual</label><input className="input" type="password" name="current" autoComplete="current-password" required /></div>
        <div className="field"><label>Nova senha</label><input className="input" type="password" name="next" autoComplete="new-password" minLength={6} required /></div>
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>Alterar</button></div>
      </form>
    </Modal>
  );
}

/** Para links dentro de linhas clicáveis de tabela. */
export const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
