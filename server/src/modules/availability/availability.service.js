const prisma = require('../../config/db');

const ACTIVE_ORDER_STATUSES = ['WAITING_PAYMENT', 'PAID', 'CONFIRMED', 'ONGOING'];
const ACTIVE_MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS'];

/**
 * Normalisasi rentang tanggal pencarian ketersediaan
 */
function parseDateRange(startTime, endTime) {
  const start = startTime ? new Date(startTime) : new Date();
  const end = endTime ? new Date(endTime) : new Date(start.getTime() + 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const err = new Error('Format tanggal startTime atau endTime tidak valid.');
    err.statusCode = 400;
    throw err;
  }

  if (end <= start) {
    const err = new Error('Waktu selesai (endTime) harus lebih besar dari waktu mulai (startTime).');
    err.statusCode = 400;
    throw err;
  }

  return { start, end };
}

/**
 * Engine Ketersediaan (Dev 3):
 * Stok = jumlah unit tipe X yang bebas di rentang tanggal (tidak sedang disewa & tidak sedang perawatan)
 */
async function searchAvailableCarTypes(filters = {}) {
  const { start, end } = parseDateRange(filters.startTime, filters.endTime);

  const whereCarType = {};
  if (filters.carTypeId) {
    whereCarType.id = Number(filters.carTypeId);
  }
  if (filters.transmission) {
    whereCarType.transmission = String(filters.transmission).toUpperCase();
  }
  if (filters.minCapacity) {
    whereCarType.capacity = { gte: Number(filters.minCapacity) };
  }

  // Ambil semua tipe mobil beserta unit, jadwal maintenance di rentang tanggal, dan order aktif yang beririsan
  const carTypes = await prisma.carType.findMany({
    where: whereCarType,
    include: {
      units: {
        include: {
          maintenances: {
            where: {
              status: { in: ACTIVE_MAINTENANCE_STATUSES },
              scheduledDate: {
                gte: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0),
                lte: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
              },
            },
            select: { id: true, scheduledDate: true, status: true },
          },
        },
      },
      orders: {
        where: {
          status: { in: ACTIVE_ORDER_STATUSES },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: {
          id: true,
          carUnitId: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return carTypes.map((ct) => {
    // Unit yang sudah di-assign ke order aktif di rentang waktu ini
    const busyUnitIds = new Set(
      ct.orders.filter((o) => o.carUnitId !== null).map((o) => o.carUnitId)
    );

    // Order aktif untuk tipe mobil ini yang belum di-assign plat unitnya (masih WAITING_PAYMENT / PAID)
    const unassignedActiveOrderCount = ct.orders.filter((o) => o.carUnitId === null).length;

    // Filter unit fisik yang benar-benar bebas (bukan status MAINTENANCE, tidak ada jadwal servis, tidak sedang dipakai order)
    const freeUnits = ct.units.filter((unit) => {
      if (unit.status === 'MAINTENANCE') return false;
      if (unit.maintenances && unit.maintenances.length > 0) return false;
      if (busyUnitIds.has(unit.id)) return false;
      return true;
    });

    // Stok bersih = jumlah unit bebas dikurangi order aktif yang belum ditugaskan unit spesifik
    const availableStock = Math.max(0, freeUnits.length - unassignedActiveOrderCount);

    return {
      id: ct.id,
      name: ct.name,
      capacity: ct.capacity,
      transmission: ct.transmission,
      photoUrl: ct.photoUrl,
      description: ct.description,
      prices: {
        price4HoursDriver: ct.price4HoursDriver,
        price12HoursDriver: ct.price12HoursDriver,
        priceDailySelfDrive: ct.priceDailySelfDrive,
        priceMonthlySelfDrive: ct.priceMonthlySelfDrive,
        priceYearlySelfDrive: ct.priceYearlySelfDrive,
      },
      totalUnits: ct.units.length,
      availableStock,
      isAvailable: availableStock > 0,
      freeUnits: freeUnits.map((u) => ({
        id: u.id,
        plateNumber: u.plateNumber,
        year: u.year,
        color: u.color,
        status: u.status,
      })),
    };
  });
}

/**
 * Mengambil daftar unit (plat nomor) yang bebas untuk tipe mobil tertentu di rentang waktu order
 * (Dipakai Admin saat menugaskan plat nomor ke order yang sudah PAID)
 */
async function getFreeUnitsByCarType(carTypeId, startTime, endTime, excludeOrderId = null) {
  const { start, end } = parseDateRange(startTime, endTime);

  const units = await prisma.carUnit.findMany({
    where: {
      carTypeId: Number(carTypeId),
      status: { not: 'MAINTENANCE' },
    },
    include: {
      maintenances: {
        where: {
          status: { in: ACTIVE_MAINTENANCE_STATUSES },
          scheduledDate: {
            gte: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0),
            lte: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
          },
        },
      },
      orders: {
        where: {
          ...(excludeOrderId ? { id: { not: Number(excludeOrderId) } } : {}),
          status: { in: ACTIVE_ORDER_STATUSES },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      },
    },
    orderBy: { plateNumber: 'asc' },
  });

  return units
    .filter((u) => u.maintenances.length === 0 && u.orders.length === 0)
    .map((u) => ({
      id: u.id,
      plateNumber: u.plateNumber,
      carTypeId: u.carTypeId,
      year: u.year,
      color: u.color,
      status: u.status,
    }));
}

/**
 * Mengambil daftar driver aktif & sudah disetujui yang tidak bentrok jadwal di rentang tanggal order
 */
async function getFreeDrivers(startTime, endTime, excludeOrderId = null) {
  const { start, end } = parseDateRange(startTime, endTime);

  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      isActive: true,
      isApproved: true,
      driverProfile: {
        approvalStatus: 'APPROVED',
      },
    },
    include: {
      driverProfile: true,
      driverOrders: {
        where: {
          ...(excludeOrderId ? { id: { not: Number(excludeOrderId) } } : {}),
          status: { in: ['CONFIRMED', 'ONGOING'] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return drivers
    .filter((d) => d.driverOrders.length === 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      phone: d.phone,
      licenseNumber: d.driverProfile?.licenseNumber || null,
      isReady: d.driverProfile?.isReady || false,
      lastLat: d.driverProfile?.lastLat || null,
      lastLng: d.driverProfile?.lastLng || null,
    }));
}

module.exports = {
  parseDateRange,
  searchAvailableCarTypes,
  getFreeUnitsByCarType,
  getFreeDrivers,
};
