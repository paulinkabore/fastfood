import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

// Convention : StockMovement.quantity est le CHANGEMENT de stock, avec son signe
// (négatif pour une sortie ou une perte, positif pour une entrée ou une correction).

// Déstocke une commande : une seule fois, au passage « En préparation ».
export async function deductStockForOrder(tx: Tx, orderId: string) {
  // Verrou d'unicité : un seul appelant peut « réclamer » le déstockage
  const claimed = await tx.order.updateMany({
    where: { id: orderId, stockDeductedAt: null },
    data: { stockDeductedAt: new Date() },
  });
  if (claimed.count === 0) return { deducted: false, lines: 0 };

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  const recipes = await tx.recipe.findMany({
    where: {
      restaurantId: order.restaurantId,
      productId: { in: [...new Set(order.items.map((i) => i.productId))] },
    },
  });

  // Besoin total par ingrédient
  const needs = new Map<string, Prisma.Decimal>();
  for (const item of order.items) {
    for (const r of recipes.filter((x) => x.productId === item.productId)) {
      const q = new Prisma.Decimal(r.quantityPerUnit).mul(item.quantity);
      needs.set(r.ingredientId, (needs.get(r.ingredientId) ?? new Prisma.Decimal(0)).add(q));
    }
  }

  // Ordre fixe : évite les blocages entre deux commandes traitées en même temps
  const lines = [...needs.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [ingredientId, qty] of lines) {
    await tx.stockMovement.create({
      data: {
        restaurantId: order.restaurantId,
        ingredientId,
        orderId,
        type: 'OUT',
        quantity: qty.neg(),
        reason: `Commande #${order.number}`,
        idempotencyKey: `order:${orderId}:out:${ingredientId}`,
      },
    });
    await tx.ingredient.update({
      where: { id: ingredientId },
      data: { quantity: { decrement: qty } },
    });
  }
  return { deducted: true, lines: lines.length };
}

// Annulation d'une commande déjà déstockée : le stock est remis, une seule fois.
export async function restoreStockForOrder(tx: Tx, orderId: string) {
  const claimed = await tx.order.updateMany({
    where: { id: orderId, stockDeductedAt: { not: null } },
    data: { stockDeductedAt: null },
  });
  if (claimed.count === 0) return { restored: false, lines: 0 };

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true },
  });
  const outs = await tx.stockMovement.findMany({
    where: { orderId, type: 'OUT' },
    orderBy: { ingredientId: 'asc' },
  });

  for (const m of outs) {
    const back = new Prisma.Decimal(m.quantity).neg();
    await tx.stockMovement.create({
      data: {
        restaurantId: m.restaurantId,
        ingredientId: m.ingredientId,
        orderId,
        type: 'CORRECTION',
        quantity: back,
        reason: `Annulation commande #${order.number}`,
        idempotencyKey: `order:${orderId}:restore:${m.ingredientId}`,
      },
    });
    await tx.ingredient.update({
      where: { id: m.ingredientId },
      data: { quantity: { increment: back } },
    });
  }
  return { restored: true, lines: outs.length };
}