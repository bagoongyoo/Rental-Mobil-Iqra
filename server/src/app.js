import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { PUBLIC_UPLOADS } from './config/paths.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import dashboardRoutes from './modules/users/dashboard.routes.js';
import carsRoutes from './modules/cars/cars.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js';
import bookingsRoutes from './modules/bookings/bookings.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import documentsRoutes from './modules/documents/documents.routes.js';
import availabilityRoutes from './modules/availability/availability.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import driversRoutes from './modules/drivers/drivers.routes.js';
import trackingRoutes from './modules/tracking/tracking.routes.js';
import accountRoutes from './modules/account/account.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  const midtrans = ['https://app.sandbox.midtrans.com', 'https://app.midtrans.com', 'https://api.sandbox.midtrans.com', 'https://api.midtrans.com'];
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", "'unsafe-inline'", ...midtrans], // inline: skrip tema di index.html
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', ...midtrans],
          'connect-src': ["'self'", 'ws:', 'wss:', ...midtrans],
          'frame-src': ["'self'", ...midtrans],
          'upgrade-insecure-requests': env.isProd ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  if (!env.isProd) app.use(morgan('dev'));

  // Foto mobil (publik). KTP/SIM ada di storage/ dan hanya lewat /api/documents/:id/file.
  app.use('/uploads', express.static(PUBLIC_UPLOADS, { maxAge: '7d' }));

  // Dipakai panel driver untuk cek koneksi internet ke server.
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/cars', carsRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/bookings', bookingsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/availability', availabilityRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/drivers', driversRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api', notFoundHandler);

  // Produksi: server juga melayani hasil build React (client/dist) di satu domain.
  const clientDist = path.resolve(PUBLIC_UPLOADS, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
