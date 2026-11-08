// Cidade 10: guia de comércios por cidade.
import { db, Prisma } from './db';
import { slugify } from './util';
import { cityWhere } from '../cities';
import type { Business, Category, City, Hours } from '../types';

const withCategory = { category: true } as const;
type BizRow = Prisma.BusinessGetPayload<{ include: typeof withCategory }>;

/** Comércio no formato das telas, com os dados da categoria "achatados". */
export const toBusiness = ({ category, ...b }: BizRow): Business => ({
  ...b,
  hours: (b.hours ?? {}) as Hours,
  category_name: category.name,
  category_slug: category.slug,
  category_icon: category.icon,
  category_color: category.color,
});

export async function getCities(): Promise<City[]> {
  const rows = await db().city.findMany({
    where: { active: true, ...cityWhere },
    orderBy: { name: 'asc' },
    include: { _count: { select: { businesses: { where: { active: true } } } } },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, total: _count.businesses }));
}

export const getCity = (slug: string) => db().city.findFirst({ where: { AND: [{ slug, active: true }, cityWhere] } });

export const getCategories = (): Promise<Category[]> => db().category.findMany({ orderBy: { sort: 'asc' } });

export const getCategory = (slug: string) => db().category.findUnique({ where: { slug } });

/** Categorias com quantidade de negócios na cidade (só as que têm algum). */
export async function getCityCategories(cityId: number): Promise<Category[]> {
  const rows = await db().category.findMany({
    orderBy: { sort: 'asc' },
    include: { _count: { select: { businesses: { where: { city_id: cityId, active: true } } } } },
  });
  return rows.filter((c) => c._count.businesses > 0).map(({ _count, ...c }) => ({ ...c, total: _count.businesses }));
}

export async function searchBusinesses(cityId: number, { categoryId, q, featured }: { categoryId?: number; q?: string; featured?: boolean } = {}) {
  const like = q ? { contains: q, mode: 'insensitive' as const } : undefined;
  const rows = await db().business.findMany({
    where: {
      city_id: cityId,
      active: true,
      ...(categoryId && { category_id: categoryId }),
      ...(featured && { featured: true }),
      ...(like && { OR: [{ name: like }, { description: like }, { neighborhood: like }, { category: { name: like } }] }),
    },
    include: withCategory,
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toBusiness);
}

export async function getBusiness(cityId: number, slug: string) {
  const b = await db().business.findFirst({ where: { city_id: cityId, slug, active: true }, include: withCategory });
  return b ? toBusiness(b) : undefined;
}

export async function createLead(l: { cityId: number | null; categoryId: number | null; businessName: string; contactName: string; phone: string; message: string | null }) {
  await db().lead.create({
    data: { city_id: l.cityId, category_id: l.categoryId, business_name: l.businessName, contact_name: l.contactName, phone: l.phone, message: l.message },
  });
}

export interface Shop extends Business { city_slug: string; city_name: string; city_state: string }

const toShop = (b: (BizRow & { city: { slug: string; name: string; state: string } }) | null): Shop | undefined =>
  b ? { ...toBusiness(b), city_slug: b.city.slug, city_name: b.city.name, city_state: b.city.state } : undefined;

/** Comércio com agenda online ativa, com os dados da cidade para montar links. */
export const getShop = async (shopId: number) =>
  toShop(await db().business.findFirst({ where: { id: shopId, booking_enabled: true, active: true, city: cityWhere }, include: { ...withCategory, city: true } }));

export const getShopBySlugs = async (citySlug: string, bizSlug: string) =>
  toShop(await db().business.findFirst({
    where: { slug: bizSlug, booking_enabled: true, active: true, city: { AND: [{ slug: citySlug, active: true }, cityWhere] } },
    include: { ...withCategory, city: true },
  }));

export const bookingPath = (shop: { city_slug: string; slug: string }) => `/${shop.city_slug}/${shop.slug}/agendar`;

/** Slug único dentro da cidade ("barbearia-x", "barbearia-x-2"...). */
export async function uniqueSlug(cityId: number, name: string, excludeId = 0) {
  const base = slugify(name) || 'negocio';
  let slug = base;
  for (let i = 2; await db().business.findFirst({ where: { city_id: cityId, slug, id: { not: excludeId } } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** "Aberto até 18:00", "Abre às 13:00"... usando a hora local da cidade. */
export function openStatus(hours: Hours | null | undefined, weekday: number, nowMin: number) {
  const today = hours?.[weekday];
  if (!Array.isArray(today)) return { open: false, label: 'Fechado hoje' };
  const [s, e] = today.map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  if (nowMin >= s && nowMin <= e) return { open: true, label: today[0] === '00:00' && today[1] === '23:59' ? 'Aberto 24h' : `Aberto até ${today[1]}` };
  if (nowMin < s) return { open: false, label: `Abre às ${today[0]}` };
  return { open: false, label: 'Fechado agora' };
}
