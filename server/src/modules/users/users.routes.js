// Manajemen pengguna (Dev 1), khusus admin.
// GET   /api/users?role=CUSTOMER|DRIVER&q=   daftar pelanggan / driver
// PATCH /api/users/:id/status { isActive }   blokir / aktifkan akun
// POST  /api/users/drivers                   admin membuat akun driver (langsung disetujui)
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../../config/db');
const { requireAuth, requireRole } = require('../../middleware/auth.middleware');

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const listSchema = z.object({
  role: z.enum(['CUSTOMER', 'DRIVER']).default('CUSTOMER'),
  q: z.string().trim().max(100).optional(),
});

router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query || {});
  if (!parsed.success) throw httpError(400, 'Filter tidak valid.');
  const { role, q } = parsed.data;

  const users = await prisma.user.findMany({
    where: {
      role,
      ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      role: true,
      isActive: true,
      isApproved: true,
      createdAt: true,
      documents: { where: { type: { in: ['KTP', 'SIM'] } }, select: { id: true, type: true, status: true } },
      driverProfile: { select: { approvalStatus: true, isReady: true, licenseNumber: true, lastLocationAt: true } },
      _count: { select: { customerOrders: true, driverOrders: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json({
    success: true,
    data: users.map(({ _count, ...u }) => ({
      ...u,
      orderCount: role === 'DRIVER' ? _count.driverOrders : _count.customerOrders,
    })),
  });
});

// Akun driver yang dibuat admin langsung disetujui (isApproved + approvalStatus APPROVED),
// jadi driver bisa langsung masuk di aplikasi driver (modul Dev 3) tanpa proses persetujuan.
const createDriverSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('Format email tidak valid'),
  phone: z.string().trim().regex(/^(\+62|62|0)8\d{7,12}$/, 'No. HP tidak valid (contoh: 081234567890)'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(100),
  licenseNumber: z.string().trim().min(5, 'No. SIM minimal 5 karakter').max(30),
  address: z.string().trim().max(255).optional(),
});

router.post('/drivers', async (req, res) => {
  const parsed = createDriverSchema.safeParse(req.body || {});
  if (!parsed.success) throw httpError(400, parsed.error.issues[0]?.message || 'Data tidak valid.');
  const { licenseNumber, password, ...data } = parsed.data;

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (emailTaken) throw httpError(409, 'Email sudah dipakai akun lain.');
  const simTaken = await prisma.driverProfile.findFirst({ where: { licenseNumber }, select: { id: true } });
  if (simTaken) throw httpError(409, 'No. SIM sudah terdaftar pada driver lain.');

  let driver;
  try {
    driver = await prisma.user.create({
      data: {
        ...data,
        password: await bcrypt.hash(password, 10),
        role: 'DRIVER',
        isActive: true,
        isApproved: true,
        driverProfile: { create: { licenseNumber, approvalStatus: 'APPROVED' } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isApproved: true,
        createdAt: true,
        driverProfile: { select: { approvalStatus: true, isReady: true, licenseNumber: true } },
      },
    });
  } catch (err) {
    if (err?.code === 'P2002') throw httpError(409, 'Email sudah dipakai akun lain.');
    throw err;
  }

  res.status(201).json({ success: true, message: 'Akun driver dibuat dan bisa langsung masuk.', data: driver });
});

router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body || {});
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'ID pengguna tidak valid.');
  if (!parsed.success) throw httpError(400, 'isActive wajib bernilai true/false.');

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) throw httpError(404, 'Pengguna tidak ditemukan.');
  if (user.role === 'ADMIN') throw httpError(403, 'Akun admin tidak bisa diblokir dari sini.');

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
    select: { id: true, name: true, isActive: true },
  });
  // Driver yang diblokir otomatis tidak lagi "siap jalan".
  if (!parsed.data.isActive && user.role === 'DRIVER') {
    await prisma.driverProfile.updateMany({ where: { userId: id }, data: { isReady: false } });
  }

  res.json({ success: true, message: updated.isActive ? 'Akun diaktifkan.' : 'Akun diblokir.', data: updated });
});

module.exports = router;
