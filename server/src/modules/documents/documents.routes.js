// Dokumen KTP/SIM (Dev 2): pelanggan upload & cek status, admin verifikasi.
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const documentsService = require('./documents.service');

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // maks. 5 MB sebelum diubah ke WebP
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// GET /api/documents/mine
router.get('/mine', async (req, res) => {
  res.json({ success: true, data: await documentsService.listMine(req.user.id) });
});

// POST /api/documents (multipart: type=KTP|SIM, file=<gambar>)
router.post('/', upload.single('file'), async (req, res) => {
  const parsed = z.object({ type: z.enum(['KTP', 'SIM']) }).safeParse(req.body || {});
  if (!parsed.success) throw badRequest('Jenis dokumen harus KTP atau SIM.');
  const document = await documentsService.upload(req.user.id, parsed.data.type, req.file?.buffer);
  res.status(201).json({ success: true, data: document });
});

// GET /api/documents/:id/file — gambar dokumen (pemilik atau admin)
router.get('/:id/file', async (req, res) => {
  const filePath = await documentsService.getFilePath(req.user, req.params.id);
  res.set('Cache-Control', 'private, no-store');
  res.type('image/webp').sendFile(filePath);
});

// ---------- Admin ----------

// GET /api/documents?status=PENDING|APPROVED|REJECTED|ALL
router.get('/', requireRole('ADMIN'), async (req, res) => {
  const status = String(req.query.status || 'PENDING').toUpperCase();
  if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) throw badRequest('Status tidak valid.');
  res.json({ success: true, data: await documentsService.listForAdmin(status) });
});

// PATCH /api/documents/:id/review { status: APPROVED|REJECTED, rejectionReason }
router.patch('/:id/review', requireRole('ADMIN'), async (req, res) => {
  const parsed = z
    .object({ status: z.enum(['APPROVED', 'REJECTED']), rejectionReason: z.string().trim().max(255).optional() })
    .refine((v) => v.status === 'APPROVED' || v.rejectionReason, { message: 'Isi alasan penolakan.' })
    .safeParse(req.body || {});
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || 'Data tidak valid.');
  res.json({ success: true, data: await documentsService.review(req.params.id, parsed.data) });
});

module.exports = router;
