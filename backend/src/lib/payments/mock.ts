import crypto from 'crypto';
import { env } from '../../config/env';
import type { PaymentProvider, ProviderStatus } from './types';

type Entry = { amountFcfa: number; status: ProviderStatus; returnUrl: string; description: string };
const store = new Map<string, Entry>();

export const mockEntry = (reference: string) => store.get(reference);

export const mockSetStatus = (reference: string, status: ProviderStatus) => {
  const entry = store.get(reference);
  if (entry) entry.status = status;
};

// Signature HMAC du corps de la notification, avec le secret du fichier .env
export const signMockBody = (body: string) =>
  crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(body).digest('hex');

export const mockProvider: PaymentProvider = {
  name: 'mock',

  async initiate({ reference, amountFcfa, description, returnUrl }) {
    store.set(reference, { amountFcfa, status: 'PENDING', returnUrl, description });
    return {
      checkoutUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/v1/dev/mock-pay/${reference}`,
    };
  },

  async verify(reference) {
    const entry = store.get(reference);
    return entry ? { status: entry.status, amountFcfa: entry.amountFcfa } : null;
  },

  parseWebhook(rawBody, headers) {
    const header = headers['x-mock-signature'];
    const given = Array.isArray(header) ? header[0] : header;
    if (!given) return null;

    const body = rawBody.toString('utf8');
    const a = Buffer.from(given, 'utf8');
    const b = Buffer.from(signMockBody(body), 'utf8');
    // Comparaison en temps constant : ne révèle rien sur la signature attendue
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
      const data = JSON.parse(body);
      if (typeof data.eventId === 'string' && typeof data.reference === 'string') {
        return { eventId: data.eventId, reference: data.reference };
      }
    } catch {
      /* corps illisible */
    }
    return null;
  },
};