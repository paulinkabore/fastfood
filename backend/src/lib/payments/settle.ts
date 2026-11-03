import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { emitOrderUpdated } from '../realtime';
import type { PaymentProvider } from './types';

export type SettleOutcome =
  | 'PAID'
  | 'FAILED'
  | 'STILL_PENDING'
  | 'ALREADY_SETTLED'
  | 'UNKNOWN_REFERENCE'
  | 'NOT_FOUND_AT_PROVIDER'
  | 'AMOUNT_MISMATCH';

// Même verrou que la caisse : numéros de reçu uniques, sans trou
const lockRestaurant = (tx: Prisma.TransactionClient, restaurantId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}::text))`;

export async function settleByReference(
  provider: PaymentProvider,
  reference: string,
): Promise<SettleOutcome> {
  const payment = await prisma.payment.findFirst({
    where: { provider: provider.name, providerReference: reference, method: 'MOBILE_MONEY' },
  });
  if (!payment) return 'UNKNOWN_REFERENCE';
  if (payment.status === 'PAID' || payment.status === 'REFUNDED') return 'ALREADY_SETTLED';

  // On ne croit ni le client ni le contenu de la notification : on interroge le prestataire
  const remote = await provider.verify(reference);
  if (!remote) return 'NOT_FOUND_AT_PROVIDER';
  if (remote.status === 'PENDING') return 'STILL_PENDING';

  if (remote.status === 'FAILED') {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: 'Paiement refusé ou abandonné' },
    });
    return 'FAILED';
  }

  // Le montant payé doit être exactement le total de la commande
  if (remote.amountFcfa !== payment.amountFcfa) {
    await prisma.auditLog.create({
      data: {
        restaurantId: payment.restaurantId,
        action: 'PAYMENT_AMOUNT_MISMATCH',
        entity: 'Payment',
        entityId: payment.id,
        details: { expected: payment.amountFcfa, received: remote.amountFcfa, reference },
      },
    });
    return 'AMOUNT_MISMATCH';
  }

  const settled = await prisma.$transaction(async (tx) => {
    await lockRestaurant(tx, payment.restaurantId);
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (fresh.status === 'PAID') return false; // déjà traité par une autre notification

    const order = await tx.order.findUniqueOrThrow({ where: { id: fresh.orderId } });
    const last = await tx.payment.aggregate({
      where: { restaurantId: fresh.restaurantId },
      _max: { receiptNumber: true },
    });

    await tx.payment.update({
      where: { id: fresh.id },
      data: {
        status: 'PAID',
        confirmedAt: new Date(),
        receiptNumber: (last._max.receiptNumber ?? 0) + 1,
        failureReason: null,
      },
    });

    // Commande déjà payée autrement, remboursée ou annulée : l'argent est bien reçu,
    // mais le gérant doit vérifier (remboursement éventuel auprès du prestataire)
    const needsReview = order.paymentStatus !== 'PENDING' || order.status === 'CANCELLED';
    if (!needsReview) {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
    }

    await tx.auditLog.create({
      data: {
        restaurantId: fresh.restaurantId,
        action: needsReview ? 'PAYMENT_NEEDS_REVIEW' : 'PAYMENT_MOBILE_MONEY_CONFIRMED',
        entity: 'Payment',
        entityId: fresh.id,
        details: {
          orderNumber: order.number,
          amountFcfa: fresh.amountFcfa,
          provider: provider.name,
          reference,
          orderPaymentStatus: order.paymentStatus,
          orderStatus: order.status,
        },
      },
    });
    return true;
  });

  if (settled) void emitOrderUpdated(payment.orderId);
  return 'PAID';
}