// Master data mobil (Dev 1): tipe mobil + harga paket, unit (plat nomor), foto.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { PUBLIC_UPLOADS } from '../../config/paths.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { imageUpload } from '../../middleware/upload.js';
import { badRequest, notFound, parse } from '../../utils/http.js';
import { getFees } from '../../utils/pricing.js';

const router = Router();
const admin = [requireAuth, requireRole('ADMIN')];

const price = z.coerce.number().int().min(0).nullable().optional();
const typeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  brand: z.string().trim().min(2).max(60),
  category: z.enum(['MPV', 'SUV', 'SEDAN', 'HATCHBACK', 'VAN', 'PREMIUM']),
  seats: z.coerce.number().int().min(2).max(20),
  luggage: z.coerce.number().int().min(0).max(10).default(2),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']),
  fuel: z.string().trim().max(30).default('Bensin'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0f766e'),
  description: z.string().trim().max(2000).nullable().optional(),
  priceDriver4h: price,
  priceDriver12h: price,
  priceDaily: price,
  priceMonthly: price,
  priceYearly: price,
  isActive: z.boolean().optional(),
});

const unitSchema = z.object({
  carTypeId: z.coerce.number().int(),
  plate: z.string().trim().toUpperCase().min(3).max(20),
  year: z.coerce.number().int().min(1990).max(2100),
  color: z.string().trim().min(2).max(30),
  city: z.string().trim().min(2).max(60),
  odometer: z.coerce.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

// ---------- Publik ----------

router.get('/cities', async (_req, res) => {
  const rows = await prisma.carUnit.findMany({ where: { status: 'ACTIVE' }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } });
  res.json({ cities: rows.map((r) => r.city) });
});

router.get('/types', async (_req, res) => {
  const types = await prisma.carType.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.json({ types });
});

router.get('/types/:id', async (req, res) => {
  const type = await prisma.carType.findFirst({ where: { id: Number(req.params.id), isActive: true } });
  if (!type) throw notFound('Tipe mobil tidak ditemukan');
  res.json({ type });
});

// Biaya tambahan yang tampil di checkout.
router.get('/fees', async (_req, res) => {
  const { serviceFee, deliveryFee } = await getFees(prisma);
  res.json({ fees: { serviceFee, deliveryFee } });
});

// ---------- Admin: biaya tambahan ----------

const feesSchema = z.object({
  serviceFee: z.coerce.number().int().min(0).max(10_000_000),
  deliveryFee: z.coerce.number().int().min(0).max(10_000_000),
});

router.get('/admin/fees', ...admin, async (_req, res) => {
  res.json({ fees: await getFees(prisma) });
});

// Hanya berlaku untuk pesanan baru; pesanan lama menyimpan salinan biayanya sendiri.
router.put('/admin/fees', ...admin, async (req, res) => {
  const data = parse(feesSchema, req.body);
  const fees = await prisma.pricingSetting.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  res.json({ fees });
});

// ---------- Admin: tipe ----------

router.get('/admin/types', ...admin, async (_req, res) => {
  const types = await prisma.carType.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { units: true, bookings: true } } },
  });
  res.json({ types });
});

router.post('/admin/types', ...admin, async (req, res) => {
  const type = await prisma.carType.create({ data: parse(typeSchema, req.body) });
  res.status(201).json({ type });
});

router.patch('/admin/types/:id', ...admin, async (req, res) => {
  const type = await prisma.carType.update({ where: { id: Number(req.params.id) }, data: parse(typeSchema.partial(), req.body) });
  res.json({ type });
});

router.delete('/admin/types/:id', ...admin, async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.booking.count({ where: { carTypeId: id } });
  if (used > 0) {
    // Sudah punya riwayat order: nonaktifkan saja supaya laporan tetap utuh.
    await prisma.carType.update({ where: { id }, data: { isActive: false } });
    return res.json({ deactivated: true });
  }
  await prisma.carUnit.deleteMany({ where: { carTypeId: id } });
  await prisma.carType.delete({ where: { id } });
  res.json({ deleted: true });
});

router.post('/admin/types/:id/image', ...admin, imageUpload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('File foto wajib diisi');
  const id = Number(req.params.id);
  const filename = `type-${id}-${Date.now()}.webp`;
  await sharp(req.file.buffer).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 75 }).toFile(path.join(PUBLIC_UPLOADS, 'cars', filename));
  const old = await prisma.carType.findUnique({ where: { id }, select: { imagePath: true } });
  const type = await prisma.carType.update({ where: { id }, data: { imagePath: `/uploads/cars/${filename}` } });
  if (old?.imagePath) await fs.rm(path.join(PUBLIC_UPLOADS, 'cars', path.basename(old.imagePath)), { force: true });
  res.json({ type });
});

// Hapus foto unggahan: tipe kembali memakai foto contoh bawaan / ilustrasi.
router.delete('/admin/types/:id/image', ...admin, async (req, res) => {
  const id = Number(req.params.id);
  const old = await prisma.carType.findUnique({ where: { id }, select: { imagePath: true } });
  if (!old) throw notFound('Tipe mobil tidak ditemukan');
  const type = await prisma.carType.update({ where: { id }, data: { imagePath: null } });
  if (old.imagePath) await fs.rm(path.join(PUBLIC_UPLOADS, 'cars', path.basename(old.imagePath)), { force: true });
  res.json({ type });
});

// ---------- Admin: unit ----------

router.get('/admin/units', ...admin, async (req, res) => {
  const units = await prisma.carUnit.findMany({
    where: req.query.carTypeId ? { carTypeId: Number(req.query.carTypeId) } : {},
    include: { carType: { select: { id: true, name: true, brand: true } } },
    orderBy: [{ carTypeId: 'asc' }, { plate: 'asc' }],
  });
  const now = new Date();
  const busy = await prisma.booking.findMany({
    where: { unitId: { not: null }, status: { in: ['CONFIRMED', 'ONGOING'] }, startAt: { lte: now }, endAt: { gt: now } },
    select: { unitId: true },
  });
  const inService = await prisma.maintenance.findMany({
    where: { status: 'SCHEDULED', startDate: { lte: now }, endDate: { gt: now } },
    select: { unitId: true },
  });
  const busyIds = new Set(busy.map((b) => b.unitId));
  const serviceIds = new Set(inService.map((m) => m.unitId));
  res.json({
    units: units.map((u) => ({
      ...u,
      currentState: u.status === 'INACTIVE' ? 'INACTIVE' : serviceIds.has(u.id) ? 'MAINTENANCE' : busyIds.has(u.id) ? 'RENTED' : 'AVAILABLE',
    })),
  });
});

router.post('/admin/units', ...admin, async (req, res) => {
  const unit = await prisma.carUnit.create({ data: parse(unitSchema, req.body) });
  res.status(201).json({ unit });
});

router.patch('/admin/units/:id', ...admin, async (req, res) => {
  const unit = await prisma.carUnit.update({ where: { id: Number(req.params.id) }, data: parse(unitSchema.partial(), req.body) });
  res.json({ unit });
});

router.delete('/admin/units/:id', ...admin, async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.booking.count({ where: { unitId: id } });
  if (used > 0) {
    await prisma.carUnit.update({ where: { id }, data: { status: 'INACTIVE' } });
    return res.json({ deactivated: true });
  }
  await prisma.carUnit.delete({ where: { id } });
  res.json({ deleted: true });
});

export default router;
