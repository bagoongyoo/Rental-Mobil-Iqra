// Engine ketersediaan (Dev 3).
// Stok tipe X di kota K untuk rentang [start, end) =
//   unit aktif tipe X di kota K yang tidak sedang dijadwalkan perawatan di rentang itu
//   dikurangi order aktif yang bentrok di rentang itu (sudah atau belum ditugaskan unit).
import { prisma } from '../../config/prisma.js';

export const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'ONGOING'];

/** Kondisi Prisma untuk order yang masih memakan stok dan bentrok dengan [start, end). */
export function overlappingBookingWhere(start, end) {
  const now = new Date();
  return {
    startAt: { lt: end },
    endAt: { gt: start },
    OR: [
      { status: { in: ['PAID', 'CONFIRMED', 'ONGOING'] } },
      { status: 'PENDING_PAYMENT', expiresAt: { gt: now } },
    ],
  };
}

/** Unit tipe tertentu yang bebas perawatan di rentang waktu. */
export async function eligibleUnits({ carTypeId, city, start, end }) {
  return prisma.carUnit.findMany({
    where: {
      carTypeId,
      ...(city ? { city } : {}),
      status: 'ACTIVE',
      maintenances: { none: { status: 'SCHEDULED', startDate: { lt: end }, endDate: { gt: start } } },
    },
    orderBy: { plate: 'asc' },
  });
}

/** Map carTypeId -> jumlah unit tersedia. */
export async function availabilityByType({ city, start, end, excludeBookingId, db = prisma }) {
  const units = await db.carUnit.findMany({
    where: {
      ...(city ? { city } : {}),
      status: 'ACTIVE',
      carType: { isActive: true },
      maintenances: { none: { status: 'SCHEDULED', startDate: { lt: end }, endDate: { gt: start } } },
    },
    select: { id: true, carTypeId: true },
  });
  const bookings = await db.booking.findMany({
    where: {
      ...overlappingBookingWhere(start, end),
      ...(city ? { city } : {}),
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { carTypeId: true },
  });
  const stock = new Map();
  for (const u of units) stock.set(u.carTypeId, (stock.get(u.carTypeId) || 0) + 1);
  for (const b of bookings) stock.set(b.carTypeId, (stock.get(b.carTypeId) || 0) - 1);
  return stock;
}

/** Unit yang bisa ditugaskan ke sebuah order (bebas perawatan dan tidak dipakai order lain). */
export async function assignableUnits(booking) {
  const units = await eligibleUnits({ carTypeId: booking.carTypeId, city: booking.city, start: booking.startAt, end: booking.endAt });
  const taken = await prisma.booking.findMany({
    where: { ...overlappingBookingWhere(booking.startAt, booking.endAt), id: { not: booking.id }, unitId: { not: null } },
    select: { unitId: true },
  });
  const takenIds = new Set(taken.map((t) => t.unitId));
  return units.filter((u) => !takenIds.has(u.id));
}

/** Driver aktif yang tidak punya tugas lain di rentang waktu order. */
export async function assignableDrivers(booking) {
  const drivers = await prisma.user.findMany({
    where: { role: 'DRIVER', status: 'ACTIVE' },
    select: { id: true, name: true, phone: true, driverProfile: { select: { isReady: true, lastSeenAt: true } } },
    orderBy: { name: 'asc' },
  });
  const busy = await prisma.booking.findMany({
    where: { ...overlappingBookingWhere(booking.startAt, booking.endAt), id: { not: booking.id }, driverId: { not: null } },
    select: { driverId: true },
  });
  const busyIds = new Set(busy.map((b) => b.driverId));
  return drivers.filter((d) => !busyIds.has(d.id));
}
