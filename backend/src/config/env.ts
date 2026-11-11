import 'dotenv/config';
import { z } from 'zod';

// Sur Vercel, l'adresse publique est connue automatiquement (sans https:// dans la variable)
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    CORS_ORIGIN: z.string().default(vercelUrl ?? 'http://localhost:5173'),
    PUBLIC_APP_URL: z.string().url().default(vercelUrl ?? 'http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    // none = espèces seulement ; mock = simulation (développement uniquement)
    PAYMENT_PROVIDER: z.enum(['mock', 'none']).default('none'),
    PAYMENT_WEBHOOK_SECRET: z.string().default(''),
    // Paiement Mobile Money manuel : numéro marchand composé par le client, puis validé par le caissier
    MOBILE_MONEY_MERCHANT_CODE: z.string().regex(/^\d{6,15}$/).default('74639266'),
    MOBILE_MONEY_MERCHANT_NAME: z.string().default('RESTAURANT NJ_DISTRICT'),
    // Nombre de proxys devant le serveur (1 chez la plupart des hébergeurs, 0 en local)
    // Vercel place un proxy devant le serveur : sans cela, tous les clients auraient la même adresse IP
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(process.env.VERCEL ? 1 : 0),
    // true : le serveur sert aussi les écrans construits du frontend
    SERVE_FRONTEND: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    FRONTEND_DIST: z.string().default('../frontend/dist'),
    // Dossier des photos : doit être sur un disque persistant en ligne
    UPLOAD_DIR: z.string().default('uploads'),
  })
  .refine((v) => !(v.NODE_ENV === 'production' && v.PAYMENT_PROVIDER === 'mock'), {
    message: 'Le prestataire de simulation est interdit en production',
    path: ['PAYMENT_PROVIDER'],
  })
  .refine((v) => v.PAYMENT_PROVIDER !== 'mock' || v.PAYMENT_WEBHOOK_SECRET.length >= 32, {
    message: 'PAYMENT_WEBHOOK_SECRET (32 caractères minimum) est obligatoire avec PAYMENT_PROVIDER=mock',
    path: ['PAYMENT_WEBHOOK_SECRET'],
  })
  .refine((v) => v.NODE_ENV !== 'production' || v.PUBLIC_APP_URL.startsWith('https://'), {
    message: 'En production, PUBLIC_APP_URL doit commencer par https://',
    path: ['PUBLIC_APP_URL'],
  });

export const env = schema.parse(process.env);