import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

/** Erro com status HTTP; a mensagem é mostrada para o usuário. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Mantém só dígitos e garante o DDI 55 para números brasileiros (10 ou 11 dígitos). */
export function normalizePhone(raw: unknown): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

export function slugify(s: string): string {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 32);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = await scryptAsync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export const newToken = () => randomBytes(24).toString('hex');

/** Código curto e legível para o cliente consultar/cancelar o agendamento. */
export function newBookingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join('');
}
