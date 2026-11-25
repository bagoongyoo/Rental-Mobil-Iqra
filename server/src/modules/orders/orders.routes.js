// Manajemen order oleh admin (Dev 3): daftar, detail, tugaskan unit + driver, ubah status.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../utils/http.js';
import { assignableDrivers, assignableUnits } from '../availability/availability.service.js';
import * as orders from './orders.service.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

export const bookingInclude = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  driver: { select: { id: true, name: true, phone: true } },
  carType: { select: { id: true, name: true, brand: true, category: true, color: true, imagePath: true, seats: true, transmission: true } },
  unit: { select: { id: true, plate: true, color: true, year: true } },
};

router.get('/', async (req, res) => {
  const { status, q } = req.query;
  const where = {};
  if (status === 'ACTION') where.status = 'PAID'; // butuh penugasan
  else if (status) where.status = String(status);
  if (q) where.OR = [{ code: { contains: String(q) } }, { customer: { name: { contains: String(q) } } }];
  const bookings = await prisma.booking.findMany({ where, include: bookingInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ bookings });
});

router.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: Number(req.params.id) }, include: { ...bookingInclude, transactions: true } });
  if (!booking) return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
  let options = null;
  if (booking.status === 'PAID' || booking.status === 'CONFIRMED') {
    const [units, drivers] = await Promise.all([assignableUnits(booking), booking.service === 'WITH_DRIVER' ? assignableDrivers(booking) : []]);
    options = { units, drivers };
  }
  res.json({ booking, options });
});

router.post('/:id/assign', async (req, res) => {
  const booking = await orders.getBookingOr404(req.params.id);
  const data = parse(z.object({ unitId: z.coerce.number().int(), driverId: z.coerce.number().int().nullable().optional() }), req.body);
  if (booking.service === 'WITH_DRIVER' && !data.driverId) throw badRequest('Pilih driver untuk layanan dengan driver');
  const units = await assignableUnits(booking);
  if (!units.some((u) => u.id === data.unitId)) throw badRequest('Unit tidak tersedia di jadwal ini');
  if (data.driverId) {
    const drivers = await assignableDrivers(booking);
    if (!drivers.some((d) => d.id === data.driverId)) throw badRequest('Driver tidak tersedia di jadwal ini');
  }
  if (booking.status === 'CONFIRMED') {
    // Ganti unit/driver tanpa mengubah status.
    const updated = await prisma.booking.update({ where: { id: booking.id }, data: { unitId: data.unitId, driverId: data.driverId ?? null } });
    return res.json({ booking: updated });
  }
  res.json({ booking: await orders.assign(booking, data) });
});

// Lepas kunci: admin menandai mobil sudah diserahkan / sudah kembali.
router.post('/:id/start', async (req, res) => {
  const booking = await orders.getBookingOr404(req.params.id);
  res.json({ booking: await orders.start(booking) });
});

router.post('/:id/complete', async (req, res) => {
  const booking = await orders.getBookingOr404(req.params.id);
  res.json({ booking: await orders.complete(booking) });
});

router.post('/:id/cancel', async (req, res) => {
  const booking = await orders.getBookingOr404(req.params.id);
  const { reason } = parse(z.object({ reason: z.string().trim().max(255).optional() }), req.body);
  res.json({ booking: await orders.cancel(booking, reason || 'Dibatalkan admin') });
});

router.post('/:id/refund', async (req, res) => {
  const booking = await orders.getBookingOr404(req.params.id);
  res.json({ booking: await orders.refund(booking, req.user.id) });
});

export default router;
