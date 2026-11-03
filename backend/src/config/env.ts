import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  })
  .refine((v) => !(v.NODE_ENV === 'production' && v.PAYMENT_PROVIDER === 'mock'), {
    message: 'Le prestataire de simulation est interdit en production',
    path: ['PAYMENT_PROVIDER'],
  });

export const env = schema.parse(process.env);