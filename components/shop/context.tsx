'use client';
// Estado compartilhado do painel da barbearia: configurações, serviços, barbeiros e as janelas abertas.

import { createContext, useContext } from 'react';
import type { Appointment, Barber, Service, Settings } from '@/lib/types';

export type NewApptOptions = { date?: string; barberId?: number; start?: number; editing?: Appointment };
export type ShopModal =
  | { kind: 'appointment'; a: Appointment }
  | { kind: 'newAppt'; opts: NewApptOptions }
  | { kind: 'block'; date?: string }
  | { kind: 'client'; id: number }
  | { kind: 'service'; s?: Service }
  | { kind: 'barber'; b?: Barber }
  | null;

export interface ShopCtx {
  shop: { id: number; name: string; booking_path: string; page_path: string };
  settings: Settings;
  services: Service[];
  barbers: Barber[];
  /** Recarrega configurações/serviços/barbeiros e a tela atual. */
  reloadBase: () => Promise<void>;
  /** Recarrega só a tela atual (depois de salvar algo numa janela). */
  refresh: () => void;
  version: number;
  open: (m: ShopModal) => void;
  close: () => void;
  onError: (e: unknown) => void;
  /** Link interno do painel, mantendo ?loja= quando um admin está gerenciando a barbearia. */
  href: (path: string) => string;
  navigate: (path: string) => void;
  bookingUrl: () => string;
}

export const ShopContext = createContext<ShopCtx | null>(null);

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop fora do painel');
  return ctx;
}

/** Mensagem de lembrete com as variáveis preenchidas. */
export function fillTemplate(template: string, shopName: string, a: Appointment, fmt: { date: (d: string) => string; time: (m: number) => string }) {
  return template
    .replaceAll('{cliente}', a.client_name.split(' ')[0])
    .replaceAll('{barbearia}', shopName)
    .replaceAll('{servico}', a.service_name)
    .replaceAll('{barbeiro}', a.barber_name)
    .replaceAll('{data}', fmt.date(a.date))
    .replaceAll('{hora}', fmt.time(a.start_min))
    .replaceAll('{link}', `${location.origin}/meu-horario?codigo=${a.code}`);
}
