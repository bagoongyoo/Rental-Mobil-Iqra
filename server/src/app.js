const express = require('express');
const cors = require('cors');

const app = express();

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server Rental Mobil Iqra berjalan normal',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// REGISTRASI ROUTES MODUL PER DEVELOPER
// ==========================================
// Dev 1: auth, users, cars, finance, maintenance
app.use('/api/auth', require('./modules/auth/auth.routes'));
// app.use('/api/users', require('./modules/users/users.routes'));
// app.use('/api/cars', require('./modules/cars/cars.routes'));
// app.use('/api/finance', require('./modules/finance/finance.routes'));
// app.use('/api/maintenance', require('./modules/maintenance/maintenance.routes'));

// Dev 2: bookings, payments, documents
// app.use('/api/bookings', require('./modules/bookings/bookings.routes'));
// app.use('/api/payments', require('./modules/payments/payments.routes'));
// app.use('/api/documents', require('./modules/documents/documents.routes'));

// Dev 3: availability, orders, drivers, tracking
app.use('/api/availability', require('./modules/availability/availability.routes'));
app.use('/api/orders', require('./modules/orders/orders.routes'));
app.use('/api/drivers', require('./modules/drivers/drivers.routes'));
app.use('/api/tracking', require('./modules/tracking/tracking.routes'));

// ==========================================
// 404 & GLOBAL ERROR HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Terjadi kesalahan pada server',
  });
});

module.exports = app;
