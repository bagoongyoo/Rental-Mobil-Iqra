const prisma = require('../../config/db');
const { getIO } = require('../../sockets');

/**
 * Simpan lokasi terakhir per driver (DriverProfile) dan riwayat ringkas per order (DriverLocationLog)
 */
async function recordDriverLocation(driverUserId, { orderId, lat, lng }) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    const err = new Error('Koordinat latitude dan longitude wajib berupa angka yang valid.');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const parsedOrderId = orderId ? Number(orderId) : null;

  const [profile, logEntry] = await Promise.all([
    prisma.driverProfile.upsert({
      where: { userId: Number(driverUserId) },
      update: {
        lastLat: parsedLat,
        lastLng: parsedLng,
        lastLocationAt: now,
      },
      create: {
        userId: Number(driverUserId),
        licenseNumber: `SIM-${driverUserId}`,
        lastLat: parsedLat,
        lastLng: parsedLng,
        lastLocationAt: now,
      },
    }),
    prisma.driverLocationLog.create({
      data: {
        driverId: Number(driverUserId),
        orderId: parsedOrderId && !Number.isNaN(parsedOrderId) ? parsedOrderId : null,
        lat: parsedLat,
        lng: parsedLng,
        recordedAt: now,
      },
    }),
  ]);

  const locationUpdate = {
    driverId: Number(driverUserId),
    orderId: parsedOrderId,
    lat: parsedLat,
    lng: parsedLng,
    timestamp: now.toISOString(),
  };

  // Broadcast realtime via Socket.IO ke Admin dan ke pelanggan di room order terkait
  const io = getIO();
  if (io) {
    io.to('role:ADMIN').emit('driver:location:update', locationUpdate);
    if (parsedOrderId) {
      io.to(`order:${parsedOrderId}`).emit('driver:location:update', locationUpdate);
    }
  }

  return { profile, logEntry, locationUpdate };
}

/**
 * Ambil posisi terakhir semua driver aktif untuk peta Leaflet Admin
 */
async function getActiveDriversForAdminMap() {
  const drivers = await prisma.user.findMany({
    where: {
      role: 'DRIVER',
      isActive: true,
      isApproved: true,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      driverProfile: true,
      driverOrders: {
        where: {
          status: { in: ['CONFIRMED', 'ONGOING'] },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          carType: { select: { id: true, name: true } },
          carUnit: { select: { id: true, plateNumber: true, color: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 1,
      },
    },
  });

  return drivers.map((d) => {
    const activeOrder = d.driverOrders[0] || null;
    return {
      driverId: d.id,
      name: d.name,
      phone: d.phone,
      isReady: d.driverProfile?.isReady || false,
      lat: d.driverProfile?.lastLat ?? null,
      lng: d.driverProfile?.lastLng ?? null,
      lastLocationAt: d.driverProfile?.lastLocationAt ?? null,
      activeOrder: activeOrder
        ? {
            id: activeOrder.id,
            orderCode: activeOrder.orderCode,
            status: activeOrder.status,
            customerName: activeOrder.customer?.name,
            carName: activeOrder.carType?.name,
            plateNumber: activeOrder.carUnit?.plateNumber,
            pickupAddress: activeOrder.pickupAddress,
          }
        : null,
    };
  });
}

/**
 * Ambil lokasi driver & riwayat koordinat ringkas untuk 1 order tertentu (dipakai Admin / Pelanggan)
 */
async function getOrderTracking(orderId, requesterUser = null) {
  const order = await prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          driverProfile: true,
        },
      },
      carType: { select: { id: true, name: true } },
      carUnit: { select: { id: true, plateNumber: true, color: true } },
      locationLogs: {
        orderBy: { recordedAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!order) {
    const err = new Error('Order tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }

  if (requesterUser?.role === 'CUSTOMER' && order.customerId !== requesterUser.id) {
    const err = new Error('Anda tidak memiliki izin melihat lokasi order ini.');
    err.statusCode = 403;
    throw err;
  }

  return {
    orderId: order.id,
    orderCode: order.orderCode,
    status: order.status,
    carName: order.carType?.name || null,
    plateNumber: order.carUnit?.plateNumber || null,
    driver: order.driver
      ? {
          id: order.driver.id,
          name: order.driver.name,
          phone: order.driver.phone,
          lat: order.driver.driverProfile?.lastLat ?? null,
          lng: order.driver.driverProfile?.lastLng ?? null,
          lastLocationAt: order.driver.driverProfile?.lastLocationAt ?? null,
        }
      : null,
    history: order.locationLogs.map((l) => ({
      id: l.id,
      lat: l.lat,
      lng: l.lng,
      recordedAt: l.recordedAt,
    })),
  };
}

module.exports = {
  recordDriverLocation,
  getActiveDriversForAdminMap,
  getOrderTracking,
};
