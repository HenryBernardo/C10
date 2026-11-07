'use client';
// Utilitários das telas do navegador (agendamento e painéis).
import { useSyncExternalStore } from 'react';

let shopHeader: string | null = null;

/** Painel da barbearia aberto por um admin: diz ao servidor qual comércio está sendo gerenciado. */
export function setShopHeader(shopId: string | null) {
  shopHeader = shopId;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (shopHeader) headers['X-Shop-Id'] = shopHeader;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Algo deu errado.');
  return data as T;
}

/** localStorage que não quebra em aba anônima ou com armazenamento bloqueado. */
export const store = {
  get<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* armazenamento indisponível */ }
  },
};

/* ------------------------------- Avisos ------------------------------- */

type Toast = { id: number; msg: string; type: '' | 'success' | 'error' };
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let nextId = 1;

export function toast(msg: string, type: Toast['type'] = '') {
  const t = { id: nextId++, msg, type };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); emit(); }, 3800);
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => toasts,
    () => toasts,
  );
}
