import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const staffRouter = Router({ mergeParams: true });

const canManage = [authenticate, requireRestaurantRole('MANAGER')];

// Restaurant et utilisateur déjà vérifiés par les middlewares
const rid = (req: Request) => req.membership!.restaurantId;
const uid = (req: Request) => req.auth!.userId;

// Le gérant crée et gère le personnel ; les comptes gérants dépendent de l'administration
const ROLES = ['CASHIER', 'COOK', 'WAITER'] as const;
const password = z.string().min(10).max(72);

// ---------- Liste de l'équipe ----------
staffRouter.get(
  '/staff',
  ...canManage,
  asyncHandler(async (req, res) => {
    const rows = await prisma.restaurantMembership.findMany({
      where: { restaurantId: rid(req) },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, email: true, fullName: true, isActive: true } } },
    });
    res.json({
      staff: rows.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        fullName: m.user.fullName,
        role: m.role,
        isActive: m.isActive && m.user.isActive,
      })),
    });
  }),
);

// ---------- Création d'un compte ----------
const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(100),
  role: z.enum(ROLES),
  password,
});

staffRouter.post(
  '/staff',
  ...canManage,
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const restaurantId = rid(req);

    // Un email appartient à un seul compte dans toute l'application
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new AppError(409, 'EMAIL_TAKEN', 'Cet email est déjà utilisé');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash,
        memberships: { create: { restaurantId, role: data.role } },
      },
      select: { id: true, email: true, fullName: true },
    });

    await prisma.auditLog.create({
      data: {
        restaurantId,
        userId: uid(req),
        action: 'STAFF_CREATED',
        entity: 'User',
        entityId: user.id,
        details: { email: user.email, role: data.role },
      },
    });
    res.status(201).json({ staff: { userId: user.id, email: user.email, fullName: user.fullName, role: data.role } });
  }),
);

// ---------- Modification : nom, rôle, activation, mot de passe ----------
const updateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    role: z.enum(ROLES),
    isActive: z.boolean(),
    password,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

staffRouter.patch(
  '/staff/:userId',
  ...canManage,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const userId = String(req.params.userId);
    const data = updateSchema.parse(req.body);

    // Le compte est cherché dans CE restaurant uniquement
    const membership = await prisma.restaurantMembership.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
      include: { user: { select: { email: true } } },
    });
    if (!membership) throw new AppError(404, 'NOT_FOUND', 'Employé introuvable');
    if (membership.role === 'MANAGER') {
      throw new AppError(403, 'FORBIDDEN', 'Les comptes gérants sont gérés par l’administration');
    }

    await prisma.$transaction(async (tx) => {
      if (data.role !== undefined || data.isActive !== undefined) {
        await tx.restaurantMembership.update({
          where: { id: membership.id },
          data: {
            ...(data.role !== undefined ? { role: data.role } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          },
        });
      }
      if (data.fullName !== undefined || data.password !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
            ...(data.password !== undefined ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
          },
        });
      }
      // Désactivation ou nouveau mot de passe : toutes ses sessions sont fermées
      if (data.isActive === false || data.password !== undefined) {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'STAFF_UPDATED',
          entity: 'User',
          entityId: userId,
          // Le mot de passe n'est jamais écrit dans le journal
          details: {
            email: membership.user.email,
            role: data.role ?? null,
            isActive: data.isActive ?? null,
            nameChanged: data.fullName !== undefined,
            passwordChanged: data.password !== undefined,
          },
        },
      });
    });

    res.json({ ok: true });
  }),
);

// ---------- Suppression ----------
// L'historique (commandes, encaissements, journal) garde le nom de l'employé : le compte est donc
// retiré de l'équipe et rendu inutilisable, au lieu d'être effacé de la base
staffRouter.delete(
  '/staff/:userId',
  ...canManage,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const userId = String(req.params.userId);

    const membership = await prisma.restaurantMembership.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
      include: { user: { select: { email: true, fullName: true } } },
    });
    if (!membership) throw new AppError(404, 'NOT_FOUND', 'Employé introuvable');
    if (membership.role === 'MANAGER') {
      throw new AppError(403, 'FORBIDDEN', 'Les comptes gérants sont gérés par l’administration');
    }

    const openCash = await prisma.cashSession.count({
      where: { restaurantId, openedById: userId, status: 'OPEN' },
    });
    if (openCash > 0) {
      throw new AppError(409, 'CASH_OPEN', 'Cet employé a une caisse ouverte : elle doit être clôturée avant la suppression');
    }

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.restaurantMembership.delete({ where: { id: membership.id } });
      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          email: `supprime-${userId}@invalide.local`, // libère l'adresse email d'origine
          passwordHash: '!', // aucun mot de passe ne peut plus correspondre
        },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'STAFF_DELETED',
          entity: 'User',
          entityId: userId,
          details: { email: membership.user.email, name: membership.user.fullName, role: membership.role },
        },
      });
    });
    res.status(204).end();
  }),
);
