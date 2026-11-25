const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const prisma = require('../../config/db');
const ordersService = require('../orders/orders.service');
const trackingService = require('../tracking/tracking.service');

const DRIVER_STORAGE_DIR = path.join(__dirname, '../../../storage/drivers');

/**
 * Kompres foto SIM / profil driver menjadi WebP dan simpan secara privat di server/storage/drivers/
 */
async function saveCompressedWebp(buffer, prefix) {
  if (!buffer) return null;
  await fs.mkdir(DRIVER_STORAGE_DIR, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
  const fullPath = path.join(DRIVER_STORAGE_DIR, fileName);

  await sharp(buffer)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(fullPath);

  return `storage/drivers/${fileName}`;
}

/**
 * Pendaftaran Driver Baru:
 * Data diri, nomor SIM, foto SIM, foto profil.
 * Akun dibuat dengan isApproved = false & approvalStatus = PENDING (aktif hanya setelah disetujui Admin).
 */
async function registerDriver(payload, files = {}) {
  const { name, email, password, phone, address, licenseNumber } = payload;

  if (!name || !email || !password || !licenseNumber) {
    const err = new Error('Nama, email, password, dan nomor SIM (licenseNumber) wajib diisi.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email sudah terdaftar. Gunakan email lain.');
    err.statusCode = 409;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const simBuffer = files.simPhoto?.[0]?.buffer || null;
  const photoBuffer = files.profilePhoto?.[0]?.buffer || null;

  const [simFilePath, photoFilePath] = await Promise.all([
    saveCompressedWebp(simBuffer, 'sim'),
    saveCompressedWebp(photoBuffer, 'driver-photo'),
  ]);

  const createdDriver = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        address: address || null,
        role: 'DRIVER',
        isActive: true,
        isApproved: false, // Wajib disetujui admin terlebih dahulu
        driverProfile: {
          create: {
            licenseNumber,
            simFilePath,
            photoFilePath,
            approvalStatus: 'PENDING',
            isReady: false,
          },
        },
      },
      include: {
        driverProfile: true,
      },
    });

    const docsToCreate = [];
    if (simFilePath) {
      docsToCreate.push({
        userId: user.id,
        type: 'SIM',
        filePath: simFilePath,
        status: 'PENDING',
      });
    }
    if (photoFilePath) {
      docsToCreate.push({
        userId: user.id,
        type: 'PHOTO',
        filePath: photoFilePath,
        status: 'PENDING',
      });
    }

    if (docsToCreate.length > 0) {
      await tx.userDocument.createMany({ data: docsToCreate });
    }

    return user;
  });

  const { password: _, ...safeUser } = createdDriver;
  return safeUser;
}

/**
 * Login khusus Driver:
 * Ditolak jika akun driver belum disetujui oleh Admin (isApproved === false atau approvalStatus !== 'APPROVED')
 */
async function loginDriver({ email, password }) {
  if (!email || !password) {
    const err = new Error('Email dan password wajib diisi.');
    err.statusCode = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { driverProfile: true },
  });

  if (!user || user.role !== 'DRIVER') {
    const err = new Error('Email atau password driver tidak valid.');
    err.statusCode = 401;
    throw err;
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    const err = new Error('Email atau password driver tidak valid.');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    const err = new Error('Akun driver Anda sedang dinonaktifkan oleh Admin.');
    err.statusCode = 403;
    throw err;
  }

  // Syarat wajib Dev 3: Login driver ditolak jika belum disetujui admin
  if (!user.isApproved || user.driverProfile?.approvalStatus !== 'APPROVED') {
    const status = user.driverProfile?.approvalStatus || 'PENDING';
    const message =
      status === 'REJECTED'
        ? 'Pendaftaran akun driver Anda ditolak oleh Admin.'
        : 'Akun driver Anda belum disetujui oleh Admin. Silakan tunggu proses verifikasi.';
    const err = new Error(message);
    err.statusCode = 403;
    throw err;
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const { password: _, ...safeUser } = user;
  return {
    token,
    user: safeUser,
  };
}

/**
 * Daftar semua driver (untuk panel Admin melakukan verifikasi pendaftaran driver)
 */
async function listAllDrivers(filters = {}) {
  const where = { role: 'DRIVER' };
  if (filters.approvalStatus) {
    where.driverProfile = { approvalStatus: filters.approvalStatus };
  }

  return prisma.user.findMany({
    where,
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
      driverProfile: true,
      documents: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Admin menyetujui atau menolak pendaftaran driver
 */
async function updateDriverApproval(driverUserId, { status, rejectionReason }) {
  const normalizedStatus = String(status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(normalizedStatus)) {
    const err = new Error('Status persetujuan harus APPROVED atau REJECTED.');
    err.statusCode = 400;
    throw err;
  }

  const isApproved = normalizedStatus === 'APPROVED';

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: Number(driverUserId) },
      data: {
        isApproved,
        driverProfile: {
          update: {
            approvalStatus: normalizedStatus,
          },
        },
      },
      include: { driverProfile: true },
    });

    await tx.userDocument.updateMany({
      where: { userId: Number(driverUserId) },
      data: {
        status: normalizedStatus,
        rejectionReason: isApproved ? null : rejectionReason || null,
        verifiedAt: new Date(),
      },
    });

    return user;
  });

  const { password: _, ...safeUser } = updated;
  return safeUser;
}

/**
 * Ambil profil driver yang sedang login beserta status siap jalan
 */
async function getMyDriverProfile(driverUserId) {
  const user = await prisma.user.findUnique({
    where: { id: Number(driverUserId) },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      role: true,
      isActive: true,
      isApproved: true,
      driverProfile: true,
    },
  });

  if (!user || user.role !== 'DRIVER') {
    const err = new Error('Profil driver tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }

  return user;
}

/**
 * Ambil daftar tugas driver (hari ini / aktif / semua)
 */
async function getDriverTasks(driverUserId, filter = 'today') {
  const where = {
    driverId: Number(driverUserId),
  };

  if (filter === 'today') {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    where.OR = [
      { status: { in: ['CONFIRMED', 'ONGOING'] } },
      {
        startTime: { lte: endOfDay },
        endTime: { gte: startOfDay },
      },
    ];
  } else if (filter === 'active') {
    where.status = { in: ['CONFIRMED', 'ONGOING'] };
  } else if (filter === 'history') {
    where.status = { in: ['COMPLETED', 'CANCELLED'] };
  }

  return prisma.order.findMany({
    where,
    include: {
      customer: {
        select: { id: true, name: true, email: true, phone: true },
      },
      carType: true,
      carUnit: true,
    },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Ubah status "Siap Jalan" (isReady) pada panel driver.
 * Wajib memberikan izin lokasi GPS (gpsGranted === true dan koordinat lat/lng) sebelum bisa siap jalan!
 */
async function updateReadyStatus(driverUserId, { isReady, gpsGranted, lat, lng }) {
  if (isReady) {
    if (!gpsGranted || typeof Number(lat) !== 'number' || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      const err = new Error(
        'Izin lokasi (Geolocation GPS) wajib diaktifkan sebelum mengubah status menjadi "Siap Jalan".'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  const now = new Date();
  const profile = await prisma.driverProfile.update({
    where: { userId: Number(driverUserId) },
    data: {
      isReady: Boolean(isReady),
      ...(lat !== undefined && lng !== undefined
        ? {
            lastLat: Number(lat),
            lastLng: Number(lng),
            lastLocationAt: now,
          }
        : {}),
    },
  });

  if (isReady && lat !== undefined && lng !== undefined) {
    await trackingService.recordDriverLocation(driverUserId, {
      lat: Number(lat),
      lng: Number(lng),
    });
  }

  return profile;
}

/**
 * Driver menekan tombol "Mulai Tugas" (CONFIRMED → ONGOING).
 * Syarat: Izin lokasi (GPS) wajib aktif & dikirimkan bersama koordinat awal.
 */
async function startTask(driverUserId, orderId, { gpsGranted, lat, lng }) {
  if (!gpsGranted || lat === undefined || lng === undefined || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    const err = new Error(
      'Tidak dapat memulai tugas: Anda wajib mengizinkan akses lokasi (GPS) terlebih dahulu.'
    );
    err.statusCode = 400;
    throw err;
  }

  const order = await ordersService.getOrderById(orderId);
  if (order.driverId !== Number(driverUserId)) {
    const err = new Error('Order ini tidak ditugaskan kepada Anda.');
    err.statusCode = 403;
    throw err;
  }

  if (order.status !== 'CONFIRMED') {
    const err = new Error(`Tugas hanya dapat dimulai jika berstatus CONFIRMED (status saat ini: ${order.status}).`);
    err.statusCode = 400;
    throw err;
  }

  // Pastikan status driver siap jalan & simpan titik GPS awal keberangkatan
  await prisma.driverProfile.update({
    where: { userId: Number(driverUserId) },
    data: {
      isReady: true,
      lastLat: Number(lat),
      lastLng: Number(lng),
      lastLocationAt: new Date(),
    },
  });

  await trackingService.recordDriverLocation(driverUserId, {
    orderId: order.id,
    lat: Number(lat),
    lng: Number(lng),
  });

  return ordersService.updateOrderStatus(order.id, 'ONGOING');
}

/**
 * Driver menekan tombol "Selesai Tugas" (ONGOING → COMPLETED).
 */
async function completeTask(driverUserId, orderId, { lat, lng, notes } = {}) {
  const order = await ordersService.getOrderById(orderId);
  if (order.driverId !== Number(driverUserId)) {
    const err = new Error('Order ini tidak ditugaskan kepada Anda.');
    err.statusCode = 403;
    throw err;
  }

  if (order.status !== 'ONGOING') {
    const err = new Error(`Tugas hanya dapat diselesaikan jika sedang berstatus ONGOING (status saat ini: ${order.status}).`);
    err.statusCode = 400;
    throw err;
  }

  if (lat !== undefined && lng !== undefined && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
    await trackingService.recordDriverLocation(driverUserId, {
      orderId: order.id,
      lat: Number(lat),
      lng: Number(lng),
    });
  }

  return ordersService.updateOrderStatus(order.id, 'COMPLETED', { notes });
}

module.exports = {
  registerDriver,
  loginDriver,
  listAllDrivers,
  updateDriverApproval,
  getMyDriverProfile,
  getDriverTasks,
  updateReadyStatus,
  startTask,
  completeTask,
};
