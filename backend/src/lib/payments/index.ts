import { env } from '../../config/env';
import { AppError } from '../errors';
import { mockProvider } from './mock';
import type { PaymentProvider } from './types';

// Un seul endroit choisit le prestataire, d'après PAYMENT_PROVIDER dans .env
export function getProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
      return mockProvider;
    default:
      throw new AppError(503, 'MOBILE_MONEY_DISABLED', "Le paiement Mobile Money n'est pas disponible");
  }
}