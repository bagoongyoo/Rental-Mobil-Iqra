// Dokumen KTP/SIM (Dev 2). File dikompres di browser, lalu di server diubah ke WebP dan disimpan privat.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { PRIVATE_STORAGE } from '../../config/paths.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { imageUpload } from '../../middleware/upload.js';
import { badRequest, forbidden, notFound, parse } from '../../utils/http.js';

const router = Router();
router.use(requireAuth);
const DOC_DIR = path.join(PRIVATE_STORAGE, 'documents');

router.get('/mine', async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { userId: req.user.id },
    select: { id: true, type: true, status: true, rejectReason: true, fileSize: true, updatedAt: true },
  });
  res.json({ documents });
});

router.post('/', imageUpload.single('file'), async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(['KTP', 'SIM']) }), req.body);
  if (!req.file) throw badRequest('Foto dokumen wajib diisi');
  const existing = await prisma.document.findUnique({ where: { userId_type: { userId: req.user.id, type } } });
  if (existing?.status === 'APPROVED') throw badRequest('Dokumen ini sudah disetujui');

  const filename = `${req.user.id}-${type.toLowerCase()}-${Date.now()}.webp`;
  const info = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(path.join(DOC_DIR, filename));

  const document = await prisma.document.upsert({
    where: { userId_type: { userId: req.user.id, type } },
    create: { userId: req.user.id, type, filePath: filename, fileSize: info.size },
    update: { filePath: filename, fileSize: info.size, status: 'PENDING', rejectReason: null, reviewedAt: null, reviewedById: null },
    select: { id: true, type: true, status: true, fileSize: true, updatedAt: true },
  });
  if (existing) await fs.rm(path.join(DOC_DIR, existing.filePath), { force: true });
  res.status(201).json({ document });
});

// File hanya bisa dilihat pemiliknya atau admin.
router.get('/:id/file', async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: Number(req.params.id) } });
  if (!doc) throw notFound();
  if (req.user.role !== 'ADMIN' && doc.userId !== req.user.id) throw forbidden();
  res.set('Cache-Control', 'private, no-store');
  res.type('image/webp').sendFile(path.join(DOC_DIR, path.basename(doc.filePath)));
});

// ---------- Admin ----------

router.get('/', requireRole('ADMIN'), async (req, res) => {
  const status = req.query.status ? String(req.query.status) : 'PENDING';
  const documents = await prisma.document.findMany({
    // Dokumen milik akun yang sudah dihapus tidak perlu diverifikasi lagi (tetap tersimpan, terlihat di filter ALL).
    where: status === 'ALL' ? {} : { status, ...(status === 'PENDING' ? { user: { status: { not: 'DELETED' } } } : {}) },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { updatedAt: 'asc' },
  });
  res.json({ documents: documents.map(({ filePath, ...d }) => d) });
});

router.patch('/:id/review', requireRole('ADMIN'), async (req, res) => {
  const data = parse(
    z.object({ status: z.enum(['APPROVED', 'REJECTED']), rejectReason: z.string().trim().max(255).optional() })
      .refine((v) => v.status === 'APPROVED' || v.rejectReason, { message: 'Isi alasan penolakan', path: ['rejectReason'] }),
    req.body,
  );
  const document = await prisma.document.update({
    where: { id: Number(req.params.id) },
    data: { status: data.status, rejectReason: data.status === 'REJECTED' ? data.rejectReason : null, reviewedById: req.user.id, reviewedAt: new Date() },
    select: { id: true, type: true, status: true, rejectReason: true, userId: true },
  });
  res.json({ document });
});

export default router;
