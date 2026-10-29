import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const resto = await prisma.restaurant.upsert({
    where: { slug: 'demo-fastfood' },
    update: {},
    create: { name: 'Fast-Food Démo', slug: 'demo-fastfood' },
  });

  await prisma.restaurantTable.upsert({
    where: { restaurantId_label: { restaurantId: resto.id, label: 'Table 1' } },
    update: {},
    create: { restaurantId: resto.id, label: 'Table 1', seats: 4 },
  });

  const burgers = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: resto.id, name: 'Burgers' } },
    update: {},
    create: { restaurantId: resto.id, name: 'Burgers', sortOrder: 1 },
  });

  const boissons = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: resto.id, name: 'Boissons' } },
    update: {},
    create: { restaurantId: resto.id, name: 'Boissons', sortOrder: 2 },
  });

  const produits = [
    { name: 'Burger classique', priceFcfa: 2500, categoryId: burgers.id },
    { name: 'Frites', priceFcfa: 1000, categoryId: burgers.id },
    { name: 'Jus de bissap', priceFcfa: 500, categoryId: boissons.id },
  ];

  for (const p of produits) {
    await prisma.product.upsert({
      where: { restaurantId_name: { restaurantId: resto.id, name: p.name } },
      update: {},
      create: { restaurantId: resto.id, ...p },
    });
  }

  console.log('Données de test créées.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());