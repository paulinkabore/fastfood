import { Router, type Request } from 'express';
import { z } from 'zod';
import type { OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { orderInclude, presentOrder, type OrderWithRelations } from '../../lib/orderView';
import { emitOrderUpdated } from '../../lib/realtime';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const courierRouter = Router({ mergeParams: true });

// Le livreur ne voit que les livraisons : jamais les autres commandes du restaurant
const canDeliver = [authenticate, requireRestaurantRole('COURIER')];

const rid = (req: Request) => req.membership!.restaurantId;
const uid = (req: Request) => req.auth!.userId;

// Une livraison est proposée dès que la cuisine la prépare, tant que personne ne l'a prise
const OPEN: OrderStatus[] = ['PREPARING', 'READY'];

// Les coordonnées du client ne sont montrées qu'au livreur qui a pris la commande
const present = (o: OrderWithRelations, mine: boolean) => {
  const view = presentOrder(o);
  return {
    ...view,
    customerName: mine ? view.customerName : null,
    customerPhone: mine ? view.customerPhone : null,
    claimedAt: o.courierClaimedAt,
    mine,
  };
};

// ---------- Mes livraisons et celles à prendre ----------
courierRouter.get(
  '/courier/orders',
  ...canDeliver,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [available, mine, done] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          type: 'DELIVERY',
          courierId: null,
          status: { in: OPEN },
          sentToKitchenAt: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        include: orderInclude,
        take: 50,
      }),
      prisma.order.findMany({
        where: { restaurantId, type: 'DELIVERY', courierId: uid(req), status: { in: OPEN } },
        orderBy: { createdAt: 'asc' },
        include: orderInclude,
        take: 50,
      }),
      prisma.order.count({
        where: {
          restaurantId,
          type: 'DELIVERY',
          courierId: uid(req),
          status: 'SERVED',
          updatedAt: { gte: startOfDay },
        },
      }),
    ]);

    res.json({
      available: available.map((o) => present(o, false)),
      mine: mine.map((o) => present(o, true)),
      deliveredToday: done,
    });
  }),
);

// ---------- Prendre une livraison : le premier arrivé l'obtient ----------
courierRouter.post(
  '/courier/orders/:id/claim',
  ...canDeliver,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const id = z.string().uuid().parse(req.params.id);

    // Une seule mise à jour conditionnelle : si deux livreurs cliquent ensemble, un seul réussit
    const result = await prisma.order.updateMany({
      where: {
        id,
        restaurantId,
        type: 'DELIVERY',
        courierId: null,
        status: { in: OPEN },
        sentToKitchenAt: { not: null },
      },
      data: { courierId: uid(req), courierClaimedAt: new Date() },
    });

    if (result.count === 0) {
      const existing = await prisma.order.findFirst({ where: { id, restaurantId, type: 'DELIVERY' } });
      if (!existing) throw new AppError(404, 'NOT_FOUND', 'Livraison introuvable');
      if (existing.courierId === uid(req)) {
        const own = await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
        res.json({ order: present(own, true), unchanged: true });
        return;
      }
      throw new AppError(409, 'ALREADY_TAKEN', 'Cette livraison vient d’être prise par un autre livreur');
    }

    const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    await audit({
      userId: uid(req),
      restaurantId,
      action: 'DELIVERY_CLAIMED',
      entity: 'Order',
      entityId: id,
      details: { number: order.number },
    });
    void emitOrderUpdated(id);
    res.json({ order: present(order, true) });
  }),
);

// ---------- Marquer livrée ----------
courierRouter.post(
  '/courier/orders/:id/delivered',
  ...canDeliver,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const id = z.string().uuid().parse(req.params.id);

    const order = await prisma.order.findFirst({
      where: { id, restaurantId, type: 'DELIVERY', courierId: uid(req) },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Livraison introuvable');
    if (order.status === 'SERVED') {
      const same = await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
      res.json({ order: present(same, true), unchanged: true });
      return;
    }
    if (order.status !== 'READY') {
      throw new AppError(409, 'NOT_READY', 'La cuisine n’a pas encore terminé cette commande');
    }

    const result = await prisma.order.updateMany({
      where: { id, restaurantId, courierId: uid(req), status: 'READY' },
      data: { status: 'SERVED' },
    });
    if (result.count === 0) {
      throw new AppError(409, 'ORDER_CHANGED', 'Cette commande vient d’être modifiée');
    }

    const updated = await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    await audit({
      userId: uid(req),
      restaurantId,
      action: 'DELIVERY_DONE',
      entity: 'Order',
      entityId: id,
      details: { number: order.number },
    });
    void emitOrderUpdated(id);
    res.json({ order: present(updated, true) });
  }),
);
