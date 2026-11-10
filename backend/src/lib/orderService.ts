import { Prisma, type OrderType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { AppError } from './errors';
import { orderInclude } from './orderView';

export const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
  optionIds: z.array(z.string().uuid()).max(10).default([]),
  notes: z.string().trim().max(200).optional(),
});

export type NewOrderInput = {
  restaurantId: string;
  type: OrderType;
  tableId: string | null;
  qrCodeId: string | null;
  createdById: string | null;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  idempotencyKey: string;
  items: z.infer<typeof orderItemSchema>[];
};

export const findOrderByKey = (restaurantId: string, idempotencyKey: string) =>
  prisma.order.findUnique({
    where: { restaurantId_idempotencyKey: { restaurantId, idempotencyKey } },
    include: orderInclude,
  });

export async function createOrder(input: NewOrderInput) {
  const { restaurantId } = input;

  // Anti double envoi : même clé = même commande
  const existing = await findOrderByKey(restaurantId, input.idempotencyKey);
  if (existing) return { order: existing, duplicate: true };

  // Produits chargés UNIQUEMENT dans ce restaurant
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId, category: { isActive: true } },
    include: { options: { where: { isActive: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Les prix viennent de la base, jamais de l'appareil qui envoie la commande
  let total = 0;
  const lines = input.items.map((item) => {
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
    const unitPriceFcfa = product.priceFcfa + options.reduce((sum, o) => sum + o.priceDeltaFcfa, 0);
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
            type: input.type,
            tableId: input.tableId,
            qrCodeId: input.qrCodeId,
            createdById: input.createdById,
            notes: input.notes,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            totalFcfa: total,
            idempotencyKey: input.idempotencyKey,
            sentToKitchenAt: new Date(), // toute commande part en cuisine tout de suite
            items: { create: lines },
            // Paiement en espèces : en attente jusqu'à l'encaissement
            payments: { create: { restaurantId, method: 'CASH', amountFcfa: total } },
          },
          include: orderInclude,
        });
      });
      return { order, duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Deux envois simultanés avec la même clé : on renvoie la commande gagnante
        const again = await findOrderByKey(restaurantId, input.idempotencyKey);
        if (again) return { order: again, duplicate: true };
        continue; // numéro déjà pris par une autre commande : nouvel essai
      }
      throw err;
    }
  }
  throw new AppError(503, 'ORDER_BUSY', 'Le restaurant reçoit beaucoup de commandes, réessayez');
}