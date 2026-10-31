import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderInclude, presentOrder } from '../../lib/orderView';
import { createOrder, findOrderByKey, orderItemSchema } from '../../lib/orderService';
import { emitOrderCreated } from '../../lib/realtime';

export const publicOrdersRouter = Router();

// ---------- Limites anti-abus ----------
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de commandes, réessayez dans quelques minutes' },
  },
});

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes, réessayez dans une minute' },
  },
});

const orderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  items: z.array(orderItemSchema).min(1).max(40),
  notes: z.string().trim().max(300).optional(),
});

// ---------- Créer une commande ----------
publicOrdersRouter.post(
  '/qr/:token/orders',
  orderLimiter,
  asyncHandler(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      throw new AppError(404, 'NOT_FOUND', 'QR code inconnu');
    }
    const body = orderSchema.parse(req.body);

    const qr = await prisma.qrCode.findUnique({
      where: { token },
      include: { restaurant: true, table: true },
    });
    if (!qr) throw new AppError(404, 'NOT_FOUND', 'QR code inconnu');

    // Anti double envoi : même clé = même commande, renvoyée telle quelle
    const existing = await findOrderByKey(qr.restaurantId, body.idempotencyKey);
    if (existing) {
      res.status(200).json({ order: presentOrder(existing), duplicate: true });
      return;
    }

    if (!qr.isActive || !qr.restaurant.isActive || (qr.table && !qr.table.isActive)) {
      throw new AppError(410, 'QR_INACTIVE', "Ce QR code n'est plus actif");
    }

    const { order, duplicate } = await createOrder({
      restaurantId: qr.restaurantId,
      type: qr.type === 'TABLE' ? 'DINE_IN' : 'TAKEAWAY',
      tableId: qr.tableId,
      qrCodeId: qr.id,
      createdById: null,
      notes: body.notes,
      idempotencyKey: body.idempotencyKey,
      items: body.items,
    });

    if (duplicate) {
      res.status(200).json({ order: presentOrder(order), duplicate: true });
      return;
    }
    void emitOrderCreated(order.id);
    res.status(201).json({ order: presentOrder(order) });
  }),
);

// ---------- Suivre une commande ----------
// L'identifiant (UUID aléatoire) sert de clé d'accès : il n'est connu que du client
publicOrdersRouter.get(
  '/orders/:id',
  trackingLimiter,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!z.string().uuid().safeParse(id).success) {
      throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    }
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ order: presentOrder(order) });
  }),
);