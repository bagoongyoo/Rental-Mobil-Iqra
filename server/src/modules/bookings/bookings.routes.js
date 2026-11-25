// Pemesanan oleh pelanggan (Dev 2): buat pesanan, riwayat, detail, batalkan.
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../utils/http.js';
import { generateBookingCode } from '../../utils/bookingCode.js';
import { computeEndAt, feesFor, getFees, PACKAGES, unitPriceFor } from '../../utils/pricing.js';
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
  // Lokasi akurat (GPS / pin peta). Opsional: pelanggan boleh hanya mengisi alamat manual.
  pickupLat: z.coerce.number().min(-90).max(90).optional().nullable(),
  pickupLng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

// Area layanan Rental Mobil Iqra: Palu dan sekitarnya (Sigi, Donggala, Parigi Moutong, dst).
const SERVICE_CENTER = { lat: -0.8917, lng: 119.8707 };
const SERVICE_RADIUS_KM = 150;
function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  if (PACKAGES[data.package].service !== data.service) throw badRequest('Paket tidak cocok dengan layanan');
  if (data.startAt.getTime() < Date.now() + 60 * 60000) throw badRequest('Waktu mulai minimal 1 jam dari sekarang');
  const hasPin = data.pickupLat != null && data.pickupLng != null;
  if ((data.pickupLat != null) !== (data.pickupLng != null)) throw badRequest('Koordinat lokasi tidak lengkap');
  if (hasPin && distanceKm(SERVICE_CENTER, { lat: data.pickupLat, lng: data.pickupLng }) > SERVICE_RADIUS_KM) {
    throw badRequest('Titik lokasi di luar area layanan Palu dan sekitarnya. Geser pin atau isi alamat manual.');
  }

  if (data.service === 'SELF_DRIVE') {
    const approved = await prisma.document.count({ where: { userId: req.user.id, status: 'APPROVED', type: { in: ['KTP', 'SIM'] } } });
    if (approved < 2) throw forbidden('Lepas kunci membutuhkan KTP dan SIM yang sudah disetujui admin');
  }

  const carType = await prisma.carType.findFirst({ where: { id: data.carTypeId, isActive: true } });
  if (!carType) throw notFound('Tipe mobil tidak ditemukan');
  const unitPrice = unitPriceFor(carType, data.package);
  if (unitPrice == null) throw badRequest('Paket ini tidak tersedia untuk tipe mobil tersebut');
  const endAt = computeEndAt(data.package, data.startAt, data.quantity);
  const { serviceFee, deliveryFee } = feesFor(data.service, await getFees(prisma));

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
          pickupLat: hasPin ? data.pickupLat : null,
          pickupLng: hasPin ? data.pickupLng : null,
          startAt: data.startAt,
          endAt,
          unitPrice,
          serviceFee,
          deliveryFee,
          totalPrice: unitPrice * data.quantity + serviceFee + deliveryFee,
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

// Ringkasan untuk dashboard pelanggan: sewa yang sedang berjalan, jadwal terdekat, tagihan, dokumen, statistik.
// Harus didaftarkan sebelum '/:id' supaya "dashboard" tidak dianggap id pesanan.
router.get('/dashboard', async (req, res) => {
  const customerId = req.user.id;
  const now = new Date();
  const [current, upcoming, pendingPayment, recent, documents, completedCount, activeCount, spent, lastCompleted, user] = await Promise.all([
    prisma.booking.findFirst({ where: { customerId, status: 'ONGOING' }, include: bookingInclude, orderBy: { startAt: 'asc' } }),
    prisma.booking.findMany({ where: { customerId, status: { in: ['PAID', 'CONFIRMED'] } }, include: bookingInclude, orderBy: { startAt: 'asc' }, take: 3 }),
    prisma.booking.findMany({ where: { customerId, status: 'PENDING_PAYMENT', expiresAt: { gt: now } }, include: bookingInclude, orderBy: { expiresAt: 'asc' } }),
    prisma.booking.findMany({ where: { customerId }, include: bookingInclude, orderBy: { createdAt: 'desc' }, take: 4 }),
    prisma.document.findMany({ where: { userId: customerId }, select: { type: true, status: true, rejectReason: true } }),
    prisma.booking.count({ where: { customerId, status: 'COMPLETED' } }),
    prisma.booking.count({ where: { customerId, OR: [{ status: { in: ['PAID', 'CONFIRMED', 'ONGOING'] } }, { status: 'PENDING_PAYMENT', expiresAt: { gt: now } }] } }),
    prisma.booking.aggregate({ _sum: { totalPrice: true }, where: { customerId, status: { in: ['PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'] } } }),
    prisma.booking.findFirst({ where: { customerId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' }, select: { service: true, package: true, carType: { select: { id: true, name: true, brand: true, category: true, color: true, imagePath: true } } } }),
    prisma.user.findUnique({ where: { id: customerId }, select: { phone: true, address: true, createdAt: true } }),
  ]);
  res.json({
    current,
    upcoming,
    pendingPayment,
    recent,
    documents,
    lastCompleted,
    stats: { activeCount, completedCount, totalSpent: spent._sum.totalPrice || 0, memberSince: user.createdAt },
    profileComplete: Boolean(user.phone && user.address),
  });
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
