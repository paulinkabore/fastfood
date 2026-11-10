import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';

export const publicRouter = Router();

publicRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Trop de requêtes, réessayez dans une minute' },
    },
  }),
);

publicRouter.get(
  '/qr/:token',
  asyncHandler(async (req, res) => {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      throw new AppError(404, 'NOT_FOUND', 'QR code inconnu');
    }

    const qr = await prisma.qrCode.findUnique({
      where: { token },
      include: { restaurant: true, table: true },
    });
    if (!qr) throw new AppError(404, 'NOT_FOUND', 'QR code inconnu');

    // QR désactivé, remplacé, restaurant ou table désactivé : plus de nouvelle commande
    if (!qr.isActive || !qr.restaurant.isActive || (qr.table && !qr.table.isActive)) {
      throw new AppError(410, 'QR_INACTIVE', "Ce QR code n'est plus actif");
    }

    const categories = await prisma.category.findMany({
      where: { restaurantId: qr.restaurantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        products: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            priceFcfa: true,
            imageUrl: true,
            allergens: true,
            isAvailable: true,
            options: {
              where: { isActive: true },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, priceDeltaFcfa: true },
            },
          },
        },
      },
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      restaurant: { name: qr.restaurant.name, slug: qr.restaurant.slug },
      orderType: qr.type === 'TABLE' ? 'DINE_IN' : qr.type === 'DELIVERY' ? 'DELIVERY' : 'TAKEAWAY',
      table: qr.table ? { label: qr.table.label } : null,
      menu: categories.filter((c) => c.products.length > 0),
    });
  }),
);