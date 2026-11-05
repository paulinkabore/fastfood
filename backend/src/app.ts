import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { UPLOAD_ROOT } from './lib/upload';
import { authRouter } from './modules/auth/auth.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { tablesRouter } from './modules/tables/tables.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { cashierRouter } from './modules/cashier/cashier.routes';
import { restaurantRouter } from './modules/restaurant/restaurant.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { stockRouter } from './modules/stock/stock.routes';
import { publicRouter } from './modules/public/public.routes';
import { publicOrdersRouter } from './modules/public/orders.routes';
import { publicPaymentsRouter, webhooksRouter } from './modules/payments/payments.routes';
import { mockRouter } from './modules/payments/mock.routes';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(helmet());
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
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d' }));

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
app.use('/api/v1/restaurants/:restaurantId', stockRouter);

// Fausse page de prestataire : développement uniquement
if (env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDER === 'mock') {
  app.use('/api/v1/dev', mockRouter);
}

app.use(errorHandler);