import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma, type Ingredient, type MemberRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';

export const stockRouter = Router({ mergeParams: true });

const READ: MemberRole[] = ['MANAGER', 'COOK'];
const canRead = [authenticate, requireRestaurantRole(...READ)];
const canManage = [authenticate, requireRestaurantRole('MANAGER')];

// Restaurant et utilisateur déjà vérifiés par les middlewares
const rid = (req: Request) => req.membership!.restaurantId;
const uid = (req: Request) => req.auth!.userId;
const D = (n: number | string) => new Prisma.Decimal(n);

type Db = Prisma.TransactionClient;
const lockRestaurant = (tx: Db, restaurantId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}::text))`;

// ---------- Validation ----------
const threeDecimals = (v: number) => Math.abs(Math.round(v * 1000) / 1000 - v) < 1e-9;
const qty = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(threeDecimals, { message: 'Trois décimales au maximum' });
const positiveQty = qty.refine((v) => v > 0, { message: 'La quantité doit être supérieure à 0' });
const nonEmpty = (v: object) => Object.keys(v).length > 0;

// ---------- Présentation ----------
const presentIngredient = (i: Ingredient & { category?: { name: string } | null }) => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  categoryId: i.categoryId,
  categoryName: i.category?.name ?? null,
  isActive: i.isActive,
  quantity: Number(i.quantity),
  alertThreshold: Number(i.alertThreshold),
  isLow: i.quantity.lte(i.alertThreshold),
  isOut: i.quantity.lte(0),
});

async function findIngredient(id: string, restaurantId: string) {
  const ingredient = await prisma.ingredient.findFirst({ where: { id, restaurantId } });
  if (!ingredient) throw new AppError(404, 'NOT_FOUND', 'Ingrédient introuvable');
  return ingredient;
}

// La catégorie doit appartenir à CE restaurant
async function findCategory(id: string, restaurantId: string) {
  const category = await prisma.category.findFirst({ where: { id, restaurantId } });
  if (!category) throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Catégorie introuvable');
  return category;
}

async function findProduct(id: string, restaurantId: string) {
  const product = await prisma.product.findFirst({ where: { id, restaurantId } });
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Produit introuvable');
  return product;
}

// ================= Ingrédients =================
stockRouter.get(
  '/ingredients',
  ...canRead,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        lowOnly: z.enum(['true', 'false']).default('false'),
        archived: z.enum(['true', 'false']).default('false'),
      })
      .parse(req.query);

    const rows = await prisma.ingredient.findMany({
      where: { restaurantId: rid(req), ...(q.archived === 'true' ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } } },
    });
    let list = rows.map(presentIngredient);
    if (q.lowOnly === 'true') list = list.filter((i) => i.isLow);

    res.json({
      ingredients: list,
      lowCount: rows.filter((r) => r.isActive && r.quantity.lte(r.alertThreshold)).length,
    });
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(20).default('unité'),
  categoryId: z.string().uuid(),
  quantity: qty.default(0),
  alertThreshold: qty.default(0),
});

stockRouter.post(
  '/ingredients',
  ...canManage,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const restaurantId = rid(req);
    await findCategory(body.categoryId, restaurantId);

    const created = await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          restaurantId,
          name: body.name,
          unit: body.unit,
          categoryId: body.categoryId,
          quantity: D(body.quantity),
          alertThreshold: D(body.alertThreshold),
        },
      });
      if (body.quantity > 0) {
        await tx.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: ingredient.id,
            createdById: uid(req),
            type: 'IN',
            quantity: D(body.quantity),
            reason: 'Stock initial',
          },
        });
      }
      return ingredient;
    });
    res.status(201).json({ ingredient: presentIngredient(created) });
  }),
);

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    unit: z.string().trim().min(1).max(20),
    categoryId: z.string().uuid(),
    alertThreshold: qty,
    isActive: z.boolean(),
  })
  .partial()
  .refine(nonEmpty, { message: 'Aucune modification fournie' });

stockRouter.patch(
  '/ingredients/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const ingredient = await findIngredient(String(req.params.id), rid(req));
    const body = updateSchema.parse(req.body);

    if (body.isActive === false) {
      const used = await prisma.recipe.count({ where: { ingredientId: ingredient.id } });
      if (used > 0) {
        throw new AppError(
          409,
          'IN_USE_IN_RECIPE',
          'Cet ingrédient est utilisé dans une recette : retirez-le des recettes avant de l’archiver',
        );
      }
    }

    if (body.categoryId) await findCategory(body.categoryId, rid(req));
    const { alertThreshold, ...rest } = body;
    const updated = await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: { ...rest, ...(alertThreshold !== undefined ? { alertThreshold: D(alertThreshold) } : {}) },
    });
    res.json({ ingredient: presentIngredient(updated) });
  }),
);

// ================= Entrées et pertes =================
const movementSchema = z.object({
  type: z.enum(['IN', 'LOSS']),
  quantity: positiveQty,
  reason: z.string().trim().min(3).max(200).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

stockRouter.post(
  '/ingredients/:id/movements',
  ...canManage,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const ingredient = await findIngredient(String(req.params.id), restaurantId);
    const body = movementSchema.parse(req.body);

    if (!ingredient.isActive) {
      throw new AppError(409, 'INGREDIENT_ARCHIVED', 'Cet ingrédient est archivé');
    }
    if (body.type === 'LOSS' && !body.reason) {
      throw new AppError(400, 'REASON_REQUIRED', 'Un motif est obligatoire pour une perte');
    }

    // Anti double envoi : une même clé ne crée qu'un seul mouvement
    const key = body.idempotencyKey ? `manual:${body.idempotencyKey}` : null;
    const duplicate = async () => {
      const fresh = await findIngredient(ingredient.id, restaurantId);
      res.json({ ingredient: presentIngredient(fresh), duplicate: true });
    };
    if (key) {
      const existing = await prisma.stockMovement.findUnique({
        where: { restaurantId_idempotencyKey: { restaurantId, idempotencyKey: key } },
      });
      if (existing) return duplicate();
    }

    const delta = body.type === 'IN' ? D(body.quantity) : D(body.quantity).neg();
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: ingredient.id,
            createdById: uid(req),
            type: body.type,
            quantity: delta,
            reason: body.reason ?? (body.type === 'IN' ? 'Entrée de stock' : null),
            idempotencyKey: key,
          },
        });
        return tx.ingredient.update({
          where: { id: ingredient.id },
          data: { quantity: { increment: delta } },
        });
      });

      if (body.type === 'LOSS') {
        await audit({
          userId: uid(req),
          restaurantId,
          action: 'STOCK_LOSS_RECORDED',
          entity: 'Ingredient',
          entityId: ingredient.id,
          details: { name: ingredient.name, quantity: body.quantity, reason: body.reason ?? null },
        });
      }
      res.status(201).json({ ingredient: presentIngredient(updated) });
    } catch (err) {
      if (key && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return duplicate();
      }
      throw err;
    }
  }),
);

stockRouter.get(
  '/stock/movements',
  ...canManage,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        ingredientId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const rows = await prisma.stockMovement.findMany({
      where: { restaurantId: rid(req), ...(q.ingredientId ? { ingredientId: q.ingredientId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: {
        ingredient: { select: { name: true, unit: true } },
        createdBy: { select: { fullName: true } },
        order: { select: { number: true } },
      },
    });
    res.json({
      movements: rows.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: Number(m.quantity),
        reason: m.reason,
        ingredientId: m.ingredientId,
        ingredientName: m.ingredient.name,
        unit: m.ingredient.unit,
        orderNumber: m.order?.number ?? null,
        byName: m.createdBy?.fullName ?? null,
        createdAt: m.createdAt,
      })),
    });
  }),
);

// ================= Recettes =================
const presentRecipeLines = (
  lines: { ingredientId: string; quantityPerUnit: Prisma.Decimal; ingredient: { name: string; unit: string } }[],
) =>
  lines.map((l) => ({
    ingredientId: l.ingredientId,
    ingredientName: l.ingredient.name,
    unit: l.ingredient.unit,
    quantityPerUnit: Number(l.quantityPerUnit),
  }));

stockRouter.get(
  '/products/:productId/recipe',
  ...canRead,
  asyncHandler(async (req, res) => {
    const product = await findProduct(String(req.params.productId), rid(req));
    const lines = await prisma.recipe.findMany({
      where: { productId: product.id },
      include: { ingredient: { select: { name: true, unit: true } } },
      orderBy: { ingredient: { name: 'asc' } },
    });
    res.json({ recipe: presentRecipeLines(lines) });
  }),
);

// Vue d'ensemble : les lignes de recette de tous les produits du restaurant
stockRouter.get(
  '/recipes',
  ...canRead,
  asyncHandler(async (req, res) => {
    const lines = await prisma.recipe.findMany({
      where: { restaurantId: rid(req) },
      include: { ingredient: { select: { name: true, unit: true } } },
    });
    const byProduct = new Map<string, typeof lines>();
    for (const l of lines) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l]);
    res.json({
      recipes: [...byProduct.entries()].map(([productId, ls]) => ({
        productId,
        lines: presentRecipeLines(ls),
      })),
    });
  }),
);

const recipeSchema = z.object({
  items: z
    .array(z.object({ ingredientId: z.string().uuid(), quantityPerUnit: positiveQty }))
    .max(50),
});

// Remplace toute la recette du produit (liste vide = recette supprimée)
stockRouter.put(
  '/products/:productId/recipe',
  ...canManage,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const product = await findProduct(String(req.params.productId), restaurantId);
    const body = recipeSchema.parse(req.body);

    const ids = body.items.map((i) => i.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(400, 'DUPLICATE_INGREDIENT', 'Un ingrédient ne peut figurer qu’une fois');
    }
    const found = await prisma.ingredient.count({
      where: { id: { in: ids }, restaurantId, isActive: true },
    });
    if (found !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Ingrédient introuvable');

    await prisma.$transaction([
      prisma.recipe.deleteMany({ where: { productId: product.id } }),
      prisma.recipe.createMany({
        data: body.items.map((i) => ({
          restaurantId,
          productId: product.id,
          ingredientId: i.ingredientId,
          quantityPerUnit: D(i.quantityPerUnit),
        })),
      }),
    ]);

    await audit({
      userId: uid(req),
      restaurantId,
      action: 'RECIPE_UPDATED',
      entity: 'Product',
      entityId: product.id,
      details: { name: product.name, lines: body.items.length },
    });

    const lines = await prisma.recipe.findMany({
      where: { productId: product.id },
      include: { ingredient: { select: { name: true, unit: true } } },
      orderBy: { ingredient: { name: 'asc' } },
    });
    res.json({ recipe: presentRecipeLines(lines) });
  }),
);

// ================= Inventaire =================
const inventorySchema = z.object({
  note: z.string().trim().min(3).max(200).optional(),
  counts: z
    .array(z.object({ ingredientId: z.string().uuid(), countedQuantity: qty }))
    .min(1)
    .max(200),
});

stockRouter.post(
  '/stock/inventory',
  ...canManage,
  asyncHandler(async (req, res) => {
    const restaurantId = rid(req);
    const body = inventorySchema.parse(req.body);

    const ids = body.counts.map((c) => c.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(400, 'DUPLICATE_INGREDIENT', 'Un ingrédient ne peut être compté qu’une fois');
    }

    const changes = await prisma.$transaction(async (tx) => {
      await lockRestaurant(tx, restaurantId);

      const owned = await tx.ingredient.findMany({
        where: { id: { in: ids }, restaurantId, isActive: true },
        select: { id: true, name: true, unit: true },
      });
      if (owned.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Ingrédient introuvable');
      const info = new Map(owned.map((o) => [o.id, o]));

      const done: {
        ingredientId: string;
        name: string;
        unit: string;
        before: number;
        after: number;
        difference: number;
      }[] = [];

      for (const c of [...body.counts].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
        // Le verrou de ligne empêche une commande de modifier ce stock pendant le calcul
        const rows = await tx.$queryRaw<{ q: string }[]>`
          SELECT quantity::text AS q FROM ingredients WHERE id = ${c.ingredientId} FOR UPDATE`;
        const before = D(rows[0].q);
        const after = D(c.countedQuantity);
        const diff = after.sub(before);
        if (diff.isZero()) continue;

        await tx.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: c.ingredientId,
            createdById: uid(req),
            type: 'ADJUSTMENT',
            quantity: diff,
            reason: body.note ?? 'Inventaire',
          },
        });
        await tx.ingredient.update({ where: { id: c.ingredientId }, data: { quantity: after } });

        const meta = info.get(c.ingredientId)!;
        done.push({
          ingredientId: c.ingredientId,
          name: meta.name,
          unit: meta.unit,
          before: Number(before),
          after: Number(after),
          difference: Number(diff),
        });
      }

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: uid(req),
          action: 'INVENTORY_DONE',
          entity: 'Ingredient',
          details: { counted: body.counts.length, adjusted: done.length, note: body.note ?? null },
        },
      });
      return done;
    });

    res.json({ changes });
  }),
);