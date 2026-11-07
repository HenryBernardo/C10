// Todas as chamadas /api/* caem aqui e são despachadas pelo roteador em lib/server/api.
import { handle } from '@/lib/server/api';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
