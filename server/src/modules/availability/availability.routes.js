// API cari ketersediaan untuk halaman pelanggan (Dev 3, dipakai Dev 2).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { parse } from '../../utils/http.js';
import { computeEndAt, PACKAGES, unitPriceFor } from '../../utils/pricing.js';
import { availabilityByType } from './availability.service.js';

const router = Router();

export const searchSchema = z.object({
  service: z.enum(['WITH_DRIVER', 'SELF_DRIVE']),
  package: z.enum(['HOURS_4', 'HOURS_12', 'DAILY', 'MONTHLY', 'YEARLY']),
  city: z.string().trim().min(2),
  startAt: z.coerce.date(),
  quantity: z.coerce.number().int().min(1).max(30),
});

router.get('/search', async (req, res) => {
  const q = parse(
    searchSchema.refine((v) => PACKAGES[v.package].service === v.service, { message: 'Paket tidak cocok dengan layanan', path: ['package'] }),
    req.query,
  );
  const end = computeEndAt(q.package, q.startAt, q.quantity);
  const [types, stock] = await Promise.all([
    prisma.carType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    availabilityByType({ city: q.city, start: q.startAt, end }),
  ]);
  const results = types
    .map((t) => {
      const unitPrice = unitPriceFor(t, q.package);
      return { ...t, unitPrice, totalPrice: unitPrice == null ? null : unitPrice * q.quantity, available: Math.max(0, stock.get(t.id) || 0) };
    })
    .filter((t) => t.unitPrice != null && stock.has(t.id))
    .sort((a, b) => (b.available > 0) - (a.available > 0) || a.unitPrice - b.unitPrice);
  res.json({ startAt: q.startAt, endAt: end, results });
});

export default router;
