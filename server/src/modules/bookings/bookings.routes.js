// Pemesanan oleh pelanggan (Dev 2): buat pesanan, riwayat, dashboard, detail, batalkan.
const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const bookingsService = require('./bookings.service');

const router = express.Router();
router.use(requireAuth, requireRole('CUSTOMER'));

const createSchema = z.object({
  carTypeId: z.coerce.number().int().positive(),
  serviceType: z.enum(['WITH_DRIVER', 'SELF_DRIVE']),
  packageType: z.enum(['HOURS_4', 'HOURS_12', 'DAILY', 'MONTHLY', 'YEARLY']),
  duration: z.coerce.number().int().min(1).max(365),
  pickupCity: z.string().trim().min(2).max(60),
  pickupAddress: z.string().trim().min(5, 'Alamat jemput minimal 5 karakter').max(255),
  startTime: z.coerce.date(),
  notes: z.string().trim().max(500).optional(),
  // Lokasi akurat dari GPS / pin peta (opsional).
  pickupLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  pickupLng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

function parse(schema, body) {
  const result = schema.safeParse(body || {});
  if (!result.success) {
    const err = new Error(result.error.issues[0]?.message || 'Data tidak valid.');
    err.statusCode = 400;
    throw err;
  }
  return result.data;
}

// POST /api/bookings
router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  const order = await bookingsService.createBooking(req.user.id, data);
  res.status(201).json({ success: true, data: order });
});

// GET /api/bookings
router.get('/', async (req, res) => {
  const orders = await bookingsService.listMyBookings(req.user.id);
  res.json({ success: true, data: orders });
});

// GET /api/bookings/dashboard (didaftarkan sebelum '/:id')
router.get('/dashboard', async (req, res) => {
  res.json({ success: true, data: await bookingsService.getDashboard(req.user.id) });
});

// GET /api/bookings/:id
router.get('/:id', async (req, res) => {
  const order = await bookingsService.getMyBooking(req.user.id, req.params.id);
  res.json({ success: true, data: order, paymentMode: process.env.PAYMENT_MODE || 'simulate' });
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().max(255).optional() }), req.body);
  const order = await bookingsService.cancelMyBooking(req.user.id, req.params.id, reason);
  res.json({ success: true, data: order });
});

module.exports = router;
