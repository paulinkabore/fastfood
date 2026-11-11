import { describe, expect, it } from 'vitest';
import { awaitingValidation, ussdCode, ussdLink } from './mobileMoney';

describe('code Mobile Money', () => {
  it('compose le code avec le numéro marchand et le montant', () => {
    expect(ussdCode('74639266', 3500)).toBe('*144*10*74639266*3500#');
  });

  it('encode le dièse pour que le lien s’ouvre dans le composeur', () => {
    expect(ussdLink('74639266', 3500)).toBe('tel:*144*10*74639266*3500%23');
  });
});

describe('commande en attente de validation du caissier', () => {
  const base = { status: 'RECEIVED', paymentStatus: 'PENDING', sentToKitchenAt: null };

  it('est reconnue tant que rien n’est parti en cuisine', () => {
    expect(awaitingValidation(base)).toBe(true);
  });

  it('ne l’est plus une fois envoyée en cuisine', () => {
    expect(awaitingValidation({ ...base, sentToKitchenAt: '2026-11-11T10:00:00Z' })).toBe(false);
  });

  it('ne l’est pas si le paiement est validé ou la commande annulée', () => {
    expect(awaitingValidation({ ...base, paymentStatus: 'PAID' })).toBe(false);
    expect(awaitingValidation({ ...base, status: 'CANCELLED' })).toBe(false);
  });
});
