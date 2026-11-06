import { Router, type Request } from 'express';
import { z } from 'zod';
import type { MemberRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';
import { uploadImage, assertImageContent, saveProductImage, removeImage } from '../../lib/upload';

// mergeParams : récupère :restaurantId défini dans app.ts
export const menuRouter = Router({ mergeParams: true });

const READ: MemberRole[] = ['MANAGER', 'CASHIER', 'COOK', 'WAITER'];
const MANAGE: MemberRole[] = ['MANAGER'];
const AVAILABILITY: MemberRole[] = ['MANAGER', 'COOK'];

const canRead = [authenticate, requireRestaurantRole(...READ)];
const canManage = [authenticate, requireRestaurantRole(...MANAGE)];
const canToggle = [authenticate, requireRestaurantRole(...AVAILABILITY)];

// Identifiant du restaurant déjà vérifié par le middleware (jamais celui du corps de la requête)
const rid = (req: Request) => req.membership!.restaurantId;

// ---------- Recherches limitées au restaurant ----------
async function findCategory(id: string, restaurantId: string) {
  const category = await prisma.category.findFirst({ where: { id, restaurantId } });
  if (!category) throw new AppError(404, 'NOT_FOUND', 'Catégorie introuvable');
  return category;
}

async function findProduct(id: string, restaurantId: string) {
  const product = await prisma.product.findFirst({ where: { id, restaurantId } });
  if (!product) throw new AppError(404, 'NOT_FOUND', 'Produit introuvable');
  return product;
}

async function findOption(id: string, restaurantId: string) {
  const option = await prisma.productOption.findFirst({ where: { id, restaurantId } });
  if (!option) throw new AppError(404, 'NOT_FOUND', 'Option introuvable');
  return option;
}

// ---------- Validation ----------
const nonEmpty = (v: object) => Object.keys(v).length > 0;
const noChange = { message: 'Aucune modification fournie' };

const price = z.number().int().min(1).max(10_000_000); // FCFA, sans décimales
const delta = z.number().int().min(0).max(1_000_000);
const sortOrder = z.number().int().min(0).max(1000);

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: sortOrder.optional(),
});
const categoryUpdateSchema = categorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(nonEmpty, noChange);

const productSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  priceFcfa: price,
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});
const productUpdateSchema = productSchema.partial().refine(nonEmpty, noChange);

const optionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceDeltaFcfa: delta.optional(),
  isActive: z.boolean().optional(),
});
const optionUpdateSchema = optionSchema.partial().refine(nonEmpty, noChange);

// ---------- Catégories ----------
menuRouter.get(
  '/categories',
  ...canRead,
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { restaurantId: rid(req) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    res.json({ categories });
  }),
);

menuRouter.post(
  '/categories',
  ...canManage,
  asyncHandler(async (req, res) => {
    const data = categorySchema.parse(req.body);
    const category = await prisma.category.create({ data: { ...data, restaurantId: rid(req) } });
    res.status(201).json({ category });
  }),
);

menuRouter.patch(
  '/categories/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const category = await findCategory(String(req.params.id), rid(req));
    const data = categoryUpdateSchema.parse(req.body);
    const updated = await prisma.category.update({ where: { id: category.id }, data });
    res.json({ category: updated });
  }),
);

menuRouter.delete(
  '/categories/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const category = await findCategory(String(req.params.id), rid(req));
    const count = await prisma.product.count({ where: { categoryId: category.id } });
    if (count > 0) {
      throw new AppError(409, 'CATEGORY_NOT_EMPTY', 'Cette catégorie contient encore des produits');
    }
    await prisma.category.delete({ where: { id: category.id } });
    res.status(204).end();
  }),
);

// ---------- Produits ----------
menuRouter.get(
  '/products',
  ...canRead,
  asyncHandler(async (req, res) => {
    const { categoryId } = z.object({ categoryId: z.string().uuid().optional() }).parse(req.query);
    const products = await prisma.product.findMany({
      where: { restaurantId: rid(req), ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { options: { orderBy: { name: 'asc' } } },
    });
    res.json({ products });
  }),
);

menuRouter.post(
  '/products',
  ...canManage,
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    await findCategory(data.categoryId, rid(req)); // la catégorie doit être celle de CE restaurant
    const product = await prisma.product.create({ data: { ...data, restaurantId: rid(req) } });
    res.status(201).json({ product });
  }),
);

menuRouter.patch(
  '/products/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const before = await findProduct(String(req.params.id), rid(req));
    const data = productUpdateSchema.parse(req.body);
    if (data.categoryId) await findCategory(data.categoryId, rid(req));

    const product = await prisma.product.update({ where: { id: before.id }, data });

    // Un changement de prix est un changement sensible : il est tracé
    if (data.priceFcfa !== undefined && data.priceFcfa !== before.priceFcfa) {
      await audit({
        userId: req.auth!.userId,
        restaurantId: rid(req),
        action: 'PRODUCT_PRICE_CHANGED',
        entity: 'Product',
        entityId: before.id,
        details: { from: before.priceFcfa, to: data.priceFcfa },
      });
    }
    res.json({ product });
  }),
);

// Le cuisinier peut signaler une rupture sans pouvoir modifier le reste
menuRouter.patch(
  '/products/:id/availability',
  ...canToggle,
  asyncHandler(async (req, res) => {
    const product = await findProduct(String(req.params.id), rid(req));
    const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { isAvailable },
    });
    res.json({ product: updated });
  }),
);

menuRouter.post(
  '/products/:id/image',
  ...canManage,
  uploadImage,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, 'NO_FILE', 'Aucune image envoyée (champ "image")');
    await assertImageContent(file.buffer);
    const product = await findProduct(String(req.params.id), rid(req));
    const blob = await saveProductImage(rid(req), file.buffer, file.mimetype);

    try {
      const updated = await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: blob.url },
      });
      await removeImage(product.imageUrl); // supprime l'ancienne photo après la mise à jour
      res.json({ product: updated });
    } catch (err) {
      await removeImage(blob.url); // évite une image orpheline si la base refuse la mise à jour
      throw err;
    }
  }),
);

menuRouter.delete(
  '/products/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const product = await findProduct(String(req.params.id), rid(req));
    const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
    if (ordered > 0) {
      throw new AppError(
        409,
        'PRODUCT_ALREADY_ORDERED',
        'Ce produit a déjà été commandé : marquez-le indisponible plutôt que de le supprimer',
      );
    }
    await prisma.$transaction([
      prisma.recipe.deleteMany({ where: { productId: product.id } }),
      prisma.productOption.deleteMany({ where: { productId: product.id } }),
      prisma.product.delete({ where: { id: product.id } }),
    ]);
    removeImage(product.imageUrl);
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'PRODUCT_DELETED',
      entity: 'Product',
      entityId: product.id,
      details: { name: product.name },
    });
    res.status(204).end();
  }),
);

// ---------- Options (suppléments) ----------
menuRouter.post(
  '/products/:productId/options',
  ...canManage,
  asyncHandler(async (req, res) => {
    const product = await findProduct(String(req.params.productId), rid(req));
    const data = optionSchema.parse(req.body);
    const option = await prisma.productOption.create({
      data: { ...data, productId: product.id, restaurantId: rid(req) },
    });
    res.status(201).json({ option });
  }),
);

menuRouter.patch(
  '/options/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const option = await findOption(String(req.params.id), rid(req));
    const data = optionUpdateSchema.parse(req.body);
    const updated = await prisma.productOption.update({ where: { id: option.id }, data });
    res.json({ option: updated });
  }),
);

menuRouter.delete(
  '/options/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const option = await findOption(String(req.params.id), rid(req));
    await prisma.productOption.delete({ where: { id: option.id } });
    res.status(204).end();
  }),
);