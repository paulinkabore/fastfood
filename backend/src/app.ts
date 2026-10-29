import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { authenticate, requireRestaurantRole, requireSuperAdmin } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRouter);

// --- Routes temporaires de test des permissions (supprimées à l'étape 4) ---
app.get('/api/v1/admin/ping', authenticate, requireSuperAdmin, (_req, res) => {
  res.json({ ok: true, scope: 'super-admin' });
});

app.get(
  '/api/v1/restaurants/:restaurantId/ping',
  authenticate,
  requireRestaurantRole('MANAGER', 'CASHIER'),
  (req, res) => {
    res.json({ ok: true, role: req.membership!.role });
  },
);

app.use(errorHandler);