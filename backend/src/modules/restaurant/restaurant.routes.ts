import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const restaurantRouter = Router({ mergeParams: true });

// Informations de base du restaurant, visibles par tout le personnel de CE restaurant
restaurantRouter.get(
  '/info',
  authenticate,
  requireRestaurantRole('MANAGER', 'CASHIER', 'COOK', 'WAITER'),
  asyncHandler(async (req, res) => {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: req.membership!.restaurantId },
      select: { name: true, address: true, phone: true },
    });
    res.json({ restaurant });
  }),
);