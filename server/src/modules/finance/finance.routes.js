// Keuangan (Dev 1), khusus admin.
// GET    /api/finance/summary?period=day|week|month|year&date=YYYY-MM-DD&type=INCOME|EXPENSE
// GET    /api/finance/export?period&date&type   → file .csv
// GET    /api/finance/categories
// POST   /api/finance/transactions              → transaksi manual
// DELETE /api/finance/transactions/:id          → hanya transaksi manual
const { Router } = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');
const finance = require('./finance.service');

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

const filterSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('month'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
});

const transactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], { message: 'Jenis harus pemasukan atau pengeluaran' }),
  category: z.string().trim().min(2, 'Kategori wajib diisi').max(50),
  amount: z.coerce.number().int('Nominal harus bilangan bulat').min(1, 'Nominal minimal Rp1').max(2_000_000_000),
  description: z.string().trim().max(500).optional().nullable(),
  transactionDate: z.coerce
    .date({ message: 'Tanggal tidak valid' })
    .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Tanggal tidak boleh di masa depan')
    .optional(),
});

router.get('/summary', async (req, res) => {
  const filters = parse(filterSchema, req.query, res);
  if (!filters) return;
  res.json({ success: true, data: await finance.getSummary(filters) });
});

router.get('/export', async (req, res) => {
  const filters = parse(filterSchema, req.query, res);
  if (!filters) return;
  const { fileName, content } = await finance.exportCsv(filters);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(content);
});

router.get('/categories', (req, res) => {
  res.json({ success: true, data: finance.CATEGORIES });
});

router.post('/transactions', async (req, res) => {
  const data = parse(transactionSchema, req.body, res);
  if (!data) return;
  const created = await finance.createTransaction(data);
  res.status(201).json({ success: true, message: 'Transaksi dicatat.', data: created });
});

router.delete('/transactions/:id', async (req, res) => {
  await finance.deleteTransaction(req.params.id);
  res.json({ success: true, message: 'Transaksi dihapus.' });
});

module.exports = router;
