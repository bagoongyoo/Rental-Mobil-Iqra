const prisma = require('../../config/db');
const { emitOrderStatusUpdate } = require('../../sockets');
const { sendOrderStatusEmail } = require('../../utils/mailer');
const { getFreeUnitsByCarType, getFreeDrivers } = require('../availability/availability.service');

/**
 * Aturan transisi status order sesuai spesifikasi Dev 3:
 * Menunggu bayar (WAITING_PAYMENT) → Dibayar (PAID) → Dikonfirmasi (CONFIRMED) → Berjalan (ONGOING) → Selesai (COMPLETED)
 * Cabang: Kedaluwarsa (EXPIRED), Dibatalkan (CANCELLED) → Refund (REFUNDED)
 */
const ALLOWED_STATUS_TRANSITIONS = {
  WAITING_PAYMENT: ['PAID', 'EXPIRED', 'CANCELLED'],
  PAID: ['CONFIRMED', 'CANCELLED', 'REFUNDED'],
  CONFIRMED: ['ONGOING', 'CANCELLED', 'REFUNDED'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

const ORDER_INCLUDE = {
  customer: {
    select: { id: true, name: true, email: true, phone: true },
  },
  carType: true,
  carUnit: true,
  driver: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      driverProfile: true,
    },
  },
  payment: true,
};

function canTransitionStatus(currentStatus, nextStatus) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

/**
 * Ambil daftar order dengan filter opsional
 */
async function listOrders(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.customerId) where.customerId = Number(filters.customerId);
  if (filters.driverId) where.driverId = Number(filters.driverId);

  return prisma.order.findMany({
    where,
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Ambil detail 1 order berdasarkan ID atau orderCode
 */
async function getOrderById(idOrCode) {
  const isNumeric = !Number.isNaN(Number(idOrCode));
  const order = await prisma.order.findFirst({
    where: isNumeric ? { id: Number(idOrCode) } : { orderCode: String(idOrCode) },
    include: ORDER_INCLUDE,
  });

  if (!order) {
    const err = new Error('Order tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }

  return order;
}

/**
 * Ubah status order sesuai alur state machine + sinkronisasi status CarUnit + kirim Email & Socket.IO
 */
async function updateOrderStatus(orderId, nextStatus, options = {}) {
  const order = await getOrderById(orderId);

  if (order.status === nextStatus) {
    return order;
  }

  if (!options.force && !canTransitionStatus(order.status, nextStatus)) {
    const err = new Error(
      `Transisi status tidak valid dari ${order.status} ke ${nextStatus}. Status yang diizinkan: ${(
        ALLOWED_STATUS_TRANSITIONS[order.status] || []
      ).join(', ') || 'tidak ada'}`
    );
    err.statusCode = 400;
    throw err;
  }

  // Jika order hendak dimulai (ONGOING), pastikan unit plat sudah ditugaskan
  if (nextStatus === 'ONGOING' && !order.carUnitId) {
    const err = new Error('Order belum memiliki unit mobil (plat nomor) yang ditugaskan.');
    err.statusCode = 400;
    throw err;
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        ...(options.notes ? { notes: options.notes } : {}),
      },
      include: ORDER_INCLUDE,
    });

    // Sinkronisasi status unit mobil fisik
    if (updated.carUnitId) {
      if (nextStatus === 'ONGOING') {
        await tx.carUnit.update({
          where: { id: updated.carUnitId },
          data: { status: 'RENTED' },
        });
      } else if (['COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED'].includes(nextStatus)) {
        await tx.carUnit.update({
          where: { id: updated.carUnitId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    // Jika status berubah menjadi REFUNDED dan ada data Payment, update status payment juga
    if (nextStatus === 'REFUNDED' && updated.payment) {
      await tx.payment.update({
        where: { id: updated.payment.id },
        data: { status: 'REFUNDED' },
      });
    }

    return updated;
  });

  // Kirim update realtime ke pelanggan, driver, dan admin via Socket.IO
  emitOrderStatusUpdate(updatedOrder);

  // Kirim email notifikasi perubahan status (async tanpa memblokir response)
  sendOrderStatusEmail(updatedOrder).catch(() => {});

  return updatedOrder;
}

/**
 * Admin menugaskan unit mobil (plat nomor) dan driver ke order yang sudah dibayar (PAID → CONFIRMED)
 */
async function assignUnitAndDriver(orderId, { carUnitId, driverId }) {
  const order = await getOrderById(orderId);

  if (!['PAID', 'CONFIRMED'].includes(order.status)) {
    const err = new Error(
      `Penugasan unit & driver hanya bisa dilakukan pada order berstatus PAID atau CONFIRMED (status saat ini: ${order.status}).`
    );
    err.statusCode = 400;
    throw err;
  }

  if (!carUnitId) {
    const err = new Error('Unit mobil (plat nomor / carUnitId) wajib dipilih.');
    err.statusCode = 400;
    throw err;
  }

  if (order.serviceType === 'WITH_DRIVER' && !driverId) {
    const err = new Error('Order dengan layanan WITH_DRIVER wajib memilih driver (driverId).');
    err.statusCode = 400;
    throw err;
  }

  // Validasi ketersediaan unit mobil pada rentang waktu order
  const freeUnits = await getFreeUnitsByCarType(
    order.carTypeId,
    order.startTime,
    order.endTime,
    order.id
  );
  const isUnitFree = freeUnits.some((u) => u.id === Number(carUnitId));
  if (!isUnitFree) {
    const err = new Error('Unit mobil (plat nomor) yang dipilih tidak tersedia atau sedang dipakai pada jadwal tersebut.');
    err.statusCode = 400;
    throw err;
  }

  // Jika menggunakan driver, validasi driver sudah disetujui dan tidak bentrok jadwal
  if (driverId) {
    const freeDrivers = await getFreeDrivers(order.startTime, order.endTime, order.id);
    const isDriverFree = freeDrivers.some((d) => d.id === Number(driverId));
    if (!isDriverFree) {
      const err = new Error('Driver yang dipilih belum disetujui, sedang tidak aktif, atau bentrok dengan jadwal order lain.');
      err.statusCode = 400;
      throw err;
    }
  }

  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      carUnitId: Number(carUnitId),
      driverId: driverId ? Number(driverId) : null,
      status: 'CONFIRMED',
    },
    include: ORDER_INCLUDE,
  });

  // Broadcast perubahan status & penugasan ke pelanggan, driver terkait, dan admin
  emitOrderStatusUpdate(updatedOrder);
  sendOrderStatusEmail(updatedOrder).catch(() => {});

  return updatedOrder;
}

/**
 * Menandai order WAITING_PAYMENT yang sudah melewati batas waktu bayar menjadi EXPIRED
 */
async function expireOverdueOrders() {
  const now = new Date();
  const overdueOrders = await prisma.order.findMany({
    where: {
      status: 'WAITING_PAYMENT',
      paymentExpiresAt: { lt: now },
    },
  });

  const results = [];
  for (const order of overdueOrders) {
    const updated = await updateOrderStatus(order.id, 'EXPIRED');
    results.push(updated);
  }
  return results;
}

module.exports = {
  ALLOWED_STATUS_TRANSITIONS,
  canTransitionStatus,
  listOrders,
  getOrderById,
  updateOrderStatus,
  assignUnitAndDriver,
  expireOverdueOrders,
};
