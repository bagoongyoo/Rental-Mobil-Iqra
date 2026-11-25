import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { forbidden, unauthorized } from '../utils/http.js';

const passwordVersion = (user) => (user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0);

export function signToken(user) {
  // pwd = versi kata sandi; berubah saat kata sandi diganti sehingga token lama otomatis tidak berlaku.
  return jwt.sign({ sub: user.id, role: user.role, pwd: passwordVersion(user) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

/** Wajib login. Mengisi req.user dari database agar status blokir langsung berlaku. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token) throw unauthorized();
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw unauthorized('Sesi berakhir, silakan masuk lagi');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'DELETED') throw unauthorized('Akun tidak ditemukan atau sudah dihapus');
    // Token lama tidak berlaku lagi setelah kata sandi diganti (semua perangkat lain otomatis keluar).
    if ((payload.pwd || 0) !== passwordVersion(user)) throw unauthorized('Sesi berakhir, silakan masuk lagi');
    if (user.status === 'BLOCKED') throw forbidden('Akun Anda diblokir. Hubungi admin.');
    if (user.status === 'PENDING') throw forbidden('Akun Anda belum disetujui admin.');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  next();
};
