import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
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

// ---------- Validation ----------
const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  optionIds: z.array(z.string().uuid()).max(10).default([]),
  notes: z.string().trim().max(200).optional(),
});

const orderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(40),
  notes: z.string().trim().max(300).optional(),
});

// ---------- Présentation d'une commande ----------
const orderInclude = {
  items: true,
  table: { select: { label: true } },
  restaurant: { select: { name: true } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const present = (o: OrderWithRelations) => ({
  id: o.id,
  number: o.number,
  type: o.type,
  status: o.status,
  paymentStatus: o.paymentStatus,
  totalFcfa: o.totalFcfa,
  notes: o.notes,
  createdAt: o.createdAt,
  restaurantName: o.restaurant.name,
  tableLabel: o.table?.label ?? null,
  items: o.items.map((i) => ({
    productName: i.productName,
    quantity: i.quantity,
    unitPriceFcfa: i.unitPriceFcfa,
    options: ((i.optionsSnapshot as { name: string }[] | null) ?? []).map((x) => x.name),
    notes: i.notes,
  })),
});

const findByKey = (restaurantId: string, idempotencyKey: string) =>
  prisma.order.findUnique({
    where: { restaurantId_idempotencyKey: { restaurantId, idempotencyKey } },
    include: orderInclude,
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
    const restaurantId = qr.restaurantId;

    // Anti double envoi : même clé = même commande, renvoyée telle quelle
    const existing = await findByKey(restaurantId, body.idempotencyKey);
    if (existing) {
      res.status(200).json({ order: present(existing), duplicate: true });
      return;
    }

    if (!qr.isActive || !qr.restaurant.isActive || (qr.table && !qr.table.isActive)) {
      throw new AppError(410, 'QR_INACTIVE', "Ce QR code n'est plus actif");
    }

    // Produits chargés UNIQUEMENT dans ce restaurant
    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, restaurantId, category: { isActive: true } },
      include: { options: { where: { isActive: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Les prix viennent de la base, jamais du téléphone
    let total = 0;
    const lines = body.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new AppError(400, 'PRODUCT_NOT_FOUND', 'Un produit de la commande est introuvable');
      }
      if (!product.isAvailable) {
        throw new AppError(409, 'PRODUCT_UNAVAILABLE', `« ${product.name} » n'est plus disponible`);
      }
      const options = [...new Set(item.optionIds)].map((id) => {
        const option = product.options.find((o) => o.id === id);
        if (!option) {
          throw new AppError(400, 'OPTION_NOT_FOUND', `Option invalide pour « ${product.name} »`);
        }
        return option;
      });
      const unitPriceFcfa =
        product.priceFcfa + options.reduce((sum, o) => sum + o.priceDeltaFcfa, 0);
      total += unitPriceFcfa * item.quantity;
      return {
        restaurantId,
        productId: product.id,
        productName: product.name,
        unitPriceFcfa,
        quantity: item.quantity,
        optionsSnapshot: options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDeltaFcfa: o.priceDeltaFcfa,
        })),
        notes: item.notes,
      };
    });

    const type = qr.type === 'TABLE' ? ('DINE_IN' as const) : ('TAKEAWAY' as const);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const order = await prisma.$transaction(async (tx) => {
          const last = await tx.order.aggregate({
            where: { restaurantId },
            _max: { number: true },
          });
          return tx.order.create({
            data: {
              restaurantId,
              number: (last._max.number ?? 0) + 1,
              type,
              tableId: qr.tableId,
              qrCodeId: qr.id,
              notes: body.notes,
              totalFcfa: total,
              idempotencyKey: body.idempotencyKey,
              sentToKitchenAt: new Date(),
              items: { create: lines },
              // Paiement en espèces : en attente jusqu'à l'encaissement par le caissier
              payments: { create: { restaurantId, method: 'CASH', amountFcfa: total } },
            },
            include: orderInclude,
          });
        });
        void emitOrderCreated(order.id);
        res.status(201).json({ order: present(order) });
        return;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Deux envois simultanés avec la même clé : on renvoie la commande gagnante
          const again = await findByKey(restaurantId, body.idempotencyKey);
          if (again) {
            res.status(200).json({ order: present(again), duplicate: true });
            return;
          }
          continue; // numéro déjà pris par une autre commande : nouvel essai
        }
        throw err;
      }
    }
    throw new AppError(503, 'ORDER_BUSY', 'Le restaurant reçoit beaucoup de commandes, réessayez');
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
    res.json({ order: present(order) });
  }),
);