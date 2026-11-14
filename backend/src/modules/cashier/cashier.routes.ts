import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type CashSession, type MemberRole, type OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { orderInclude, presentOrder } from '../../lib/orderView';
import { createOrder, orderItemSchema } from '../../lib/orderService';
import { emitOrderCreated, emitOrderUpdated } from '../../lib/realtime';
import { restoreStockForOrder } from '../../lib/stock';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const cashierRouter = Router({ mergeParams: true });

const CASH_ROLES: MemberRole[] = ['CASHIER', 'MANAGER'];
const canCash = [authenticate, requireRestaurantRole(...CASH_ROLES)];
const canManage = [authenticate, requireRestaurantRole('MANAGER')];
// Opérations de caisse : réservées au caissier (le gérant consulte seulement)
const cashierOnly = [authenticate, requireRestaurantRole('CASHIER')];

// Restaurant et utilisateur déjà vérifiés par les middlewares
const rid = (req: Request) => req.membership!.restaurantId;
const uid = (req: Request) => req.auth!.userId;

const ACTIVE: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY'];

type Db = Prisma.TransactionClient;

// Un seul traitement de caisse à la fois par restaurant :
// garantit des numéros de reçu uniques et une seule caisse ouverte par caissier
const lockRestaurant = (tx: Db, restaurantId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}::text))`;

// La caisse ouverte de CET utilisateur dans CE restaurant
const getOpenSession = (db: Db, restaurantId: string, userId: string) =>
  db.cashSession.findFirst({ where: { restaurantId, openedById: userId, status: 'OPEN' } });

async function requireOpenSession(db: Db, restaurantId: string, userId: string) {
  const session = await getOpenSession(db, restaurantId, userId);
  if (!session) {
    throw new AppError(409, 'NO_OPEN_SESSION', 'Ouvrez votre caisse avant d’encaisser');
  }
  return session;
}

// ---------- Totaux d'une caisse ----------
async function sessionTotals(db: Db, session: { id: string; openingFloatFcfa: number }) {
  const [collected, refunded] = await Promise.all([
    db.payment.aggregate({
      where: { cashSessionId: session.id, method: 'CASH', confirmedAt: { not: null } },
      _sum: { amountFcfa: true },
      _count: true,
    }),
    db.payment.aggregate({
      where: { refundSessionId: session.id },
      _sum: { amountFcfa: true },
      _count: true,
    }),
  ]);
  const collectedFcfa = collected._sum.amountFcfa ?? 0;
  const refundedFcfa = refunded._sum.amountFcfa ?? 0;
  return {
    collectedFcfa,
    collectedCount: collected._count,
    refundedFcfa,
    refundedCount: refunded._count,
    // Argent qui doit se trouver dans le tiroir
    expectedFcfa: session.openingFloatFcfa + collectedFcfa - refundedFcfa,
  };
}

type Totals = Awaited<ReturnType<typeof sessionTotals>>;

const presentSession = (s: CashSession, t: Totals) => ({
  id: s.id,
  status: s.status,
  openedAt: s.openedAt,
  closedAt: s.closedAt,
  openingFloatFcfa: s.openingFloatFcfa,
  ...t,
  closingAmountFcfa: s.closingAmountFcfa,
  differenceFcfa: s.differenceFcfa,
  closingNote: s.closingNote,
});

const presentPayment = (p: {
  id: string;
  method: string;
  status: string;
  amountFcfa: number;
  receiptNumber: number | null;
  confirmedAt: Date | null;
}) => ({
  id: p.id,
  method: p.method,
  status: p.status,
  amountFcfa: p.amountFcfa,
  receiptNumber: p.receiptNumber,
  confirmedAt: p.confirmedAt,
});

const cashierInclude = {
  ...orderInclude,
  payments: {
    select: {
      id: true,
      method: true,
      status: true,
      provider: true,
      payerPhone: true,
      receiptNumber: true,
      confirmedAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

const presentCashierOrder = (o: Prisma.OrderGetPayload<{ include: typeof cashierInclude }>) => ({
  ...presentOrder(o),
  payments: o.payments,
});

// ================= Caisses =================

// MA caisse ouverte (chaque caissier a la sienne)
cashierRouter.get(
  '/cash-sessions/current',
  ...canCash,
  asyncHandler(async (req, res) => {
    const session = await getOpenSession(prisma, rid(req), uid(req));
    res.json({
      session: session ? presentSession(session, await sessionTotals(prisma, session)) : null,
    });
  }),
);

cashierRouter.post(
  '/cash-sessions',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const { openingFloatFcfa } = z
      .object({ openingFloatFcfa: z.number().int().min(0).max(10_000_000) })
      .parse(req.body);
    const restaurantId = rid(req);

    const session = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      if (await getOpenSession(tx, restaurantId, uid(req))) {
        throw new AppError(409, 'SESSION_ALREADY_OPEN', 'Vous avez déjà une caisse ouverte');
      }
      return tx.cashSession.create({
        data: { restaurantId, openedById: uid(req), openingFloatFcfa },
      });
    });

    await audit({
      userId: uid(req),
      restaurantId,
      action: 'CASH_SESSION_OPENED',
      entity: 'CashSession',
      entityId: session.id,
      details: { openingFloatFcfa },
    });
    res.status(201).json({ session: presentSession(session, await sessionTotals(prisma, session)) });
  }),
);

const closeSchema = z.object({
  countedAmountFcfa: z.number().int().min(0).max(100_000_000),
  note: z.string().trim().min(3).max(300).optional(),
});

cashierRouter.post(
  '/cash-sessions/:id/close',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const body = closeSchema.parse(req.body);
    const restaurantId = rid(req);

    const closed = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const session = await tx.cashSession.findFirst({
        where: { id: String(req.params.id), restaurantId },
      });
      if (!session) throw new AppError(404, 'NOT_FOUND', 'Caisse introuvable');
      if (session.status === 'CLOSED') {
        throw new AppError(409, 'SESSION_CLOSED', 'Cette caisse est déjà clôturée');
      }
      // Un caissier ne clôture que sa propre caisse
      if (session.openedById !== uid(req)) {
        throw new AppError(403, 'FORBIDDEN', 'Vous ne pouvez clôturer que votre propre caisse');
      }

      const totals = await sessionTotals(tx, session);
      const difference = body.countedAmountFcfa - totals.expectedFcfa;
      if (difference !== 0 && !body.note) {
        throw new AppError(400, 'NOTE_REQUIRED', 'Écart de caisse : une explication est obligatoire');
      }

      const updated = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: uid(req),
          closingAmountFcfa: body.countedAmountFcfa,
          expectedAmountFcfa: totals.expectedFcfa,
          differenceFcfa: difference,
          closingNote: body.note ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'CASH_SESSION_CLOSED',
          entity: 'CashSession',
          entityId: session.id,
          details: {
            openedById: session.openedById,
            expected: totals.expectedFcfa,
            counted: body.countedAmountFcfa,
            difference,
            note: body.note ?? null,
          },
        },
      });
      return { session: updated, totals };
    });

    res.json({ session: presentSession(closed.session, closed.totals) });
  }),
);

// Historique de toutes les caisses : gérant uniquement
cashierRouter.get(
  '/cash-sessions',
  ...canManage,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.cashSession.findMany({
      where: { restaurantId: rid(req) },
      orderBy: { openedAt: 'desc' },
      take: 50,
      include: {
        openedBy: { select: { fullName: true } },
        closedBy: { select: { fullName: true } },
      },
    });
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingFloatFcfa: s.openingFloatFcfa,
        expectedFcfa: s.expectedAmountFcfa,
        closingAmountFcfa: s.closingAmountFcfa,
        differenceFcfa: s.differenceFcfa,
        closingNote: s.closingNote,
        openedByName: s.openedBy.fullName,
        closedByName: s.closedBy?.fullName ?? null,
      })),
    });
  }),
);

// ================= Encaissement =================
async function collectCash(opts: {
  restaurantId: string;
  orderId: string;
  userId: string;
  amountReceivedFcfa?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await lockRestaurant(tx, opts.restaurantId);
    // L'argent entre dans la caisse de celui qui encaisse
    const session = await requireOpenSession(tx, opts.restaurantId, opts.userId);

    const order = await tx.order.findFirst({
      where: { id: opts.orderId, restaurantId: opts.restaurantId },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    if (order.status === 'CANCELLED') {
      throw new AppError(409, 'ORDER_CANCELLED', 'Cette commande est annulée');
    }
    if (order.paymentStatus === 'REFUNDED') {
      throw new AppError(409, 'ORDER_REFUNDED', 'Cette commande a été remboursée');
    }

    // Double clic : déjà payée, on renvoie le même paiement sans rien refaire
    if (order.paymentStatus === 'PAID') {
      const payment = await tx.payment.findFirst({
        where: { orderId: order.id, status: 'PAID' },
        orderBy: { confirmedAt: 'desc' },
      });
      if (!payment) throw new AppError(409, 'ORDER_CHANGED', 'Paiement introuvable, réessayez');
      return { order, payment, unchanged: true, changeFcfa: null as number | null };
    }

    if (opts.amountReceivedFcfa !== undefined && opts.amountReceivedFcfa < order.totalFcfa) {
      throw new AppError(400, 'AMOUNT_TOO_LOW', 'Le montant reçu est inférieur au total');
    }

    // Numéro de reçu suivant (le verrou garantit qu'il est unique)
    const last = await tx.payment.aggregate({
      where: { restaurantId: opts.restaurantId },
      _max: { receiptNumber: true },
    });
    const receiptNumber = (last._max.receiptNumber ?? 0) + 1;

    const pending = await tx.payment.findFirst({
      where: { orderId: order.id, method: 'CASH', status: 'PENDING' },
    });
    const data = {
      status: 'PAID' as const,
      amountFcfa: order.totalFcfa,
      cashSessionId: session.id,
      confirmedAt: new Date(),
      confirmedById: opts.userId,
      receiptNumber,
    };
    const payment = pending
      ? await tx.payment.update({ where: { id: pending.id }, data })
      : await tx.payment.create({
          data: { ...data, restaurantId: opts.restaurantId, orderId: order.id, method: 'CASH' },
        });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID', sentToKitchenAt: order.sentToKitchenAt ?? new Date() },
    });
    // Un paiement Mobile Money encore en attente n'a plus lieu d'être
    await tx.payment.updateMany({
      where: { orderId: order.id, method: 'MOBILE_MONEY', status: 'PENDING' },
      data: { status: 'FAILED', failureReason: 'Payé en espèces à la caisse' },
    });

    await tx.auditLog.create({
      data: {
        restaurantId: opts.restaurantId,
        userId: opts.userId,
        action: 'PAYMENT_CASH_CONFIRMED',
        entity: 'Payment',
        entityId: payment.id,
        details: {
          orderNumber: order.number,
          amountFcfa: order.totalFcfa,
          receiptNumber,
          cashSessionId: session.id,
        },
      },
    });

    return {
      order: updatedOrder,
      payment,
      unchanged: false,
      changeFcfa:
        opts.amountReceivedFcfa !== undefined ? opts.amountReceivedFcfa - order.totalFcfa : null,
    };
  });
}

cashierRouter.post(
  '/orders/:orderId/pay/cash',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const { amountReceivedFcfa } = z
      .object({ amountReceivedFcfa: z.number().int().min(0).max(100_000_000).optional() })
      .parse(req.body ?? {});

    const result = await collectCash({
      restaurantId: rid(req),
      orderId: String(req.params.orderId),
      userId: uid(req),
      amountReceivedFcfa,
    });
    if (!result.unchanged) void emitOrderUpdated(result.order.id);

    res.json({
      payment: presentPayment(result.payment),
      changeFcfa: result.changeFcfa,
      unchanged: result.unchanged,
    });
  }),
);

// ================= Mobile Money : validation par le caissier =================
// Le client a composé le code et saisi son numéro ; le caissier compare avec le message de l'opérateur
async function findPendingManual(tx: Db, restaurantId: string, orderId: string) {
  const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
  const payment = await tx.payment.findFirst({
    where: { orderId, method: 'MOBILE_MONEY', provider: 'manual', status: 'PENDING' },
  });
  return { order, payment };
}

cashierRouter.post(
  '/orders/:orderId/pay/mobile-money/validate',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const orderId = String(req.params.orderId);

    const result = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const { order, payment } = await findPendingManual(tx, restaurantId, orderId);
      if (order.paymentStatus === 'PAID') return { order, unchanged: true };
      if (order.status === 'CANCELLED') {
        throw new AppError(409, 'ORDER_CANCELLED', 'Cette commande est annulée');
      }
      if (!payment) throw new AppError(409, 'NO_PENDING_PAYMENT', 'Aucun paiement Mobile Money en attente');

      const last = await tx.payment.aggregate({
        where: { restaurantId },
        _max: { receiptNumber: true },
      });
      const receiptNumber = (last._max.receiptNumber ?? 0) + 1;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          amountFcfa: order.totalFcfa,
          confirmedAt: new Date(),
          confirmedById: uid(req),
          receiptNumber,
        },
      });
      // Une fois validée, la commande part en cuisine
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID', sentToKitchenAt: order.sentToKitchenAt ?? new Date() },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'PAYMENT_MOBILE_MONEY_VALIDATED',
          entity: 'Payment',
          entityId: payment.id,
          details: {
            orderNumber: order.number,
            amountFcfa: order.totalFcfa,
            payerPhone: payment.payerPhone,
            receiptNumber,
          },
        },
      });
      return { order: updated, unchanged: false };
    });

    if (!result.unchanged) {
      void emitOrderCreated(result.order.id); // la cuisine la reçoit
      void emitOrderUpdated(result.order.id); // le client voit « validée »
    }
    res.json({ ok: true, unchanged: result.unchanged });
  }),
);

cashierRouter.post(
  '/orders/:orderId/pay/mobile-money/reject',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const orderId = String(req.params.orderId);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body ?? {});

    const order = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);
      const found = await findPendingManual(tx, restaurantId, orderId);
      if (!found.payment || found.order.paymentStatus !== 'PENDING' || found.order.sentToKitchenAt) {
        throw new AppError(409, 'NOT_REJECTABLE', 'Cette commande n’est plus en attente de validation');
      }
      await tx.payment.update({
        where: { id: found.payment.id },
        data: { status: 'FAILED', failureReason: reason },
      });
      const cancelled = await tx.order.update({
        where: { id: found.order.id },
        data: { status: 'CANCELLED', cancelledReason: `Paiement refusé : ${reason}` },
      });
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'PAYMENT_MOBILE_MONEY_REJECTED',
          entity: 'Payment',
          entityId: found.payment.id,
          details: { orderNumber: found.order.number, reason, payerPhone: found.payment.payerPhone },
        },
      });
      return cancelled;
    });

    void emitOrderUpdated(order.id);
    res.json({ ok: true });
  }),
);

// ================= Liste et commande au comptoir =================
cashierRouter.get(
  '/cashier/orders',
  ...canCash,
  asyncHandler(async (req, res) => {
    const { scope } = z
      .object({ scope: z.enum(['unpaid', 'today']).default('unpaid') })
      .parse(req.query);
    const restaurantId = rid(req);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const where =
      scope === 'unpaid'
        ? { restaurantId, paymentStatus: 'PENDING' as const, status: { not: 'CANCELLED' as const } }
        : { restaurantId, createdAt: { gte: startOfDay } };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: cashierInclude,
      take: 200,
    });
    res.json({ orders: orders.map(presentCashierOrder) });
  }),
);

const counterSchema = z.object({
  idempotencyKey: z.string().uuid(),
  type: z.enum(['DINE_IN', 'TAKEAWAY']),
  tableId: z.string().uuid().optional(),
  notes: z.string().trim().max(300).optional(),
  // À emporter : nom du client, appelé au haut-parleur quand la commande est prête
  customerName: z.string().trim().min(2).max(40).optional(),
  items: z.array(orderItemSchema).min(1).max(40),
  payNow: z.boolean().default(false),
});

cashierRouter.post(
  '/cashier/orders',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const body = counterSchema.parse(req.body);
    const restaurantId = rid(req);

    if (body.tableId) {
      if (body.type !== 'DINE_IN') {
        throw new AppError(400, 'TABLE_NOT_ALLOWED', 'Une table ne peut être choisie que pour une commande sur place');
      }
      const table = await prisma.restaurantTable.findFirst({
        where: { id: body.tableId, restaurantId, isActive: true },
      });
      if (!table) throw new AppError(404, 'NOT_FOUND', 'Table introuvable');
    }

    if (body.type === 'TAKEAWAY' && !body.customerName) {
      throw new AppError(400, 'NAME_REQUIRED', 'Le nom du client est obligatoire pour une commande à emporter');
    }

    // Paiement immédiat : MA caisse doit être ouverte AVANT de créer la commande
    if (body.payNow) await requireOpenSession(prisma, restaurantId, uid(req));

    const { order, duplicate } = await createOrder({
      restaurantId,
      type: body.type,
      tableId: body.tableId ?? null,
      qrCodeId: null,
      createdById: uid(req),
      notes: body.notes,
      customerName: body.type === 'TAKEAWAY' ? body.customerName : undefined,
      idempotencyKey: body.idempotencyKey,
      items: body.items,
    });

    if (duplicate) {
      res.status(200).json({ order: presentOrder(order), duplicate: true });
      return;
    }
    void emitOrderCreated(order.id);

    if (!body.payNow) {
      res.status(201).json({ order: presentOrder(order), payment: null });
      return;
    }

    const paid = await collectCash({ restaurantId, orderId: order.id, userId: uid(req) });
    void emitOrderUpdated(order.id);
    const fresh = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderInclude,
    });
    res.status(201).json({ order: presentOrder(fresh), payment: presentPayment(paid.payment) });
  }),
);

// Nom du client d'une commande à emporter (saisi par le caissier, annoncé au haut-parleur)
cashierRouter.post(
  '/orders/:orderId/customer-name',
  ...cashierOnly,
  asyncHandler(async (req, res) => {
    const { customerName } = z.object({ customerName: z.string().trim().min(2).max(40) }).parse(req.body);
    const restaurantId = rid(req);
    const order = await prisma.order.findFirst({ where: { id: String(req.params.orderId), restaurantId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    if (order.type !== 'TAKEAWAY') {
      throw new AppError(400, 'NOT_TAKEAWAY', 'Le nom ne se saisit que pour une commande à emporter');
    }
    if (order.status === 'CANCELLED' || order.status === 'SERVED') {
      throw new AppError(409, 'ORDER_CLOSED', 'Cette commande est déjà terminée');
    }
    await prisma.order.update({ where: { id: order.id }, data: { customerName } });
    void emitOrderUpdated(order.id);
    res.json({ ok: true });
  }),
);

// ================= Remboursement (gérant) =================
cashierRouter.post(
  '/orders/:orderId/refund',
  ...canManage,
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
    const restaurantId = rid(req);
    const orderId = String(req.params.orderId);

    const result = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);

      const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
      if (order.paymentStatus === 'REFUNDED') return { unchanged: true };
      if (order.paymentStatus !== 'PAID') {
        throw new AppError(409, 'NOT_PAID', 'Cette commande n’a pas été payée');
      }

      const payment = await tx.payment.findFirst({
        where: { orderId: order.id, status: 'PAID', method: { in: ['CASH', 'MOBILE_MONEY'] } },
      });
      if (!payment) throw new AppError(409, 'NOT_PAID', 'Aucun paiement à rembourser');

      // Espèces : l'argent sort de la caisse du caissier qui avait encaissé, si elle est encore ouverte ;
      // sinon, de la caisse ouverte du gérant. Mobile Money : rien ne sort du tiroir-caisse, le gérant
      // rend l'argent au client avec son téléphone et le site enregistre le remboursement.
      const isCash = payment.method === 'CASH';
      const origin =
        isCash && payment.cashSessionId
          ? await tx.cashSession.findUnique({ where: { id: payment.cashSessionId } })
          : null;
      const session = !isCash
        ? null
        : origin && origin.status === 'OPEN'
          ? origin
          : await getOpenSession(tx, restaurantId, uid(req));
      if (isCash && !session) {
        throw new AppError(
          409,
          'NO_OPEN_SESSION',
          'Ouvrez votre caisse : le remboursement doit sortir d’une caisse ouverte',
        );
      }

      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'PAID' },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          refundedById: uid(req),
          refundedReason: reason,
          refundSessionId: session?.id ?? null,
        },
      });
      if (updated.count === 0) {
        throw new AppError(409, 'ORDER_CHANGED', 'Cette commande vient d’être modifiée');
      }

      // Commande encore en cours : le remboursement l'annule aussi
      const cancel = ACTIVE.includes(order.status);
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'REFUNDED',
          ...(cancel ? { status: 'CANCELLED', cancelledReason: reason } : {}),
        },
      });

      // Commande annulée par le remboursement : le stock déjà déduit est remis
      if (cancel) await restoreStockForOrder(tx, order.id);

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'PAYMENT_REFUNDED',
          entity: 'Payment',
          entityId: payment.id,
          details: {
            orderNumber: order.number,
            amountFcfa: payment.amountFcfa,
            receiptNumber: payment.receiptNumber,
            reason,
            orderCancelled: cancel,
            method: payment.method,
            refundedFromSessionId: session?.id ?? null,
          },
        },
      });
      return { unchanged: false };
    });

    if (!result.unchanged) void emitOrderUpdated(orderId);
    const fresh = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    });
    res.json({ order: presentOrder(fresh), unchanged: result.unchanged });
  }),
);

// ================= Reçu =================
cashierRouter.get(
  '/orders/:orderId/receipt',
  ...canCash,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.orderId), restaurantId: rid(req) },
      include: orderInclude,
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');

    const payment = await prisma.payment.findFirst({
      where: { orderId: order.id, confirmedAt: { not: null } },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!payment) {
      throw new AppError(409, 'NOT_PAID', 'Aucun paiement confirmé pour cette commande');
    }
    const cashier = payment.confirmedById
      ? await prisma.user.findUnique({
          where: { id: payment.confirmedById },
          select: { fullName: true },
        })
      : null;

    const view = presentOrder(order);
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
        cashierName: cashier?.fullName ?? null,
      },
    });
  }),
);