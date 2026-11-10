import { Router, type Request } from 'express';
import { z } from 'zod';
import type { MemberRole, QrType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { audit } from '../../lib/audit';
import { authenticate, requireRestaurantRole } from '../../middleware/auth';
import { newQrToken, qrUrl, qrPng } from '../../lib/qr';
import { buildQrPdf } from '../../lib/qrPdf';

export const tablesRouter = Router({ mergeParams: true });

const READ: MemberRole[] = ['MANAGER', 'CASHIER', 'COOK', 'WAITER'];
const canRead = [authenticate, requireRestaurantRole(...READ)];
const canManage = [authenticate, requireRestaurantRole('MANAGER')];

// Restaurant déjà vérifié par le middleware (jamais celui du corps de la requête)
const rid = (req: Request) => req.membership!.restaurantId;

// ---------- Recherches limitées au restaurant ----------
async function findTable(id: string, restaurantId: string) {
  const table = await prisma.restaurantTable.findFirst({ where: { id, restaurantId } });
  if (!table) throw new AppError(404, 'NOT_FOUND', 'Table introuvable');
  return table;
}

async function findQr(id: string, restaurantId: string) {
  const qr = await prisma.qrCode.findFirst({
    where: { id, restaurantId },
    include: { table: { select: { label: true } } },
  });
  if (!qr) throw new AppError(404, 'NOT_FOUND', 'QR code introuvable');
  return qr;
}

async function createQr(restaurantId: string, type: QrType, tableId: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.qrCode.findFirst({
      where: { restaurantId, type, tableId, isActive: true },
    });
    if (existing) {
      throw new AppError(
        409,
        'QR_ALREADY_EXISTS',
        'Un QR code actif existe déjà : utilisez le remplacement',
      );
    }
    return tx.qrCode.create({ data: { restaurantId, type, tableId, token: newQrToken() } });
  });
}

const present = (qr: {
  id: string;
  type: string;
  tableId: string | null;
  token: string;
  isActive: boolean;
  createdAt: Date;
  revokedAt: Date | null;
  table?: { label: string } | null;
}) => ({
  id: qr.id,
  type: qr.type,
  tableId: qr.tableId,
  tableLabel: qr.table?.label ?? null,
  token: qr.token,
  url: qrUrl(qr.token),
  isActive: qr.isActive,
  createdAt: qr.createdAt,
  revokedAt: qr.revokedAt,
});

// ---------- Tables ----------
const tableSchema = z.object({
  label: z.string().trim().min(1).max(30),
  seats: z.number().int().min(1).max(50).optional(),
});
const tableUpdateSchema = tableSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie' });

tablesRouter.get(
  '/tables',
  ...canRead,
  asyncHandler(async (req, res) => {
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId: rid(req) },
      include: { qrCodes: { where: { isActive: true }, select: { id: true } } },
    });
    const sorted = tables
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }))
      .map(({ qrCodes, ...table }) => ({ ...table, hasActiveQr: qrCodes.length > 0 }));
    res.json({ tables: sorted });
  }),
);

tablesRouter.post(
  '/tables',
  ...canManage,
  asyncHandler(async (req, res) => {
    const data = tableSchema.parse(req.body);
    const table = await prisma.restaurantTable.create({
      data: { ...data, restaurantId: rid(req) },
    });
    res.status(201).json({ table });
  }),
);

tablesRouter.patch(
  '/tables/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const table = await findTable(String(req.params.id), rid(req));
    const data = tableUpdateSchema.parse(req.body);
    const updated = await prisma.restaurantTable.update({ where: { id: table.id }, data });
    res.json({ table: updated });
  }),
);

tablesRouter.delete(
  '/tables/:id',
  ...canManage,
  asyncHandler(async (req, res) => {
    const table = await findTable(String(req.params.id), rid(req));
    const used = await prisma.order.count({ where: { tableId: table.id } });
    if (used > 0) {
      throw new AppError(
        409,
        'TABLE_HAS_ORDERS',
        'Cette table a des commandes : désactivez-la plutôt que de la supprimer',
      );
    }
    await prisma.$transaction([
      prisma.qrCode.deleteMany({ where: { tableId: table.id } }),
      prisma.restaurantTable.delete({ where: { id: table.id } }),
    ]);
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'TABLE_DELETED',
      entity: 'RestaurantTable',
      entityId: table.id,
      details: { label: table.label },
    });
    res.status(204).end();
  }),
);

// ---------- QR codes ----------
tablesRouter.post(
  '/tables/:tableId/qr',
  ...canManage,
  asyncHandler(async (req, res) => {
    const table = await findTable(String(req.params.tableId), rid(req));
    if (!table.isActive) throw new AppError(409, 'TABLE_INACTIVE', 'Cette table est désactivée');
    const qr = await createQr(rid(req), 'TABLE', table.id);
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'QR_CREATED',
      entity: 'QrCode',
      entityId: qr.id,
      details: { table: table.label },
    });
    res.status(201).json({ qrCode: present({ ...qr, table }) });
  }),
);

tablesRouter.post(
  '/qr-codes/takeaway',
  ...canManage,
  asyncHandler(async (req, res) => {
    const qr = await createQr(rid(req), 'TAKEAWAY', null);
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'QR_CREATED',
      entity: 'QrCode',
      entityId: qr.id,
      details: { type: 'TAKEAWAY' },
    });
    res.status(201).json({ qrCode: present(qr) });
  }),
);

tablesRouter.post(
  '/qr-codes/delivery',
  ...canManage,
  asyncHandler(async (req, res) => {
    const qr = await createQr(rid(req), 'DELIVERY', null);
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'QR_CREATED',
      entity: 'QrCode',
      entityId: qr.id,
      details: { type: 'DELIVERY' },
    });
    res.status(201).json({ qrCode: present(qr) });
  }),
);

tablesRouter.get(
  '/qr-codes',
  ...canManage,
  asyncHandler(async (req, res) => {
    const codes = await prisma.qrCode.findMany({
      where: { restaurantId: rid(req) },
      orderBy: { createdAt: 'desc' },
      include: { table: { select: { label: true } } },
    });
    res.json({ qrCodes: codes.map(present) });
  }),
);

// Doit rester AVANT les routes "/qr-codes/:id/..."
tablesRouter.get(
  '/qr-codes/print.pdf',
  ...canManage,
  asyncHandler(async (req, res) => {
    const [restaurant, codes] = await Promise.all([
      prisma.restaurant.findUniqueOrThrow({ where: { id: rid(req) } }),
      prisma.qrCode.findMany({
        where: { restaurantId: rid(req), isActive: true },
        include: { table: { select: { label: true, isActive: true } } },
      }),
    ]);

    const printable = codes
      .filter((c) => c.type !== 'TABLE' || c.table?.isActive)
      .sort((a, b) =>
        (a.table?.label ?? '\uffff').localeCompare(b.table?.label ?? '\uffff', 'fr', {
          numeric: true,
        }),
      );
    if (printable.length === 0) {
      throw new AppError(404, 'NO_QR', 'Aucun QR code actif à imprimer');
    }

    const pdf = await buildQrPdf(
      printable.map((c) => ({
        token: c.token,
        restaurantName: restaurant.name,
        title: c.table?.label ?? (c.type === 'DELIVERY' ? 'Livraison' : 'À emporter'),
      })),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="qr-codes.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  }),
);

tablesRouter.get(
  '/qr-codes/:id/image',
  ...canManage,
  asyncHandler(async (req, res) => {
    const qr = await findQr(String(req.params.id), rid(req));
    if (!qr.isActive) throw new AppError(409, 'QR_INACTIVE', 'Ce QR code est désactivé');
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(await qrPng(qr.token));
  }),
);

tablesRouter.post(
  '/qr-codes/:id/replace',
  ...canManage,
  asyncHandler(async (req, res) => {
    const old = await findQr(String(req.params.id), rid(req));
    if (!old.isActive) throw new AppError(409, 'QR_INACTIVE', 'Ce QR code est déjà désactivé');

    const created = await prisma.$transaction(async (tx) => {
      await tx.qrCode.update({
        where: { id: old.id },
        data: { isActive: false, revokedAt: new Date() },
      });
      return tx.qrCode.create({
        data: {
          restaurantId: old.restaurantId,
          type: old.type,
          tableId: old.tableId,
          token: newQrToken(),
        },
      });
    });

    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'QR_REPLACED',
      entity: 'QrCode',
      entityId: created.id,
      details: { replaced: old.id },
    });
    res.status(201).json({ qrCode: present({ ...created, table: old.table }) });
  }),
);

tablesRouter.post(
  '/qr-codes/:id/deactivate',
  ...canManage,
  asyncHandler(async (req, res) => {
    const qr = await findQr(String(req.params.id), rid(req));
    if (!qr.isActive) throw new AppError(409, 'QR_INACTIVE', 'Ce QR code est déjà désactivé');
    const updated = await prisma.qrCode.update({
      where: { id: qr.id },
      data: { isActive: false, revokedAt: new Date() },
    });
    await audit({
      userId: req.auth!.userId,
      restaurantId: rid(req),
      action: 'QR_DEACTIVATED',
      entity: 'QrCode',
      entityId: qr.id,
    });
    res.json({ qrCode: present({ ...updated, table: qr.table }) });
  }),
);