// Kode verifikasi (OTP) untuk ganti / lupa kata sandi (Dev 2).
import crypto from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, HttpError } from '../../utils/http.js';
import { exposeDevCode, sendOtp } from './notify.js';

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SEC = 60;
export const OTP_MAX_PER_HOUR = 5;

const hashCode = (userId, code) => crypto.createHmac('sha256', env.jwtSecret).update(`${userId}:${code}`).digest('hex');
const tooMany = (msg) => new HttpError(429, msg);

/** Sembunyikan sebagian alamat tujuan: b***@gmail.com, 0812****7890. */
export function maskDestination(channel, to) {
  if (channel === 'EMAIL') {
    const [u, d] = to.split('@');
    return `${u.slice(0, 1)}${'*'.repeat(Math.max(2, u.length - 1))}@${d}`;
  }
  const s = String(to).replace(/\s/g, '');
  return s.length > 6 ? `${s.slice(0, 4)}${'*'.repeat(s.length - 8 > 0 ? s.length - 8 : 2)}${s.slice(-4)}` : s;
}

/** Tujuan kode untuk pengguna ini, atau error jika saluran tidak bisa dipakai. */
export function destinationFor(user, channel) {
  if (channel === 'EMAIL') return user.email;
  if (!user.phone) throw badRequest('Nomor WhatsApp belum diisi di profil. Pakai email atau isi nomor HP dulu.');
  return user.phone;
}

/** Buat kode baru (kode lama otomatis tidak berlaku), kirim, kembalikan info untuk layar. */
export async function issueOtp(user, purpose, channel) {
  const destination = destinationFor(user, channel);
  const now = Date.now();
  const recent = await prisma.otpCode.findMany({
    where: { userId: user.id, purpose, createdAt: { gte: new Date(now - 3600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent[0] && now - recent[0].createdAt.getTime() < OTP_RESEND_SEC * 1000) {
    const wait = Math.ceil((OTP_RESEND_SEC * 1000 - (now - recent[0].createdAt.getTime())) / 1000);
    throw tooMany(`Tunggu ${wait} detik sebelum meminta kode baru.`);
  }
  if (recent.length >= OTP_MAX_PER_HOUR) throw tooMany('Terlalu banyak permintaan kode. Coba lagi 1 jam lagi.');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.$transaction([
    prisma.otpCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.otpCode.create({
      data: { userId: user.id, purpose, channel, destination, codeHash: hashCode(user.id, code), expiresAt: new Date(now + OTP_TTL_MIN * 60_000) },
    }),
  ]);
  try {
    await sendOtp({ channel, to: destination, code, purpose, name: user.name });
  } catch (err) {
    console.error('[OTP] gagal mengirim', err.message);
    throw new HttpError(502, channel === 'EMAIL' ? 'Email kode verifikasi gagal dikirim. Coba lagi atau pakai WhatsApp.' : 'WhatsApp kode verifikasi gagal dikirim. Coba lagi atau pakai email.');
  }
  return {
    channel,
    sentTo: maskDestination(channel, destination),
    expiresInMin: OTP_TTL_MIN,
    resendInSec: OTP_RESEND_SEC,
    ...(exposeDevCode(channel) ? { devCode: code } : {}),
  };
}

/** Cek kode; jika benar, tandai terpakai. Salah 5x = kode hangus. */
export async function consumeOtp(userId, purpose, code) {
  const otp = await prisma.otpCode.findFirst({ where: { userId, purpose, usedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!otp || otp.expiresAt < new Date()) throw badRequest('Kode tidak berlaku atau sudah kedaluwarsa. Minta kode baru.', { code: 'Kode kedaluwarsa' });
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw badRequest('Terlalu banyak percobaan. Minta kode baru.', { code: 'Minta kode baru' });
  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hashCode(userId, String(code).trim())));
  if (!ok) {
    const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 }, ...(left <= 0 ? { usedAt: new Date() } : {}) } });
    throw badRequest(left > 0 ? `Kode salah. Sisa ${left} percobaan.` : 'Kode salah 5 kali. Minta kode baru.', { code: 'Kode salah' });
  }
  await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
}
