// Jadwal perawatan (Dev 1), khusus admin.
// GET   /api/maintenance?status&carUnitId
// GET   /api/maintenance/upcoming?days=7
// GET   /api/maintenance/:id
// POST  /api/maintenance                 { carUnitId, serviceType, scheduledDate, cost?, notes? }
// PATCH /api/maintenance/:id             (hanya jadwal terbuka)
// POST  /api/maintenance/:id/start
// POST  /api/maintenance/:id/complete    { cost, completedDate?, notes?, nextInMonths? }
// POST  /api/maintenance/:id/cancel
const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const service = require('./maintenance.service');

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

function parse(schema, input, res) {
  const result = schema.safeParse(input || {});
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: result.error.issues[0]?.message || 'Data tidak valid.',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return result.data;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal wajib diisi (YYYY-MM-DD)');
const cost = z.coerce.number().int('Biaya harus bilangan bulat').min(0, 'Biaya tidak boleh negatif').max(2_000_000_000);
const status = z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

const fields = {
  carUnitId: z.coerce.number().int().positive('Unit wajib dipilih'),
  serviceType: z.string().trim().min(2, 'Jenis servis wajib diisi').max(100),
  scheduledDate: dateStr,
  cost,
  notes: z.string().trim().max(1000).optional().nullable(),
};

const createSchema = z.object({ ...fields, cost: cost.default(0) });
const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada data yang diubah' });
const completeSchema = z.object({
  cost,
  completedDate: dateStr.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  nextInMonths: z.coerce.number().int().min(1).max(24).optional().nullable(),
});
const listSchema = z.object({
  status: status.optional(),
  carUnitId: z.coerce.number().int().positive().optional(),
});

router.get('/', async (req, res) => {
  const query = parse(listSchema, req.query, res);
  if (!query) return;
  res.json({ success: true, data: await service.list(query) });
});

router.get('/upcoming', async (req, res) => {
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 7));
  res.json({ success: true, data: await service.upcoming(days) });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await service.getById(req.params.id) });
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body, res);
  if (!data) return;
  res.status(201).json({ success: true, message: 'Jadwal servis dibuat.', data: await service.create(data) });
});

router.patch('/:id', async (req, res) => {
  const data = parse(updateSchema, req.body, res);
  if (!data) return;
  res.json({ success: true, message: 'Jadwal servis diperbarui.', data: await service.update(req.params.id, data) });
});

router.post('/:id/start', async (req, res) => {
  res.json({ success: true, message: 'Servis dimulai, unit ditandai perawatan.', data: await service.start(req.params.id) });
});

router.post('/:id/complete', async (req, res) => {
  const data = parse(completeSchema, req.body, res);
  if (!data) return;
  res.json({ success: true, message: 'Perawatan selesai, biaya masuk ke keuangan.', data: await service.complete(req.params.id, data) });
});

router.post('/:id/cancel', async (req, res) => {
  res.json({ success: true, message: 'Jadwal servis dibatalkan.', data: await service.cancel(req.params.id) });
});

module.exports = router;
