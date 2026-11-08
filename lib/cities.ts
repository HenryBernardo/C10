/**
 * Cidade única: enquanto estiver preenchido, o site funciona só com esta cidade.
 * A página inicial manda direto para ela, e as outras cidades somem do guia, do cadastro e do painel
 * (os dados delas continuam guardados no banco).
 *
 * Para voltar a ter várias cidades, troque por `null`.
 */
export const ONLY_CITY: string | null = 'foz-do-iguacu';

/** Filtro do Prisma para a tabela de cidades (vazio quando há várias cidades). */
export const cityWhere = ONLY_CITY ? { slug: ONLY_CITY } : {};
