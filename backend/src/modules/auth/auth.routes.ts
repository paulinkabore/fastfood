import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { rateLimitHandler, securityEvent } from '../../lib/security';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { env } from '../../config/env';
import { signAccessToken, newRefreshToken, hashToken } from '../../lib/tokens';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { MIN_PASSWORD_MANAGER, MIN_PASSWORD_STAFF } from '../../lib/passwordPolicy';

export const authRouter = Router();

const REFRESH_DAYS = 7;
// Empreinte factice (mot de passe aléatoire) pour égaliser le temps de réponse
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const COOKIE_NAME = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
};

// Limite les tentatives de connexion (anti force brute)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('TOO_MANY_ATTEMPTS', 'Trop de tentatives, réessayez plus tard'),
});

async function issueSession(userId: string, role: 'SUPER_ADMIN' | 'USER', res: Response) {
  const refresh = newRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refresh),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  res.cookie(COOKIE_NAME, refresh, cookieOptions);
  return signAccessToken({ sub: userId, role });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { isActive: true },
          select: { restaurantId: true, role: true },
        },
      },
    });

    // Compte bloqué après trop d'échecs : même un bon mot de passe est refusé jusqu'à la fin du délai
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      securityEvent(req, 'LOGIN_BLOCKED', { email: user.email });
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(
        429,
        'ACCOUNT_LOCKED',
        `Trop d'échecs de connexion. Compte bloqué encore ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      );
    }

    // Même durée de calcul que le compte existe ou non : impossible de deviner les emails valides
    const valid =
      (await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)) && Boolean(user?.isActive);
    if (!user || !valid) {
      securityEvent(req, 'LOGIN_FAILED', { email: email.toLowerCase().slice(0, 80), knownAccount: user ? 1 : 0 });
      if (user) {
        const failed = user.failedLogins + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        if (lock) {
          await audit({
            userId: user.id,
            action: 'ACCOUNT_LOCKED',
            entity: 'User',
            entityId: user.id,
            details: { minutes: LOCK_MINUTES, ip: req.ip ?? null },
          });
        }
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: lock ? 0 : failed,
            lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        });
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect');
    }
    if (user.failedLogins > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }

    const accessToken = await issueSession(user.id, user.globalRole, res);
    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        globalRole: user.globalRole,
        memberships: user.memberships,
      },
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) throw new AppError(401, 'NO_REFRESH_TOKEN', 'Session absente');

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    const invalid =
      !stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive;
    if (invalid) {
      // Réutilisation d'un jeton déjà révoqué : on coupe toutes les sessions de l'utilisateur
      if (stored?.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      res.clearCookie(COOKIE_NAME, { path: cookieOptions.path });
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expirée');
    }

    // Rotation : l'ancien jeton est révoqué, un nouveau est émis
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await issueSession(stored.userId, stored.user.globalRole, res);
    res.json({ accessToken });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(COOKIE_NAME, { path: cookieOptions.path });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        globalRole: true,
        memberships: {
          where: { isActive: true },
          select: { restaurantId: true, role: true },
        },
      },
    });
    res.json({ user });
  }),
);

// ---------- Changement de mot de passe par l'employé ----------
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_STAFF).max(72),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Le nouveau mot de passe doit être différent de l’ancien',
    path: ['newPassword'],
  });

authRouter.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      include: { memberships: { select: { role: true } } },
    });
    // Gérant et super-administrateur : 10 caractères ; le reste du personnel : 6
    const isManager = user?.globalRole === 'SUPER_ADMIN' || user?.memberships.some((m) => m.role === 'MANAGER');
    if (isManager && newPassword.length < MIN_PASSWORD_MANAGER) {
      throw new AppError(400, 'WEAK_PASSWORD', `Le mot de passe doit faire ${MIN_PASSWORD_MANAGER} caractères au moins`);
    }
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError(400, 'WRONG_PASSWORD', 'Le mot de passe actuel est incorrect');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    // Toutes les autres sessions sont fermées ; celle-ci continue avec un nouveau jeton
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const accessToken = await issueSession(user.id, user.globalRole, res);
    res.json({ accessToken });
  }),
);
