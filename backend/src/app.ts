import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { tablesRouter } from './modules/tables/tables.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { cashierRouter } from './modules/cashier/cashier.routes';
import { restaurantRouter } from './modules/restaurant/restaurant.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { statsRouter } from './modules/stats/stats.routes';
import { stockRouter } from './modules/stock/stock.routes';
import { publicRouter } from './modules/public/public.routes';
import { publicOrdersRouter } from './modules/public/orders.routes';
import { publicPaymentsRouter, webhooksRouter } from './modules/payments/payments.routes';
import { mockRouter } from './modules/payments/mock.routes';
import { errorHandler } from './middleware/errorHandler';
import { securityEvent } from './lib/security';
import { helmetOptions, setupProduction } from './lib/production';

export const app = express();

app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet(helmetOptions));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);
app.use(cookieParser());

// Photos des produits

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/public', publicOrdersRouter);
app.use('/api/v1/public', publicPaymentsRouter);
app.use('/api/v1', webhooksRouter);
app.use('/api/v1/restaurants/:restaurantId', menuRouter);
app.use('/api/v1/restaurants/:restaurantId', tablesRouter);
app.use('/api/v1/restaurants/:restaurantId', ordersRouter);
app.use('/api/v1/restaurants/:restaurantId', cashierRouter);
app.use('/api/v1/restaurants/:restaurantId', restaurantRouter);
app.use('/api/v1/restaurants/:restaurantId', staffRouter);
app.use('/api/v1/restaurants/:restaurantId', statsRouter);
app.use('/api/v1/restaurants/:restaurantId', stockRouter);

// Fausse page de prestataire : développement uniquement
if (env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDER === 'mock') {
  app.use('/api/v1/dev', mockRouter);
}

// Adresse d'API qui n'existe pas : typique d'un scanner qui cherche des failles
app.use('/api', (req, res) => {
  securityEvent(req, 'ROUTE_PROBE', { reason: req.method });
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Adresse inconnue' } });
});

setupProduction(app);

app.use(errorHandler);

// Vercel exécute l'application comme une fonction : il lui faut cet export par défaut
export default app;
