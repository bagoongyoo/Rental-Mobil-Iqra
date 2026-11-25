// Pemesanan oleh pelanggan (Dev 2): buat pesanan, riwayat, detail, batalkan.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../utils/http.js';
import { generateBookingCode } from '../../utils/bookingCode.js';
import { computeEndAt, PACKAGES, unitPriceFor } from '../../utils/pricing.js';
import { availabilityByType } from '../availability/availability.service.js';
import { searchSchema } from '../availability/availability.routes.js';
import { bookingInclude } from '../orders/orders.routes.js';
import * as orders from '../orders/orders.service.js';

const router = Router();
router.use(requireAuth, requireRole('CUSTOMER'));

const createSchema = searchSchema.extend({
  carTypeId: z.coerce.number().int(),
  pickupAddress: z.string().trim().min(5, 'Alamat jemput minimal 5 karakter').max(255),
  notes: z.string().trim().max(500).optional(),
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  if (PACKAGES[data.package].service !== data.service) throw badRequest('Paket tidak cocok dengan layanan');
  if (data.startAt.getTime() < Date.now() + 60 * 60000) throw badRequest('Waktu mulai minimal 1 jam dari sekarang');

  if (data.service === 'SELF_DRIVE') {
    const approved = await prisma.document.count({ where: { userId: req.user.id, status: 'APPROVED', type: { in: ['KTP', 'SIM'] } } });
    if (approved < 2) throw forbidden('Lepas kunci membutuhkan KTP dan SIM yang sudah disetujui admin');
  }

  const carType = await prisma.carType.findFirst({ where: { id: data.carTypeId, isActive: true } });
  if (!carType) throw notFound('Tipe mobil tidak ditemukan');
  const unitPrice = unitPriceFor(carType, data.package);
  if (unitPrice == null) throw badRequest('Paket ini tidak tersedia untuk tipe mobil tersebut');
  const endAt = computeEndAt(data.package, data.startAt, data.quantity);

  // Cek stok dan simpan dalam satu transaksi Serializable supaya dua orang tidak memesan unit terakhir bersamaan.
  const booking = await prisma.$transaction(
    async (tx) => {
      const stock = await availabilityByType({ city: data.city, start: data.startAt, end: endAt, db: tx });
      if ((stock.get(carType.id) || 0) <= 0) throw conflict('Maaf, mobil ini sudah habis untuk jadwal tersebut');
      return tx.booking.create({
        data: {
          code: generateBookingCode(),
          customerId: req.user.id,
          carTypeId: carType.id,
          service: data.service,
          package: data.package,
          quantity: data.quantity,
          city: data.city,
          pickupAddress: data.pickupAddress,
          startAt: data.startAt,
          endAt,
          unitPrice,
          totalPrice: unitPrice * data.quantity,
          notes: data.notes || null,
          expiresAt: new Date(Date.now() + env.paymentTimeoutMinutes * 60000),
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  res.status(201).json({ booking });
});

router.get('/', async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { customerId: req.user.id },
    include: bookingInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ bookings });
});

router.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findFirst({
    where: { id: Number(req.params.id), customerId: req.user.id },
    include: bookingInclude,
  });
  if (!booking) throw notFound('Pesanan tidak ditemukan');
  res.json({ booking, paymentMode: env.paymentMode });
});

// Pelanggan boleh membatalkan sebelum perjalanan dimulai. Jika sudah dibayar, admin memproses refund.
router.post('/:id/cancel', async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: Number(req.params.id), customerId: req.user.id } });
  if (!booking) throw notFound('Pesanan tidak ditemukan');
  if (!['PENDING_PAYMENT', 'PAID', 'CONFIRMED'].includes(booking.status)) throw badRequest('Pesanan ini tidak bisa dibatalkan');
  if (booking.status !== 'PENDING_PAYMENT' && booking.startAt.getTime() - Date.now() < 24 * 3600000) {
    throw badRequest('Pembatalan pesanan yang sudah dibayar paling lambat 24 jam sebelum mulai. Hubungi admin.');
  }
  const { reason } = parse(z.object({ reason: z.string().trim().max(255).optional() }), req.body || {});
  res.json({ booking: await orders.cancel(booking, reason || 'Dibatalkan pelanggan') });
});

export default router;
