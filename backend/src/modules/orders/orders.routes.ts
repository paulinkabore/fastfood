import { Router, type Request } from 'express';
import { z } from 'zod';
import type { MemberRole, OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { orderInclude, presentOrder } from '../../lib/orderView';
import { emitOrderUpdated } from '../../lib/realtime';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const ordersRouter = Router({ mergeParams: true });

const STAFF: MemberRole[] = ['MANAGER', 'CASHIER', 'COOK', 'WAITER'];
const canAccess = [authenticate, requireRestaurantRole(...STAFF)];

// Restaurant déjà vérifié par le middleware
const rid = (req: Request) => req.membership!.restaurantId;

const ACTIVE: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY'];

// Enchaînements autorisés
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [],
  CANCELLED: [],
};

// Qui a le droit de passer une commande DANS ce statut
const WHO: Record<OrderStatus, MemberRole[]> = {
  RECEIVED: [],
  PREPARING: ['COOK', 'MANAGER'],
  READY: ['COOK', 'MANAGER'],
  SERVED: ['WAITER', 'CASHIER', 'MANAGER'],
  CANCELLED: ['CASHIER', 'MANAGER'],
};

// ---------- Liste des commandes ----------
ordersRouter.get(
  '/orders',
  ...canAccess,
  asyncHandler(async (req, res) => {
    const { scope } = z
      .object({ scope: z.enum(['active', 'today', 'kitchen']).default('active') })
      .parse(req.query);

    const restaurantId = rid(req);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const where =
      scope === 'kitchen'
        ? { restaurantId, status: { in: ACTIVE }, sentToKitchenAt: { not: null } }
        : scope === 'active'
          ? { restaurantId, status: { in: ACTIVE } }
          : { restaurantId, createdAt: { gte: startOfDay } };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: orderInclude,
      take: 200,
    });
    res.json({ orders: orders.map(presentOrder) });
  }),
);

// ---------- Changement de statut ----------
const statusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'SERVED', 'CANCELLED']),
  reason: z.string().trim().min(3).max(200).optional(),
});

ordersRouter.patch(
  '/orders/:id/status',
  ...canAccess,
  asyncHandler(async (req, res) => {
    const { status, reason } = statusSchema.parse(req.body);
    const restaurantId = rid(req);

    // La commande est cherchée dans CE restaurant uniquement
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.id), restaurantId },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');

    // Double clic : même statut déjà appliqué, rien à refaire
    if (order.status === status) {
      const same = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: orderInclude,
      });
      res.json({ order: presentOrder(same), unchanged: true });
      return;
    }

    if (!WHO[status].includes(req.membership!.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Votre rôle ne permet pas ce changement de statut');
    }
    if (!TRANSITIONS[order.status].includes(status)) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'Ce changement de statut est impossible depuis l’état actuel',
      );
    }
    if (status === 'CANCELLED') {
      if (!reason) throw new AppError(400, 'REASON_REQUIRED', 'Un motif est obligatoire pour annuler');
      if (order.paymentStatus === 'PAID') {
        throw new AppError(
          409,
          'ORDER_PAID',
          'Commande déjà payée : le remboursement sera disponible à l’étape 10',
        );
      }
    }

    // Mise à jour conditionnelle : si quelqu'un d'autre a changé le statut entre-temps, on refuse
    const result = await prisma.order.updateMany({
      where: { id: order.id, restaurantId, status: order.status },
      data: { status, ...(status === 'CANCELLED' ? { cancelledReason: reason } : {}) },
    });
    if (result.count === 0) {
      throw new AppError(409, 'ORDER_CHANGED', 'Cette commande vient d’être modifiée par quelqu’un d’autre');
    }

    if (status === 'CANCELLED') {
      await audit({
        userId: req.auth!.userId,
        restaurantId,
        action: 'ORDER_CANCELLED',
        entity: 'Order',
        entityId: order.id,
        details: { number: order.number, reason: reason ?? null },
      });
    }

    void emitOrderUpdated(order.id);

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
    res.json({ order: presentOrder(updated) });
  }),
);