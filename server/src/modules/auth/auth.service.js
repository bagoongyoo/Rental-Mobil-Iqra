const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');

const SALT_ROUNDS = 10;

// Field user yang aman dikirim ke client (tanpa password).
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  role: true,
  isActive: true,
  isApproved: true,
  createdAt: true,
};

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register({ name, email, password, phone, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw httpError(409, 'Email sudah terdaftar.');
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      role,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      // Driver baru menunggu persetujuan admin sebelum bisa login.
      isApproved: role !== 'DRIVER',
    },
    select: publicUserSelect,
  });

  // Driver belum mendapat token sampai disetujui admin.
  const token = user.isApproved ? signToken(user) : null;
  return { user, token };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Pesan sama untuk email salah & password salah, supaya email terdaftar tidak bisa ditebak.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw httpError(401, 'Email atau password salah.');
  }
  if (!user.isActive) {
    throw httpError(403, 'Akun Anda diblokir. Hubungi admin.');
  }
  if (!user.isApproved) {
    throw httpError(403, 'Akun driver Anda masih menunggu persetujuan admin.');
  }

  const { password: _omit, ...safeUser } = user;
  return { user: safeUser, token: signToken(user) };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });
  if (!user) {
    throw httpError(404, 'Pengguna tidak ditemukan.');
  }
  if (!user.isActive) {
    throw httpError(403, 'Akun Anda diblokir. Hubungi admin.');
  }
  return user;
}

module.exports = { register, login, getMe };
