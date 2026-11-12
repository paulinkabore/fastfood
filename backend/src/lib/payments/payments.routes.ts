import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitHandler } from './security';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { asyncHandler } from '../../lib/asyncHandler';
import { getProvider } from '../../lib/payments';
import { settleByReference } from '../../lib/payments/settle';

// ================= Côté client (sans compte) =================
export const publicPaymentsRouter = Router();

const clientLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler('TOO_MANY_REQUESTS', 'Trop de tentatives, réessayez dans quelques minutes'),
});

const uuid = z.string().uuid();

publicPaymentsRouter.post(
  '/orders/:orderId/pay/mobile-money',
  clientLimiter,
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.orderId);
    if (!uuid.safeParse(orderId).success) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    const provider = getProvider();

    // Un seul démarrage de paiement à la fois pour une même commande
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}::text))`;

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
      if (order.status === 'CANCELLED') throw new AppError(409, 'ORDER_CANCELLED', 'Cette commande est annulée');
      if (order.paymentStatus === 'PAID') throw new AppError(409, 'ALREADY_PAID', 'Cette commande est déjà payée');
      if (order.paymentStatus === 'REFUNDED') throw new AppError(409, 'ORDER_REFUNDED', 'Cette commande a été remboursée');

      const existing = await tx.payment.findFirst({
        where: {
          orderId,
          method: 'MOBILE_MONEY',
          provider: provider.name,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      });
      if (existing) {
        if (!existing.checkoutUrl) {
          throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Paiement en cours d’initialisation, réessayez');
        }
        return { payment: existing, order, created: false };
      }

      const payment = await tx.payment.create({
        data: {
          restaurantId: order.restaurantId,
          orderId,
          method: 'MOBILE_MONEY',
          status: 'PENDING',
          amountFcfa: order.totalFcfa, // toujours le total de la base, jamais un montant envoyé par le client
          provider: provider.name,
          providerReference: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      return { payment, order, created: true };
    });

    if (!result.created) {
      res.json({ checkoutUrl: result.payment.checkoutUrl, reused: true });
      return;
    }

    try {
      const { checkoutUrl } = await provider.initiate({
        reference: result.payment.providerReference!,
        amountFcfa: result.payment.amountFcfa,
        description: `Commande #${result.order.number}`,
        returnUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/commande/${orderId}?paiement=retour`,
      });
      await prisma.payment.update({ where: { id: result.payment.id }, data: { checkoutUrl } });
      res.status(201).json({ checkoutUrl, reused: false });
    } catch {
      await prisma.payment.update({
        where: { id: result.payment.id },
        data: { status: 'FAILED', failureReason: 'Initialisation impossible' },
      });
      throw new AppError(
        502,
        'PROVIDER_UNAVAILABLE',
        'Le paiement Mobile Money est momentanément indisponible',
      );
    }
  }),
);

// Au retour du client : le SERVEUR demande l'état au prestataire (rattrape une notification en retard)
publicPaymentsRouter.post(
  '/orders/:orderId/pay/mobile-money/refresh',
  clientLimiter,
  asyncHandler(async (req, res) => {
    const orderId = String(req.params.orderId);
    if (!uuid.safeParse(orderId).success) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    const provider = getProvider();

    const pending = await prisma.payment.findMany({
      where: { orderId, method: 'MOBILE_MONEY', provider: provider.name, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    let outcome: string = 'NONE';
    for (const p of pending) {
      if (p.providerReference) outcome = await settleByReference(provider, p.providerReference);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Commande introuvable');
    res.json({ paymentStatus: order.paymentStatus, outcome });
  }),
);

// ================= Notifications du prestataire (webhook) =================
export const webhooksRouter = Router();

webhooksRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('TOO_MANY_REQUESTS', 'Trop de requêtes'),
  }),
);

webhooksRouter.post(
  '/webhooks/payments/:provider',
  asyncHandler(async (req, res) => {
    const provider = getProvider();
    if (String(req.params.provider) !== provider.name) {
      throw new AppError(404, 'NOT_FOUND', 'Prestataire inconnu');
    }

    // 1. Signature : sans signature valide, rien n'est lu ni enregistré
    const evt = provider.parseWebhook(req.rawBody ?? Buffer.alloc(0), req.headers);
    if (!evt) throw new AppError(401, 'INVALID_SIGNATURE', 'Signature invalide');

    // 2. Idempotence : une notification déjà traitée est ignorée
    const key = { provider: provider.name, eventId: evt.eventId };
    let event = await prisma.paymentEvent.findUnique({ where: { provider_eventId: key } });
    if (event?.processedAt) {
      res.json({ ok: true, duplicate: true });
      return;
    }
    if (!event) {
      try {
        event = await prisma.paymentEvent.create({
          data: { ...key, reference: evt.reference, payload: { eventId: evt.eventId, reference: evt.reference } },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          res.json({ ok: true, duplicate: true });
          return;
        }
        throw err;
      }
    }

    // 3. Vérification auprès du prestataire, puis mise à jour
    const outcome = await settleByReference(provider, evt.reference);
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: { outcome, processedAt: new Date() },
    });
    res.json({ ok: true, outcome });
  }),
);