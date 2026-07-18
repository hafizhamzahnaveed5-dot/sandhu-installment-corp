import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { fail, ok } from './utils/respond.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import installmentRoutes from './routes/installment-plans.js';
import paymentRoutes from './routes/payments.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit-logs.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import roznamchaRoutes from './routes/roznamcha.js';
import siteSettingsRoutes from './routes/site-settings.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: config.frontendOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/api/health/db', async (_req, res) => {
    try {
      const { pool } = await import('./db.js');
      const result = await pool.query('SELECT 1 AS ok');
      return ok(res, { status: 'ok', db: result.rows[0]?.ok === 1 });
    } catch (error) {
      console.error('[health/db]', error);
      return fail(res, 500, `Database connection failed: ${error.message}`);
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/installment-plans', installmentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/roznamcha', roznamchaRoutes);
  app.use('/api/site-settings', siteSettingsRoutes);

  app.use((_req, res) => fail(res, 404, 'Endpoint not found.'));
  app.use((error, _req, res, _next) => {
    console.error(error);
    if (error?.status && typeof error.message === 'string') {
      return fail(res, error.status, error.message);
    }
    // Surface common Neon/pg failures clearly (still safe — no secrets)
    const msg = String(error?.message || '');
    if (/password authentication failed/i.test(msg)) {
      return fail(res, 500, 'Database password rejected. Update DATABASE_URL on Vercel from Neon (pooled) or Railway.');
    }
    if (/timeout|ECONNREFUSED|ENOTFOUND|SSL|certificate|connection/i.test(msg)) {
      return fail(res, 500, `Database connection error: ${msg}`);
    }
    return fail(res, 500, 'Internal server error.');
  });

  return app;
}
