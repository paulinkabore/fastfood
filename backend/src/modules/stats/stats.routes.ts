import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const statsRouter = Router({ mergeParams: true });

const canView = [authenticate, requireRestaurantRole('MANAGER')];

// Restaurant déjà vérifié par le middleware
const rid = (req: Request) => req.membership!.restaurantId;

const DAY = 86_400_000;
const MAX_DAYS = 92;
const MAX_ROWS = 50_000;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)');

function parseDay(s: string): number {
  const t = Date.parse(`${s}T00:00:00.000Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Date invalide');
  }
  return t;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Période [from, to] inclusive, en jours UTC
function parseRange(query: unknown) {
  const q = z.object({ from: dateString.optional(), to: dateString.optional() }).parse(query);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const to = q.to ? parseDay(q.to) : today;
  const from = q.from ? parseDay(q.from) : to - 6 * DAY;

  if (from > to) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La date de début doit précéder la date de fin');
  }
  const days = Math.round((to - from) / DAY) + 1;
  if (days > MAX_DAYS) {
    throw new AppError(400, 'RANGE_TOO_LARGE', `La période ne peut pas dépasser ${MAX_DAYS} jours`);
  }
  return {
    from,
    days,
    fromStr: iso(from),
    toStr: iso(to),
    start: new Date(from),
    end: new Date(to + DAY),
  };
}

// ================= Statistiques =================
statsRouter.get(
  '/stats',
  ...canView,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const r = parseRange(req.query);
    const inRange = { gte: r.start, lt: r.end };

    const [orders, collectedByMethod, refunded, itemGroups] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId, createdAt: inRange },
        select: { createdAt: true, status: true, paymentStatus: true, totalFcfa: true },
        take: MAX_ROWS + 1,
      }),
      prisma.payment.groupBy({
        by: ['method'],
        where: { restaurantId, status: 'PAID', confirmedAt: inRange },
        _sum: { amountFcfa: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { restaurantId, status: 'REFUNDED', refundedAt: inRange },
        _sum: { amountFcfa: true },
        _count: { _all: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName', 'unitPriceFcfa'],
        where: {
          restaurantId,
          order: { createdAt: inRange, status: { not: 'CANCELLED' }, paymentStatus: { not: 'REFUNDED' } },
        },
        _sum: { quantity: true },
      }),
    ]);

    if (orders.length > MAX_ROWS) {
      throw new AppError(413, 'RANGE_TOO_LARGE', 'Trop de commandes sur cette période : réduisez-la');
    }

    // Commandes comptées : ni annulées, ni remboursées
    const counted = orders.filter((o) => o.status !== 'CANCELLED' && o.paymentStatus !== 'REFUNDED');
    const salesFcfa = counted.reduce((s, o) => s + o.totalFcfa, 0);
    const unpaid = counted.filter((o) => o.paymentStatus === 'PENDING');

    const byDay = Array.from({ length: r.days }, (_, i) => ({
      date: iso(r.from + i * DAY),
      orders: 0,
      salesFcfa: 0,
    }));
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, salesFcfa: 0 }));
    for (const o of counted) {
      const d = byDay[Math.floor((o.createdAt.getTime() - r.from) / DAY)];
      if (d) {
        d.orders += 1;
        d.salesFcfa += o.totalFcfa;
      }
      const h = byHour[o.createdAt.getUTCHours()];
      h.orders += 1;
      h.salesFcfa += o.totalFcfa;
    }

    // Produits les plus vendus : quantité et chiffre d'affaires exacts (prix figés dans la commande)
    const products = new Map<string, { name: string; quantity: number; revenueFcfa: number }>();
    for (const g of itemGroups) {
      const q = g._sum.quantity ?? 0;
      const cur = products.get(g.productId) ?? { name: g.productName, quantity: 0, revenueFcfa: 0 };
      cur.quantity += q;
      cur.revenueFcfa += q * g.unitPriceFcfa;
      products.set(g.productId, cur);
    }
    const topProducts = [...products.entries()]
      .map(([productId, p]) => ({ productId, ...p }))
      .sort((a, b) => b.quantity - a.quantity || b.revenueFcfa - a.revenueFcfa)
      .slice(0, 10);

    const paymentMethods = collectedByMethod.map((m) => ({
      method: m.method,
      amountFcfa: m._sum.amountFcfa ?? 0,
      count: m._count._all,
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      range: { from: r.fromStr, to: r.toStr, days: r.days },
      summary: {
        ordersCount: counted.length,
        salesFcfa,
        averageBasketFcfa: counted.length ? Math.round(salesFcfa / counted.length) : 0,
        unpaidFcfa: unpaid.reduce((s, o) => s + o.totalFcfa, 0),
        unpaidCount: unpaid.length,
        cancelledCount: orders.filter((o) => o.status === 'CANCELLED').length,
        collectedFcfa: paymentMethods.reduce((s, m) => s + m.amountFcfa, 0),
        collectedCount: paymentMethods.reduce((s, m) => s + m.count, 0),
        refundedFcfa: refunded._sum.amountFcfa ?? 0,
        refundedCount: refunded._count._all,
      },
      paymentMethods,
      byDay,
      byHour,
      topProducts,
    });
  }),
);

// ================= Export CSV =================
const TYPE_FR: Record<string, string> = { DINE_IN: 'Sur place', TAKEAWAY: 'À emporter', DELIVERY: 'Livraison' };
const STATUS_FR: Record<string, string> = {
  RECEIVED: 'Reçue',
  PREPARING: 'En préparation',
  READY: 'Prête',
  SERVED: 'Servie',
  CANCELLED: 'Annulée',
};
const PAY_FR: Record<string, string> = {
  PENDING: 'À payer',
  PAID: 'Payée',
  FAILED: 'Échec',
  REFUNDED: 'Remboursée',
};
const METHOD_FR: Record<string, string> = { CASH: 'Espèces', MOBILE_MONEY: 'Mobile Money', CARD: 'Carte' };

// Une cellule CSV : protégée contre l'injection de formules dans Excel
const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

statsRouter.get(
  '/stats/export.csv',
  ...canView,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const r = parseRange(req.query);

    const rows = await prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: r.start, lt: r.end } },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
      include: {
        table: { select: { label: true } },
        payments: { select: { method: true, status: true } },
      },
    });
    if (rows.length > MAX_ROWS) {
      throw new AppError(413, 'RANGE_TOO_LARGE', 'Trop de commandes sur cette période : réduisez-la');
    }

    const header = [
      'Date',
      'Heure',
      'N° commande',
      'Type',
      'Table',
      'Statut',
      'Paiement',
      'Mode de paiement',
      'Total FCFA',
    ];
    const lines = rows.map((o) => {
      const iso8601 = o.createdAt.toISOString();
      const paid = o.payments.find((p) => p.status === 'PAID' || p.status === 'REFUNDED');
      return [
        iso8601.slice(0, 10),
        iso8601.slice(11, 16),
        o.number,
        TYPE_FR[o.type] ?? o.type,
        o.table?.label ?? '',
        STATUS_FR[o.status] ?? o.status,
        PAY_FR[o.paymentStatus] ?? o.paymentStatus,
        paid ? (METHOD_FR[paid.method] ?? paid.method) : '',
        o.totalFcfa,
      ]
        .map(cell)
        .join(';');
    });

    await audit({
      userId: req.auth!.userId,
      restaurantId,
      action: 'STATS_EXPORTED',
      entity: 'Restaurant',
      entityId: restaurantId,
      details: { from: r.fromStr, to: r.toStr, rows: rows.length },
    });

    // Le préfixe \uFEFF permet à Excel d'afficher correctement les accents
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commandes-${r.fromStr}_${r.toStr}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send('\uFEFF' + [header.map(cell).join(';'), ...lines].join('\r\n'));
  }),
);