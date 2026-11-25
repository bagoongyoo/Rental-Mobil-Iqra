// Status order (Dev 3). Semua perubahan status lewat file ini supaya aturan transisinya satu tempat.
//
//   PENDING_PAYMENT -> PAID -> CONFIRMED -> ONGOING -> COMPLETED
//         |              |          |
//         v              v          v
//      EXPIRED       CANCELLED -> REFUNDED
//      CANCELLED
import { prisma } from '../../config/prisma.js';
import { broadcastBooking } from '../../sockets/index.js';
import { badRequest, notFound } from '../../utils/http.js';

const TRANSITIONS = {
  PENDING_PAYMENT: ['PAID', 'EXPIRED', 'CANCELLED'],
  PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ONGOING', 'CANCELLED'],
  ONGOING: ['COMPLETED'],
  CANCELLED: ['REFUNDED'],
  COMPLETED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export async function getBookingOr404(id) {
  const booking = await prisma.booking.findUnique({ where: { id: Number(id) } });
  if (!booking) throw notFound('Pesanan tidak ditemukan');
  return booking;
}

function assertTransition(booking, next) {
  if (!TRANSITIONS[booking.status]?.includes(next)) {
    throw badRequest(`Status pesanan tidak bisa diubah dari ${booking.status} ke ${next}`);
  }
}

async function save(booking, next, data = {}, tx = prisma) {
  assertTransition(booking, next);
  const updated = await tx.booking.update({ where: { id: booking.id }, data: { status: next, ...data } });
  return updated;
}

/** Pembayaran berhasil: status Dibayar + pemasukan otomatis di keuangan. Aman dipanggil berulang (idempotent). */
export async function markPaid(bookingId, paymentRef) {
  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw notFound('Pesanan tidak ditemukan');
    if (booking.status !== 'PENDING_PAYMENT' && booking.status !== 'EXPIRED') return null; // sudah diproses
    const now = new Date();
    const result = await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'PAID', paidAt: now, paymentRef },
    });
    await tx.transaction.create({
      data: {
        type: 'INCOME',
        category: booking.service === 'WITH_DRIVER' ? 'Sewa dengan driver' : 'Sewa lepas kunci',
        amount: booking.totalPrice,
        date: now,
        note: `Pembayaran ${booking.code}`,
        bookingId: booking.id,
        isAuto: true,
      },
    });
    return result;
  });
  if (updated) broadcastBooking(updated);
  return updated;
}

export async function markExpired(booking) {
  const updated = await save(booking, 'EXPIRED');
  broadcastBooking(updated);
  return updated;
}

export async function assign(booking, { unitId, driverId }) {
  const updated = await save(booking, 'CONFIRMED', { unitId, driverId: driverId ?? null });
  broadcastBooking(updated);
  return updated;
}

export async function start(booking) {
  const updated = await save(booking, 'ONGOING', { startedAt: new Date() });
  broadcastBooking(updated);
  return updated;
}

export async function complete(booking) {
  const updated = await save(booking, 'COMPLETED', { completedAt: new Date() });
  broadcastBooking(updated);
  return updated;
}

export async function cancel(booking, reason) {
  const updated = await save(booking, 'CANCELLED', { cancelledAt: new Date(), cancelReason: reason || null });
  broadcastBooking(updated);
  return updated;
}

/** Refund hanya untuk order yang sudah dibayar lalu dibatalkan. Dicatat sebagai pengeluaran. */
export async function refund(booking, adminId) {
  if (!booking.paidAt) throw badRequest('Pesanan ini belum pernah dibayar, tidak perlu refund');
  const updated = await prisma.$transaction(async (tx) => {
    const result = await save(booking, 'REFUNDED', {}, tx);
    await tx.transaction.create({
      data: {
        type: 'EXPENSE',
        category: 'Refund',
        amount: booking.totalPrice,
        date: new Date(),
        note: `Refund ${booking.code}`,
        bookingId: booking.id,
        isAuto: true,
        createdById: adminId,
      },
    });
    return result;
  });
  broadcastBooking(updated);
  return updated;
}

/** Dijalankan tiap menit: order yang lewat batas bayar menjadi Kedaluwarsa. */
export async function expireOverdueBookings() {
  const overdue = await prisma.booking.findMany({ where: { status: 'PENDING_PAYMENT', expiresAt: { lt: new Date() } } });
  for (const b of overdue) await markExpired(b);
  return overdue.length;
}
