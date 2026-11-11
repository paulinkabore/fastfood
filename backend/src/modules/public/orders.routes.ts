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

// Livraison : le client laisse son nom et son téléphone pour que le livreur le joigne
const customerSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ''))
    .pipe(z.string().regex(/^\+?\d{8,15}$/, 'Numéro de téléphone invalide')),
});

const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s.-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{8,15}$/, 'Numéro de téléphone invalide'));

const orderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  // Mobile Money : numéro qui a servi au dépôt, vérifié ensuite par le caissier
  payment: z.object({ method: z.literal('MOBILE_MONEY'), payerPhone: phoneSchema }).optional(),
  customer: customerSchema.optional(),
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

    const delivery = qr.type === 'DELIVERY';
    if (delivery && !body.customer) {
      throw new AppError(
        400,
        'CUSTOMER_REQUIRED',
        'Votre nom et votre numéro de téléphone sont obligatoires pour la livraison',
      );
    }

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
      type: qr.type === 'TABLE' ? 'DINE_IN' : delivery ? 'DELIVERY' : 'TAKEAWAY',
      tableId: qr.tableId,
      qrCodeId: qr.id,
      createdById: null,
      notes: body.notes,
      customerName: delivery ? body.customer?.name : undefined,
      customerPhone: delivery ? body.customer?.phone : undefined,
      mobileMoneyPayerPhone: body.payment?.payerPhone,
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
// ---------- Reçu du client ----------
// Disponible seulement une fois le paiement validé par le caissier
publicOrdersRouter.get(
  '/orders/:id/receipt',
  trackingLimiter,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!z.string().uuid().safeParse(id).success) {
      throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    }
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    const payment = await prisma.payment.findFirst({
      where: { orderId: id, confirmedAt: { not: null } },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!payment) throw new AppError(409, 'NOT_PAID', 'Le paiement n’est pas encore validé');

    const view = presentOrder(order);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      receipt: {
        restaurantName: view.restaurantName,
        receiptNumber: payment.receiptNumber,
        orderNumber: view.number,
        issuedAt: payment.confirmedAt,
        orderType: view.type,
        tableLabel: view.tableLabel,
        items: view.items.map((i) => ({ ...i, lineTotalFcfa: i.unitPriceFcfa * i.quantity })),
        totalFcfa: view.totalFcfa,
        method: payment.method,
        status: payment.status,
        refundedAt: payment.refundedAt,
        cashierName: null,
      },
    });
  }),
);
