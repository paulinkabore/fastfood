import { prisma } from './prisma';

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'restaurant';

export async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.restaurant.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}