import { PrismaClient, type MemberRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Passw0rd!2026'; // développement uniquement

async function upsertUser(
  email: string,
  fullName: string,
  globalRole: 'SUPER_ADMIN' | 'USER' = 'USER',
) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, passwordHash, globalRole },
  });
}

async function main() {
  const demo = await prisma.restaurant.findUniqueOrThrow({ where: { slug: 'demo-fastfood' } });
  const other = await prisma.restaurant.upsert({
    where: { slug: 'autre-resto' },
    update: {},
    create: { name: 'Autre Resto', slug: 'autre-resto' },
  });

  await upsertUser('admin@fastfood.test', 'Super Admin', 'SUPER_ADMIN');

  const staff: [string, string, string, MemberRole][] = [
    ['manager@fastfood.test', 'Gérant Démo', demo.id, 'MANAGER'],
    ['cashier@fastfood.test', 'Caissier Démo', demo.id, 'CASHIER'],
    ['cashier2@fastfood.test', 'Caissier Deux', demo.id, 'CASHIER'],
    ['cook@fastfood.test', 'Cuisinier Démo', demo.id, 'COOK'],
    ['waiter@fastfood.test', 'Serveur Démo', demo.id, 'WAITER'],
    ['manager2@fastfood.test', 'Gérant Autre', other.id, 'MANAGER'],
  ];

  for (const [email, fullName, restaurantId, role] of staff) {
    const user = await upsertUser(email, fullName);
    await prisma.restaurantMembership.upsert({
      where: { userId_restaurantId: { userId: user.id, restaurantId } },
      update: {},
      create: { userId: user.id, restaurantId, role },
    });
  }

  console.log(`Comptes de test créés (mot de passe : ${PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());