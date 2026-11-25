// Keamanan akun pelanggan (Dev 2): ganti kata sandi & lupa kata sandi dengan kode verifikasi
// (email atau WhatsApp), serta hapus akun (soft delete: hilang di sisi pelanggan, tetap tersimpan untuk admin).
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth, signToken } from '../../middleware/auth.js';
import { badRequest, conflict, forbidden, HttpError, parse } from '../../utils/http.js';
import * as orders from '../orders/orders.service.js';
import { consumeOtp, issueOtp } from './otp.service.js';
import { otpModes } from './notify.js';

const router = Router();

const channel = z.enum(['EMAIL', 'WHATSAPP'], { message: 'Pilih email atau WhatsApp' });
const newPassword = z.string().min(6, 'Kata sandi minimal 6 karakter').max(100);
const code = z.string().trim().regex(/^\d{6}$/, 'Kode berisi 6 angka');
const email = z.string().trim().toLowerCase().email('Email tidak valid');

/** Batas sederhana per IP untuk endpoint publik (lupa kata sandi). Hilang saat server restart, cukup untuk skala kecil. */
const ipHits = new Map();
function limitIp(req, max = 10, windowMs = 3600_000) {
  const key = req.ip;
  const now = Date.now();
  const hits = (ipHits.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new HttpError(429, 'Terlalu banyak permintaan dari perangkat ini. Coba lagi nanti.');
  hits.push(now);
  ipHits.set(key, hits);
}

/** Info saluran untuk layar: apakah WhatsApp bisa dipakai, mode simulasi atau tidak. */
router.get('/otp-channels', (_req, res) => {
  const m = otpModes();
  res.json({ channels: { EMAIL: { simulate: m.EMAIL === 'simulate' }, WHATSAPP: { simulate: m.WHATSAPP === 'simulate' } } });
});

// ---------- Lupa kata sandi (belum login) ----------

const GENERIC_SENT = 'Jika email terdaftar, kode verifikasi sudah dikirim ke email atau WhatsApp akun tersebut.';

router.post('/forgot-password/otp', async (req, res) => {
  limitIp(req);
  const data = parse(z.object({ email, channel }), req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  // Jawaban sama untuk email terdaftar / tidak, supaya daftar email pelanggan tidak bisa ditebak.
  if (!user || user.status !== 'ACTIVE') return res.json({ message: GENERIC_SENT, expiresInMin: 10, resendInSec: 60 });
  const info = await issueOtp(user, 'RESET_PASSWORD', data.channel);
  res.json({ message: GENERIC_SENT, ...info });
});

router.post('/forgot-password/reset', async (req, res) => {
  limitIp(req, 30);
  const data = parse(z.object({ email, code, newPassword }), req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || user.status !== 'ACTIVE') throw badRequest('Kode tidak berlaku atau sudah kedaluwarsa. Minta kode baru.', { code: 'Kode kedaluwarsa' });
  await consumeOtp(user.id, 'RESET_PASSWORD', data.code);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, 10), passwordChangedAt: new Date() } });
  res.json({ message: 'Kata sandi berhasil diganti. Silakan masuk dengan kata sandi baru.' });
});

// ---------- Ganti kata sandi (sudah login) ----------

router.post('/password/otp', requireAuth, async (req, res) => {
  const data = parse(z.object({ channel }), req.body);
  res.json(await issueOtp(req.user, 'CHANGE_PASSWORD', data.channel));
});

router.post('/password', requireAuth, async (req, res) => {
  const data = parse(z.object({ code, newPassword }), req.body);
  await consumeOtp(req.user.id, 'CHANGE_PASSWORD', data.code);
  if (await bcrypt.compare(data.newPassword, req.user.passwordHash)) throw badRequest('Kata sandi baru tidak boleh sama dengan yang lama', { newPassword: 'Sama dengan kata sandi lama' });
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: await bcrypt.hash(data.newPassword, 10), passwordChangedAt: new Date() },
  });
  // Perangkat lain otomatis keluar; perangkat ini dapat token baru.
  res.json({ message: 'Kata sandi berhasil diganti', token: signToken(user) });
});

// ---------- Hapus akun ----------

/** Pesanan yang menghalangi hapus akun: sudah dibayar / dikonfirmasi / sedang berjalan. */
const BLOCKING = ['PAID', 'CONFIRMED', 'ONGOING'];

async function deletionStatus(userId) {
  const [blocking, pendingPayment] = await Promise.all([
    prisma.booking.findMany({
      where: { customerId: userId, status: { in: BLOCKING } },
      select: { id: true, code: true, status: true, startAt: true, carType: { select: { brand: true, name: true } } },
      orderBy: { startAt: 'asc' },
    }),
    prisma.booking.count({ where: { customerId: userId, status: 'PENDING_PAYMENT' } }),
  ]);
  return { canDelete: blocking.length === 0, blocking, pendingPayment };
}

router.get('/delete-check', requireAuth, async (req, res) => {
  if (req.user.role !== 'CUSTOMER') throw forbidden('Hanya akun pelanggan yang bisa dihapus sendiri. Hubungi admin.');
  res.json(await deletionStatus(req.user.id));
});

router.delete('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'CUSTOMER') throw forbidden('Hanya akun pelanggan yang bisa dihapus sendiri. Hubungi admin.');
  const data = parse(
    z.object({
      password: z.string().min(1, 'Masukkan kata sandi'),
      confirm: z.string().trim().refine((v) => v.toUpperCase() === 'HAPUS', 'Ketik HAPUS untuk konfirmasi'),
      reason: z.string().trim().max(255).optional(),
    }),
    req.body,
  );
  // 400, bukan 401: 401 membuat aplikasi otomatis logout.
  if (!(await bcrypt.compare(data.password, req.user.passwordHash))) throw badRequest('Kata sandi salah', { password: 'Kata sandi salah' });
  const check = await deletionStatus(req.user.id);
  if (!check.canDelete) {
    throw conflict(`Akun belum bisa dihapus karena masih ada pesanan aktif: ${check.blocking.map((b) => b.code).join(', ')}. Selesaikan atau batalkan dulu.`);
  }

  // Tagihan yang belum dibayar dibatalkan supaya unit tidak tertahan.
  const unpaid = await prisma.booking.findMany({ where: { customerId: req.user.id, status: 'PENDING_PAYMENT' } });
  for (const b of unpaid) await orders.cancel(b, 'Akun dihapus pelanggan');

  const u = req.user;
  await prisma.$transaction([
    prisma.otpCode.deleteMany({ where: { userId: u.id } }),
    prisma.user.update({
      where: { id: u.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedEmail: u.email,
        deleteReason: data.reason || null,
        // Email diganti placeholder: login lama tidak bisa dipakai, email asli bisa dipakai daftar ulang
        // (admin melihat tanda "pernah menghapus akun" pada akun baru dengan email/HP yang sama).
        email: `hapus-${u.id}-${Date.now()}@akun-terhapus.invalid`,
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        passwordChangedAt: new Date(),
      },
    }),
  ]);
  res.json({ message: 'Akun berhasil dihapus' });
});

export default router;
