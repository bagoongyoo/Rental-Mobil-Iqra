// Pemesanan oleh pelanggan (Dev 2).
// Memakai tabel Order dari skema bersama. Perubahan status lewat orders.service (Dev 3)
// supaya Socket.IO, email, dan sinkronisasi unit tetap berjalan di satu tempat.
const crypto = require('crypto');
const prisma = require('../../config/db');
const ordersService = require('../orders/orders.service');
const { searchAvailableCarTypes } = require('../availability/availability.service');

// Paket sewa: layanan yang cocok, kolom harga di CarType, dan lama per satuan.
const PACKAGES = {
  HOURS_4: { serviceType: 'WITH_DRIVER', priceField: 'price4HoursDriver', hours: 4 },
  HOURS_12: { serviceType: 'WITH_DRIVER', priceField: 'price12HoursDriver', hours: 12 },
  DAILY: { serviceType: 'SELF_DRIVE', priceField: 'priceDailySelfDrive' },
  MONTHLY: { serviceType: 'SELF_DRIVE', priceField: 'priceMonthlySelfDrive' },
  YEARLY: { serviceType: 'SELF_DRIVE', priceField: 'priceYearlySelfDrive' },
};

const PAYMENT_TIMEOUT_MINUTES = Number(process.env.PAYMENT_TIMEOUT_MINUTES || 60);
const CANCELLABLE = ['WAITING_PAYMENT', 'PAID', 'CONFIRMED'];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Waktu selesai sewa.
 * - Dengan driver (4/12 jam): `duration` = jumlah hari, tiap hari berlaku sekian jam.
 * - Lepas kunci: `duration` = jumlah hari / bulan / tahun sesuai paket.
 */
function computeEndTime(packageType, startTime, duration) {
  const pkg = PACKAGES[packageType];
  if (pkg.hours) return new Date(addDays(startTime, duration - 1).getTime() + pkg.hours * 3600000);
  if (packageType === 'DAILY') return addDays(startTime, duration);
  if (packageType === 'MONTHLY') return addMonths(startTime, duration);
  return addMonths(startTime, duration * 12);
}

/** Harga satuan paket. 0 di CarType berarti paket itu tidak tersedia. */
function unitPriceFor(carType, packageType) {
  const price = carType[PACKAGES[packageType].priceField];
  return price > 0 ? price : null;
}

function generateOrderCode() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `IQR-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** KTP dan SIM sudah disetujui admin (syarat lepas kunci). */
async function hasApprovedDocuments(userId) {
  const approved = await prisma.userDocument.findMany({
    where: { userId, status: 'APPROVED', type: { in: ['KTP', 'SIM'] } },
    select: { type: true },
  });
  const types = new Set(approved.map((d) => d.type));
  return types.has('KTP') && types.has('SIM');
}

async function createBooking(customerId, data) {
  if (PACKAGES[data.packageType].serviceType !== data.serviceType) {
    throw httpError(400, 'Paket tidak cocok dengan jenis layanan.');
  }
  if (data.startTime.getTime() < Date.now() + 60 * 60000) {
    throw httpError(400, 'Waktu mulai minimal 1 jam dari sekarang.');
  }
  if (data.serviceType === 'SELF_DRIVE' && !(await hasApprovedDocuments(customerId))) {
    throw httpError(403, 'Lepas kunci membutuhkan KTP dan SIM yang sudah disetujui admin.');
  }

  const carType = await prisma.carType.findUnique({ where: { id: data.carTypeId } });
  if (!carType) throw httpError(404, 'Tipe mobil tidak ditemukan.');

  const unitPrice = unitPriceFor(carType, data.packageType);
  if (unitPrice == null) throw httpError(400, 'Paket ini tidak tersedia untuk tipe mobil tersebut.');

  const endTime = computeEndTime(data.packageType, data.startTime, data.duration);

  // Stok dihitung oleh engine ketersediaan Dev 3.
  const [availability] = await searchAvailableCarTypes({
    startTime: data.startTime,
    endTime,
    carTypeId: carType.id,
  });
  if (!availability || availability.availableStock <= 0) {
    throw httpError(409, 'Maaf, mobil ini sudah habis untuk jadwal tersebut.');
  }

  // Titik GPS / pin peta (opsional) disimpan sebagai tautan peta di catatan,
  // supaya skema bersama tidak perlu kolom baru.
  const notes = [data.notes, data.pickupLat != null && data.pickupLng != null
    ? `Titik lokasi: https://maps.google.com/?q=${data.pickupLat},${data.pickupLng}`
    : null]
    .filter(Boolean)
    .join('\n') || null;

  return prisma.order.create({
    data: {
      orderCode: generateOrderCode(),
      customerId,
      carTypeId: carType.id,
      serviceType: data.serviceType,
      packageType: data.packageType,
      pickupCity: data.pickupCity,
      pickupAddress: data.pickupAddress,
      startTime: data.startTime,
      endTime,
      duration: data.duration,
      totalPrice: unitPrice * data.duration,
      notes,
      paymentExpiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60000),
    },
    include: { carType: true, payment: true },
  });
}

function listMyBookings(customerId) {
  return ordersService.listOrders({ customerId });
}

async function getMyBooking(customerId, id) {
  const order = await ordersService.getOrderById(id);
  if (order.customerId !== customerId) throw httpError(404, 'Pesanan tidak ditemukan.');
  return order;
}

/**
 * Pelanggan boleh membatalkan sebelum perjalanan dimulai.
 * Yang sudah dibayar paling lambat 24 jam sebelum mulai; refund diproses admin.
 */
async function cancelMyBooking(customerId, id, reason) {
  const order = await getMyBooking(customerId, id);
  if (!CANCELLABLE.includes(order.status)) throw httpError(400, 'Pesanan ini tidak bisa dibatalkan.');
  if (order.status !== 'WAITING_PAYMENT' && order.startTime.getTime() - Date.now() < 24 * 3600000) {
    throw httpError(400, 'Pembatalan pesanan yang sudah dibayar paling lambat 24 jam sebelum mulai. Hubungi admin.');
  }
  const notes = reason ? [order.notes, `Alasan batal: ${reason}`].filter(Boolean).join('\n') : undefined;
  return ordersService.updateOrderStatus(order.id, 'CANCELLED', { notes });
}

/** Ringkasan untuk dashboard pelanggan. */
async function getDashboard(customerId) {
  const now = new Date();
  const include = { carType: true, carUnit: true, payment: true, driver: { select: { id: true, name: true, phone: true } } };
  const [current, upcoming, pendingPayment, recent, documents, completedCount, activeCount, spent, user] = await Promise.all([
    prisma.order.findFirst({ where: { customerId, status: 'ONGOING' }, include, orderBy: { startTime: 'asc' } }),
    prisma.order.findMany({ where: { customerId, status: { in: ['PAID', 'CONFIRMED'] } }, include, orderBy: { startTime: 'asc' }, take: 3 }),
    prisma.order.findMany({ where: { customerId, status: 'WAITING_PAYMENT', paymentExpiresAt: { gt: now } }, include, orderBy: { paymentExpiresAt: 'asc' } }),
    prisma.order.findMany({ where: { customerId }, include, orderBy: { createdAt: 'desc' }, take: 4 }),
    prisma.userDocument.findMany({ where: { userId: customerId }, select: { type: true, status: true, rejectionReason: true } }),
    prisma.order.count({ where: { customerId, status: 'COMPLETED' } }),
    prisma.order.count({
      where: {
        customerId,
        OR: [{ status: { in: ['PAID', 'CONFIRMED', 'ONGOING'] } }, { status: 'WAITING_PAYMENT', paymentExpiresAt: { gt: now } }],
      },
    }),
    prisma.order.aggregate({ _sum: { totalPrice: true }, where: { customerId, status: { in: ['PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'] } } }),
    prisma.user.findUnique({ where: { id: customerId }, select: { phone: true, address: true, createdAt: true } }),
  ]);

  return {
    current,
    upcoming,
    pendingPayment,
    recent,
    documents,
    stats: {
      activeCount,
      completedCount,
      totalSpent: spent._sum.totalPrice || 0,
      memberSince: user?.createdAt || null,
    },
    profileComplete: Boolean(user?.phone && user?.address),
  };
}

module.exports = {
  PACKAGES,
  computeEndTime,
  unitPriceFor,
  hasApprovedDocuments,
  createBooking,
  listMyBookings,
  getMyBooking,
  cancelMyBooking,
  getDashboard,
};
