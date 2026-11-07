'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createLead, getCategory, getCity } from '@/lib/server/c10';
import { clientIp, limit } from '@/lib/server/ratelimit';
import { HttpError, normalizePhone, str } from '@/lib/server/util';

/** Pedido de cadastro enviado pelo dono do comércio. Funciona mesmo sem JavaScript (form action). */
export async function sendLead(form: FormData) {
  const citySlug = str(form.get('city'), 80);
  const back = (q: string) => `/cadastre-seu-negocio?${citySlug ? `cidade=${encodeURIComponent(citySlug)}&` : ''}${q}`;
  const businessName = str(form.get('business_name'), 100);
  const contactName = str(form.get('contact_name'), 80);
  const phone = normalizePhone(form.get('phone'));
  if (!businessName || !contactName || phone.length < 12) {
    redirect(back(`erro=${encodeURIComponent('Preencha o nome do negócio, seu nome e um WhatsApp com DDD.')}`));
  }
  try {
    // Contra spam: no máximo 5 pedidos por hora vindos do mesmo IP.
    await limit(`lead:${clientIp(await headers())}`, { max: 5, windowMs: 60 * 60 * 1000, message: 'Muitos cadastros enviados.' });
  } catch (e) {
    if (e instanceof HttpError) redirect(back(`erro=${encodeURIComponent(e.message)}`));
    throw e;
  }
  const [city, category] = await Promise.all([getCity(citySlug), getCategory(str(form.get('category'), 80))]);
  await createLead({
    cityId: city?.id ?? null,
    categoryId: category?.id ?? null,
    businessName,
    contactName,
    phone,
    message: str(form.get('message'), 500) || null,
  });
  redirect(back('enviado=1'));
}
