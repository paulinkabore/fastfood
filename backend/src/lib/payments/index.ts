import { env } from '../../config/env';
import { mockProvider } from './mock';
import type { PaymentProvider } from './types';

// Un seul endroit choisit le prestataire, d'après PAYMENT_PROVIDER dans .env
export function getProvider(): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
      return mockProvider;
  }
}