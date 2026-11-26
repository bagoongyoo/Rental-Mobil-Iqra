const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const prisma = require('../../config/db');
const ordersService = require('../orders/orders.service');
const trackingService = require('../tracking/tracking.service');
const { getIO } = require('../../sockets');

const DRIVER_STORAGE_DIR = path.join(__dirname, '../../../storage/drivers');
const CONDITION_STORAGE_DIR = path.join(__dirname, '../../../storage/condition-photos');
const MAX_CONDITION_PHOTO_BYTES = 1048576; // 1 MB

const CONDITION_SLOTS = [
  { key: 'front', field: 'frontPhoto', label: 'Tampak Depan' },
  { key: 'back', field: 'backPhoto', label: 'Tampak Belakang' },
  { key: 'left', field: 'leftPhoto', label: 'Sisi Kiri' },
  { key: 'right', field: 'rightPhoto', label: 'Sisi Kanan' },
];

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
 * Pastikan akun driver valid, tidak diblokir Admin (isActive = true), dan sudah disetujui (isApproved = true).
 * Terintegrasi langsung dengan status blokir/aktif dari Dev 1 (PATCH /api/users/:id/status)
 * maupun akun driver dari seed / POST /api/users/drivers / POST /api/auth/register.
 */
async function assertActiveApprovedDriver(driverUserId) {
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

  if (!user.isActive) {
    const err = new Error('Akun driver Anda sedang diblokir. Hubungi admin.');
    err.statusCode = 403;
    throw err;
  }

  const approvalStatus = user.driverProfile?.approvalStatus;
  if (!user.isApproved || (approvalStatus && approvalStatus !== 'APPROVED')) {
    const message =
      approvalStatus === 'REJECTED'
        ? 'Pendaftaran akun driver Anda ditolak oleh Admin.'
        : 'Akun driver Anda masih menunggu persetujuan admin.';
    const err = new Error(message);
    err.statusCode = 403;
    throw err;
  }

  return user;
}

/**
 * Pendaftaran Driver Baru:
 * Data diri, nomor SIM, foto SIM, foto profil.
 * Akun dibuat dengan isApproved = false & approvalStatus = PENDING (aktif hanya setelah disetujui Admin).
 */
async function registerDriver(payload, files = {}) {
  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  const phone = payload?.phone ? String(payload.phone).trim() : null;
  const address = payload?.address ? String(payload.address).trim() : null;
  const licenseNumber = String(payload?.licenseNumber || '').trim();

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

  const simTaken = await prisma.driverProfile.findFirst({
    where: { licenseNumber },
    select: { id: true },
  });
  if (simTaken) {
    const err = new Error('No. SIM sudah terdaftar pada driver lain.');
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
        phone,
        address,
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
 * Mendukung akun driver dari pendaftaran Dev 3, seed Dev 1 (driver@rentalmobiliqra.com),
 * pembuatan admin Dev 1 (POST /api/users/drivers), maupun pendaftaran Dev 1 (/api/auth/register).
 * Ditolak jika diblokir (isActive = false) atau belum disetujui Admin.
 */
async function loginDriver({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    const err = new Error('Email dan password wajib diisi.');
    err.statusCode = 400;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
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
    const err = new Error('Akun Anda diblokir. Hubungi admin.');
    err.statusCode = 403;
    throw err;
  }

  // Syarat wajib Dev 3: Login driver ditolak jika belum disetujui admin
  const approvalStatus = user.driverProfile?.approvalStatus;
  if (!user.isApproved || (approvalStatus && approvalStatus !== 'APPROVED')) {
    const status = approvalStatus || 'PENDING';
    const message =
      status === 'REJECTED'
        ? 'Pendaftaran akun driver Anda ditolak oleh Admin.'
        : 'Akun driver Anda masih menunggu persetujuan admin.';
    const err = new Error(message);
    err.statusCode = 403;
    throw err;
  }

  // Jika akun driver berasal dari Dev 1 (/api/auth/register) dan sudah disetujui tanpa baris driverProfile, pastikan barisnya ada
  let driverProfile = user.driverProfile;
  if (!driverProfile) {
    driverProfile = await prisma.driverProfile.create({
      data: {
        userId: user.id,
        licenseNumber: `SIM-${user.id}`,
        approvalStatus: 'APPROVED',
        isReady: false,
      },
    });
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
    user: {
      ...safeUser,
      driverProfile,
    },
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
          upsert: {
            create: {
              licenseNumber: `SIM-${driverUserId}`,
              approvalStatus: normalizedStatus,
              isReady: false,
            },
            update: {
              approvalStatus: normalizedStatus,
              ...(isApproved ? {} : { isReady: false }),
            },
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
  const user = await assertActiveApprovedDriver(driverUserId);
  if (!user.driverProfile) {
    const createdProfile = await prisma.driverProfile.create({
      data: {
        userId: user.id,
        licenseNumber: `SIM-${user.id}`,
        approvalStatus: 'APPROVED',
        isReady: false,
      },
    });
    return { ...user, driverProfile: createdProfile };
  }
  return user;
}

/**
 * Ambil daftar tugas driver (hari ini / aktif / semua)
 */
async function getDriverTasks(driverUserId, filter = 'today') {
  await assertActiveApprovedDriver(driverUserId);
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
  await assertActiveApprovedDriver(driverUserId);

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
  const profile = await prisma.driverProfile.upsert({
    where: { userId: Number(driverUserId) },
    create: {
      userId: Number(driverUserId),
      licenseNumber: `SIM-${driverUserId}`,
      approvalStatus: 'APPROVED',
      isReady: Boolean(isReady),
      ...(lat !== undefined && lng !== undefined
        ? {
            lastLat: Number(lat),
            lastLng: Number(lng),
            lastLocationAt: now,
          }
        : {}),
    },
    update: {
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

  const io = getIO();
  if (io) {
    io.to('role:ADMIN').emit('driver:status', {
      driverId: Number(driverUserId),
      isReady: profile.isReady,
      lat: profile.lastLat ?? null,
      lng: profile.lastLng ?? null,
      at: now.toISOString(),
    });
  }

  return profile;
}

/**
 * Driver menekan tombol "Mulai Tugas" (CONFIRMED → ONGOING).
 * Syarat: Izin lokasi (GPS) wajib aktif & dikirimkan bersama koordinat awal.
 */
async function startTask(driverUserId, orderId, { gpsGranted, lat, lng }) {
  await assertActiveApprovedDriver(driverUserId);

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
  await prisma.driverProfile.upsert({
    where: { userId: Number(driverUserId) },
    create: {
      userId: Number(driverUserId),
      licenseNumber: `SIM-${driverUserId}`,
      approvalStatus: 'APPROVED',
      isReady: true,
      lastLat: Number(lat),
      lastLng: Number(lng),
      lastLocationAt: new Date(),
    },
    update: {
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
  await assertActiveApprovedDriver(driverUserId);

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

/**
 * Ambil path absolut foto profil driver yang tersimpan di server/storage/drivers/
 */
async function getDriverProfilePhotoPath(driverUserId) {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: Number(driverUserId) },
    select: { photoFilePath: true },
  });

  if (!profile?.photoFilePath) {
    const err = new Error('Foto profil driver belum tersedia.');
    err.statusCode = 404;
    throw err;
  }

  const resolved = path.resolve(__dirname, '../../../', profile.photoFilePath);
  const allowedBase = path.resolve(DRIVER_STORAGE_DIR);
  if (!resolved.startsWith(allowedBase)) {
    const err = new Error('Path foto profil tidak valid.');
    err.statusCode = 403;
    throw err;
  }

  await fs.access(resolved).catch(() => {
    const err = new Error('File foto profil tidak ditemukan di penyimpanan.');
    err.statusCode = 404;
    throw err;
  });

  return resolved;
}

/**
 * Simpan 4 foto kondisi fisik kendaraan (Tampak Depan, Tampak Belakang, Sisi Kiri, Sisi Kanan)
 * dengan batas maksimal 1 MB (1.048.576 bytes) per foto.
 */
async function saveConditionPhotos(driverUserId, orderId, files = {}, { notes } = {}) {
  await assertActiveApprovedDriver(driverUserId);

  const order = await ordersService.getOrderById(orderId);
  if (order.driverId !== Number(driverUserId)) {
    const err = new Error('Order ini tidak ditugaskan kepada Anda.');
    err.statusCode = 403;
    throw err;
  }

  if (!['CONFIRMED', 'ONGOING'].includes(order.status)) {
    const err = new Error(
      `Unggah foto kondisi hanya berlaku untuk order berstatus CONFIRMED atau ONGOING (status saat ini: ${order.status}).`
    );
    err.statusCode = 400;
    throw err;
  }

  for (const slot of CONDITION_SLOTS) {
    const file = files?.[slot.field]?.[0];
    if (!file) {
      const err = new Error(`Foto ${slot.label} wajib diunggah (4 sisi lengkap).`);
      err.statusCode = 400;
      throw err;
    }
    if (!file.mimetype?.startsWith('image/')) {
      const err = new Error(`File ${slot.label} harus berupa gambar.`);
      err.statusCode = 400;
      throw err;
    }
    if (file.size > MAX_CONDITION_PHOTO_BYTES) {
      const err = new Error(`Ukuran foto ${slot.label} melebihi batas maksimal 1 MB.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const orderDir = path.join(CONDITION_STORAGE_DIR, `order-${order.id}`);
  await fs.mkdir(orderDir, { recursive: true });

  const photosMeta = {};
  for (const slot of CONDITION_SLOTS) {
    const file = files[slot.field][0];
    const fileName = `${slot.key}.webp`;
    const fullPath = path.join(orderDir, fileName);

    const info = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(fullPath);

    photosMeta[slot.key] = {
      slot: slot.key,
      label: slot.label,
      fileName,
      size: info.size,
      originalSize: file.size,
    };
  }

  const metadata = {
    orderId: order.id,
    orderCode: order.orderCode,
    driverId: Number(driverUserId),
    notes: typeof notes === 'string' ? notes.trim() : '',
    uploadedAt: new Date().toISOString(),
    uploaded: true,
    photos: photosMeta,
  };

  await fs.writeFile(path.join(orderDir, 'meta.json'), JSON.stringify(metadata, null, 2), 'utf8');
  return metadata;
}

/**
 * Ambil metadata 4 foto kondisi fisik kendaraan untuk suatu order
 */
async function getConditionPhotos(requesterUser, orderId) {
  const order = await ordersService.getOrderById(orderId);
  if (requesterUser?.role === 'DRIVER' && order.driverId !== Number(requesterUser.id)) {
    const err = new Error('Order ini tidak ditugaskan kepada Anda.');
    err.statusCode = 403;
    throw err;
  }

  const metaPath = path.join(CONDITION_STORAGE_DIR, `order-${order.id}`, 'meta.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      driverId: order.driverId,
      notes: '',
      uploadedAt: null,
      uploaded: false,
      photos: null,
    };
  }
}

/**
 * Ambil path absolut file foto kondisi per slot ('front' | 'back' | 'left' | 'right')
 */
async function getConditionPhotoFilePath(requesterUser, orderId, slotKey) {
  if (!CONDITION_SLOTS.some((s) => s.key === slotKey)) {
    const err = new Error('Slot foto kondisi tidak valid.');
    err.statusCode = 400;
    throw err;
  }

  const order = await ordersService.getOrderById(orderId);
  if (requesterUser?.role === 'DRIVER' && order.driverId !== Number(requesterUser.id)) {
    const err = new Error('Order ini tidak ditugaskan kepada Anda.');
    err.statusCode = 403;
    throw err;
  }

  const filePath = path.join(CONDITION_STORAGE_DIR, `order-${order.id}`, `${slotKey}.webp`);
  await fs.access(filePath).catch(() => {
    const err = new Error('Foto kondisi belum tersedia.');
    err.statusCode = 404;
    throw err;
  });

  return filePath;
}

module.exports = {
  registerDriver,
  loginDriver,
  listAllDrivers,
  updateDriverApproval,
  getMyDriverProfile,
  getDriverProfilePhotoPath,
  getDriverTasks,
  updateReadyStatus,
  startTask,
  completeTask,
  saveConditionPhotos,
  getConditionPhotos,
  getConditionPhotoFilePath,
};
