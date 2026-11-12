import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { MIN_PASSWORD_MANAGER } from '../../lib/passwordPolicy';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { uniqueSlug } from '../../lib/slug';
import { audit } from '../../lib/audit';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';

export const adminRouter = Router();

// Toutes les routes de ce fichier : connecté ET super-administrateur
adminRouter.use(authenticate, requireSuperAdmin);

async function getRestaurant(id: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id } });
  if (!restaurant) throw new AppError(404, 'NOT_FOUND', 'Restaurant introuvable');
  return restaurant;
}

// Comptes gérants : mot de passe plus long
const password = z.string().min(MIN_PASSWORD_MANAGER, `Le mot de passe doit faire ${MIN_PASSWORD_MANAGER} caractères au moins`).max(72);

// ---------- Restaurants ----------
const restaurantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
});

adminRouter.post(
  '/restaurants',
  asyncHandler(async (req, res) => {
    const data = restaurantSchema.parse(req.body);
    const slug = await uniqueSlug(data.name);
    const restaurant = await prisma.restaurant.create({ data: { ...data, slug } });
    await audit({
      userId: req.auth!.userId,
      restaurantId: restaurant.id,
      action: 'RESTAURANT_CREATED',
      entity: 'Restaurant',
      entityId: restaurant.id,
      details: { name: restaurant.name },
    });
    res.status(201).json({ restaurant });
  }),
);

adminRouter.get(
  '/restaurants',
  asyncHandler(async (_req, res) => {
    const restaurants = await prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { memberships: true, tables: true, products: true } } },
    });
    res.json({ restaurants });
  }),
);

adminRouter.get(
  '/restaurants/:id',
  asyncHandler(async (req, res) => {
    const restaurant = await getRestaurant(String(req.params.id));
    res.json({ restaurant });
  }),
);

const updateRestaurantSchema = restaurantSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

adminRouter.patch(
  '/restaurants/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await getRestaurant(id);
    const changes = updateRestaurantSchema.parse(req.body);
    const restaurant = await prisma.restaurant.update({ where: { id }, data: changes });
    await audit({
      userId: req.auth!.userId,
      restaurantId: id,
      action: 'RESTAURANT_UPDATED',
      entity: 'Restaurant',
      entityId: id,
      details: changes,
    });
    res.json({ restaurant });
  }),
);

// ---------- Gérants ----------
const managerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(100),
  password,
});

adminRouter.post(
  '/restaurants/:id/managers',
  asyncHandler(async (req, res) => {
    const restaurant = await getRestaurant(String(req.params.id));
    const data = managerSchema.parse(req.body);

    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Cet email est déjà utilisé');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const manager = await prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        memberships: { create: { restaurantId: restaurant.id, role: 'MANAGER' } },
      },
      select: { id: true, email: true, fullName: true },
    });

    await audit({
      userId: req.auth!.userId,
      restaurantId: restaurant.id,
      action: 'MANAGER_CREATED',
      entity: 'User',
      entityId: manager.id,
      details: { email: manager.email },
    });
    res.status(201).json({ manager });
  }),
);

adminRouter.get(
  '/restaurants/:id/managers',
  asyncHandler(async (req, res) => {
    const restaurant = await getRestaurant(String(req.params.id));
    const memberships = await prisma.restaurantMembership.findMany({
      where: { restaurantId: restaurant.id, role: 'MANAGER' },
      select: {
        isActive: true,
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
    res.json({ managers: memberships.map((m) => ({ ...m.user, isActive: m.isActive })) });
  }),
);

const updateManagerSchema = z
  .object({ isActive: z.boolean().optional(), password: password.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

adminRouter.patch(
  '/restaurants/:id/managers/:userId',
  asyncHandler(async (req, res) => {
    const restaurantId = String(req.params.id);
    const userId = String(req.params.userId);
    const changes = updateManagerSchema.parse(req.body);

    const membership = await prisma.restaurantMembership.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new AppError(404, 'NOT_FOUND', 'Gérant introuvable pour ce restaurant');
    }

    if (changes.isActive !== undefined) {
      await prisma.restaurantMembership.update({
        where: { id: membership.id },
        data: { isActive: changes.isActive },
      });
    }
    if (changes.password) {
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(changes.password, 12) },
      });
    }
    // Désactivation ou nouveau mot de passe : toutes ses sessions sont fermées
    if (changes.isActive === false || changes.password) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await audit({
      userId: req.auth!.userId,
      restaurantId,
      action: 'MANAGER_UPDATED',
      entity: 'User',
      entityId: userId,
      // Le mot de passe n'est jamais écrit dans le journal
      details: { isActive: changes.isActive, passwordChanged: Boolean(changes.password) },
    });
    res.json({ ok: true });
  }),
);

// ---------- Remise à zéro des données ----------
// Efface les données d'activité de TOUS les restaurants (commandes, paiements, caisses, menu, stock,
// tables, historique) et les comptes du personnel. Restent : les restaurants, les super-admins et les gérants.
adminRouter.post(
  '/reset-data',
  asyncHandler(async (req, res) => {
    const { confirmText, password: adminPassword } = z
      .object({ confirmText: z.string(), password: z.string().min(1) })
      .parse(req.body ?? {});
    const me = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!me || !(await bcrypt.compare(adminPassword, me.passwordHash))) {
      throw new AppError(403, 'WRONG_PASSWORD', 'Mot de passe incorrect');
    }
    if (confirmText.trim() !== 'EFFACER') {
      throw new AppError(400, 'CONFIRMATION_MISMATCH', 'Tapez EFFACER pour confirmer');
    }

    await prisma.$transaction(
      async (tx) => {
        // Comptes à conserver : super-admins et tous les gérants
        const managers = await tx.restaurantMembership.findMany({
          where: { role: 'MANAGER' },
          select: { userId: true },
        });
        const keepIds = new Set(managers.map((m) => m.userId));
        const supers = await tx.user.findMany({ where: { globalRole: { not: 'USER' } }, select: { id: true } });
        supers.forEach((u) => keepIds.add(u.id));
        const keep = [...keepIds];

        const staff = await tx.user.findMany({ where: { id: { notIn: keep } }, select: { id: true } });
        const staffIds = staff.map((u) => u.id);

        // Dans l'ordre des dépendances
        await tx.refreshToken.deleteMany({ where: { userId: { in: staffIds } } });
        await tx.stockMovement.deleteMany({});
        await tx.payment.deleteMany({});
        await tx.paymentEvent.deleteMany({});
        await tx.orderItem.deleteMany({});
        await tx.order.deleteMany({});
        await tx.cashSession.deleteMany({});
        await tx.recipe.deleteMany({});
        await tx.productOption.deleteMany({});
        await tx.product.deleteMany({});
        await tx.ingredient.deleteMany({});
        await tx.qrCode.deleteMany({});
        await tx.restaurantTable.deleteMany({});
        await tx.category.deleteMany({});
        await tx.auditLog.deleteMany({});
        await tx.restaurantMembership.deleteMany({ where: { userId: { in: staffIds } } });
        await tx.restaurantMembership.deleteMany({ where: { role: { not: 'MANAGER' } } });
        await tx.user.deleteMany({ where: { id: { in: staffIds } } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await audit({ userId: req.auth!.userId, action: 'DATA_RESET', entity: 'System' });
    res.json({ ok: true });
  }),
);

// ---------- Suppression définitive d'un restaurant ----------
// Efface TOUTES ses données. Le nom exact doit être répété pour confirmer.
adminRouter.delete(
  '/restaurants/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const restaurant = await getRestaurant(id);
    const { confirmName, password: adminPassword } = z
      .object({ confirmName: z.string(), password: z.string().min(1) })
      .parse(req.body ?? {});
    // Action irréversible : le mot de passe est redemandé même si la session est ouverte
    const me = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!me || !(await bcrypt.compare(adminPassword, me.passwordHash))) {
      throw new AppError(403, 'WRONG_PASSWORD', 'Mot de passe incorrect');
    }
    if (confirmName.trim() !== restaurant.name) {
      throw new AppError(400, 'CONFIRMATION_MISMATCH', 'Le nom saisi ne correspond pas au restaurant');
    }

    await prisma.$transaction(
      async (tx) => {
        // Comptes qui n'existent que pour ce restaurant (jamais un super-admin)
        const members = await tx.restaurantMembership.findMany({
          where: { restaurantId: id },
          select: { userId: true },
        });
        const candidateIds = [...new Set(members.map((m) => m.userId))];
        const elsewhere = await tx.restaurantMembership.findMany({
          where: { userId: { in: candidateIds }, restaurantId: { not: id } },
          select: { userId: true },
        });
        const keep = new Set(elsewhere.map((m) => m.userId));
        const owned = await tx.user.findMany({
          where: { id: { in: candidateIds.filter((u) => !keep.has(u)) }, globalRole: 'USER' },
          select: { id: true },
        });
        const userIds = owned.map((u) => u.id);

        // Dans l'ordre des dépendances : les lignes qui en référencent d'autres partent d'abord
        await tx.refreshToken.deleteMany({
          where: { OR: [{ restaurantId: id }, { userId: { in: userIds } }] },
        });
        await tx.stockMovement.deleteMany({ where: { restaurantId: id } });
        await tx.payment.deleteMany({ where: { restaurantId: id } });
        await tx.orderItem.deleteMany({ where: { restaurantId: id } });
        await tx.order.deleteMany({ where: { restaurantId: id } });
        await tx.cashSession.deleteMany({ where: { restaurantId: id } });
        await tx.recipe.deleteMany({ where: { restaurantId: id } });
        await tx.productOption.deleteMany({ where: { restaurantId: id } });
        await tx.product.deleteMany({ where: { restaurantId: id } });
        await tx.ingredient.deleteMany({ where: { restaurantId: id } });
        await tx.qrCode.deleteMany({ where: { restaurantId: id } });
        await tx.restaurantTable.deleteMany({ where: { restaurantId: id } });
        await tx.category.deleteMany({ where: { restaurantId: id } });
        await tx.auditLog.deleteMany({
          where: { OR: [{ restaurantId: id }, { userId: { in: userIds } }] },
        });
        await tx.restaurantMembership.deleteMany({ where: { restaurantId: id } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.restaurant.delete({ where: { id } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await audit({
      userId: req.auth!.userId,
      action: 'RESTAURANT_DELETED',
      entity: 'Restaurant',
      entityId: id,
      details: { name: restaurant.name },
    });
    res.status(204).end();
  }),
);
