import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// Crée le premier super-administrateur à partir de variables d'environnement.
// Le mot de passe n'est jamais écrit dans le code ni affiché.
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME?.trim() || 'Super administrateur';

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('ADMIN_EMAIL manquant ou invalide');
  if (!password || password.length < 12) {
    throw new Error('ADMIN_PASSWORD manquant ou trop court (12 caractères minimum)');
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    console.log('Ce compte existe déjà : aucune modification.');
    return;
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await bcrypt.hash(password, 12),
      globalRole: 'SUPER_ADMIN',
    },
  });
  console.log(`Super-administrateur créé : ${email}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());