import type { RequestHandler } from 'express';
import type { MemberRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { securityEvent } from '../lib/security';

// 1. L'utilisateur est-il connecté ?
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    securityEvent(req, 'ACCESS_DENIED', { reason: 'sans connexion' });
    return next(new AppError(401, 'UNAUTHENTICATED', 'Connexion requise'));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.auth = { userId: payload.sub, globalRole: payload.role };
    next();
  } catch (err) {
    // Un jeton simplement expiré est normal ; un jeton falsifié ou illisible ne l'est pas
    if ((err as Error).name !== 'TokenExpiredError') {
      securityEvent(req, 'ACCESS_DENIED', { reason: 'jeton falsifié ou invalide' });
    }
    next(new AppError(401, 'INVALID_TOKEN', 'Jeton invalide ou expiré'));
  }
};

// 2. Est-il super-administrateur ?
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.auth?.globalRole !== 'SUPER_ADMIN') {
    securityEvent(req, 'ACCESS_DENIED', { userId: req.auth?.userId ?? null, reason: 'zone administrateur' });
    return next(new AppError(403, 'FORBIDDEN', 'Accès réservé au super-administrateur'));
  }
  next();
};

// 3. Appartient-il à CE restaurant (actif) avec un des rôles autorisés ?
export const requireRestaurantRole =
  (...roles: MemberRole[]): RequestHandler =>
  async (req, _res, next) => {
    try {
      const restaurantId = String(req.params.restaurantId);
      const membership = await prisma.restaurantMembership.findUnique({
        where: { userId_restaurantId: { userId: req.auth!.userId, restaurantId } },
        include: {
          restaurant: { select: { isActive: true } },
          user: { select: { isActive: true } },
        },
      });
      if (
        !membership ||
        !membership.isActive ||
        !membership.user.isActive ||
        !membership.restaurant.isActive ||
        !roles.includes(membership.role)
      ) {
        securityEvent(req, 'ACCESS_DENIED', { userId: req.auth!.userId, reason: 'restaurant ou rôle non autorisé' });
        throw new AppError(403, 'FORBIDDEN', 'Accès refusé pour ce restaurant');
      }
      req.membership = { restaurantId, role: membership.role };
      next();
    } catch (err) {
      next(err);
    }
  };