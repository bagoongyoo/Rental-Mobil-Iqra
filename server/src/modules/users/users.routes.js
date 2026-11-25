// Manajemen pengguna oleh admin (Dev 1): daftar pelanggan/driver, blokir/aktifkan, akun yang dihapus pelanggan.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { badRequest, parse } from '../../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const { role, q } = req.query;
  // ?deleted=1 -> hanya akun yang dihapus pelanggan; selain itu akun terhapus tidak ikut tampil.
  const deleted = req.query.deleted === '1';
  const users = await prisma.user.findMany({
    where: {
      role: role ? String(role) : { in: ['CUSTOMER', 'DRIVER'] },
      status: deleted ? 'DELETED' : { not: 'DELETED' },
      ...(q
        ? { OR: [{ name: { contains: String(q) } }, { email: { contains: String(q) } }, { deletedEmail: { contains: String(q) } }, { phone: { contains: String(q) } }] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true,
      deletedAt: true, deletedEmail: true, deleteReason: true,
      documents: { select: { id: true, type: true, status: true } },
      driverProfile: { select: { licenseNumber: true, isReady: true, lastSeenAt: true } },
      _count: { select: { bookings: true } },
    },
  });
  if (deleted) return res.json({ users });

  // Tandai akun yang email/HP-nya sama dengan akun yang pernah dihapus (antisipasi daftar ulang untuk menghindari catatan).
  const gone = await prisma.user.findMany({ where: { status: 'DELETED' }, select: { id: true, deletedEmail: true, phone: true } });
  const byEmail = new Map(gone.filter((g) => g.deletedEmail).map((g) => [g.deletedEmail, g.id]));
  const byPhone = new Map(gone.filter((g) => g.phone).map((g) => [g.phone.replace(/\D/g, '').replace(/^62/, '0'), g.id]));
  res.json({
    users: users.map((u) => ({
      ...u,
      previousDeletedId: byEmail.get(u.email) ?? (u.phone ? byPhone.get(u.phone.replace(/\D/g, '').replace(/^62/, '0')) : undefined) ?? null,
    })),
  });
});

router.patch('/:id/status', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'BLOCKED']) }), req.body);
  const id = Number(req.params.id);
  if (id === req.user.id) throw badRequest('Tidak bisa mengubah status akun sendiri');
  const target = await prisma.user.findUnique({ where: { id }, select: { status: true } });
  if (target?.status === 'DELETED') throw badRequest('Akun ini sudah dihapus pemiliknya dan tidak bisa diaktifkan lagi');
  const user = await prisma.user.update({ where: { id }, data: { status }, select: { id: true, status: true } });
  res.json({ user });
});

export default router;
