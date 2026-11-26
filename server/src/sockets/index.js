const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

let ioInstance = null;

function isAllowedSocketOrigin(origin) {
  if (!origin) return true;
  const configuredOrigins = String(process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (configuredOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production') {
    return /^https?:\/\/(localhost|127\.0\.0\.1):517\d$/.test(origin);
  }
  return false;
}

/**
 * Inisialisasi Socket.IO Server (Dev 3 - Realtime Lokasi Driver & Status Order)
 */
function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedSocketOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin Socket.IO tidak diizinkan: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Middleware autentikasi JWT untuk koneksi Socket.IO (sinkron dengan status akun Dev 1)
  ioInstance.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.split(' ')[1]
          : null);

      if (!token) {
        return next(new Error('AUTH_REQUIRED: Token JWT diperlukan untuk koneksi Socket.IO'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const dbUser = await prisma.user.findUnique({
        where: { id: Number(decoded.id) },
        select: { id: true, email: true, role: true, name: true, isActive: true, isApproved: true },
      });

      if (!dbUser || !dbUser.isActive) {
        return next(new Error('ACCOUNT_BLOCKED: Akun tidak aktif atau diblokir oleh Admin'));
      }
      if (dbUser.role === 'DRIVER' && !dbUser.isApproved) {
        return next(new Error('DRIVER_UNAPPROVED: Akun driver belum disetujui oleh Admin'));
      }

      socket.user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        name: dbUser.name,
      };
      return next();
    } catch (err) {
      return next(new Error('AUTH_INVALID: Token JWT tidak valid atau kedaluwarsa'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const { id: userId, role } = socket.user;

    // Otomatis gabung ke room pribadi user dan room per role
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);

    // Pelanggan / Driver / Admin bergabung ke room spesifik order
    socket.on('order:join', (orderId) => {
      if (orderId) {
        socket.join(`order:${orderId}`);
      }
    });

    socket.on('order:leave', (orderId) => {
      if (orderId) {
        socket.leave(`order:${orderId}`);
      }
    });

    // Driver mengirim lokasi GPS live (misal tiap 10 detik)
    socket.on('driver:location', async (payload, ack) => {
      try {
        if (role !== 'DRIVER') {
          if (typeof ack === 'function') ack({ success: false, message: 'Hanya driver yang dapat mengirim lokasi' });
          return;
        }

        const { orderId, lat, lng, accuracy } = payload || {};
        const parsedLat = Number(lat);
        const parsedLng = Number(lng);
        const parsedAccuracy = accuracy != null && !Number.isNaN(Number(accuracy)) ? Number(accuracy) : null;

        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
          if (typeof ack === 'function') ack({ success: false, message: 'Koordinat lat/lng tidak valid' });
          return;
        }

        const now = new Date();
        const parsedOrderId = orderId ? Number(orderId) : null;

        // Simpan lokasi terakhir ke DriverProfile & riwayat ringkas ke DriverLocationLog
        await Promise.all([
          prisma.driverProfile.upsert({
            where: { userId: Number(userId) },
            update: {
              lastLat: parsedLat,
              lastLng: parsedLng,
              lastLocationAt: now,
            },
            create: {
              userId: Number(userId),
              licenseNumber: `SIM-${userId}`,
              lastLat: parsedLat,
              lastLng: parsedLng,
              lastLocationAt: now,
            },
          }),
          prisma.driverLocationLog.create({
            data: {
              driverId: Number(userId),
              orderId: parsedOrderId && !Number.isNaN(parsedOrderId) ? parsedOrderId : null,
              lat: parsedLat,
              lng: parsedLng,
              recordedAt: now,
            },
          }),
        ]);

        const locationUpdate = {
          driverId: Number(userId),
          name: socket.user.name || null,
          orderId: parsedOrderId,
          lat: parsedLat,
          lng: parsedLng,
          accuracy: parsedAccuracy,
          timestamp: now.toISOString(),
        };

        // Kirim live update ke semua Admin (komponen peta semua driver aktif)
        ioInstance.to('role:ADMIN').emit('driver:location:update', locationUpdate);

        // Jika terkait order aktif, kirim juga ke pelanggan di room order tersebut
        if (parsedOrderId) {
          ioInstance.to(`order:${parsedOrderId}`).emit('driver:location:update', locationUpdate);
        }

        if (typeof ack === 'function') ack({ success: true, data: locationUpdate });
      } catch (error) {
        console.error('[Socket driver:location Error]:', error.message);
        if (typeof ack === 'function') ack({ success: false, message: error.message });
      }
    });

    socket.on('disconnect', () => {
      if (role === 'DRIVER') {
        ioInstance.to('role:ADMIN').emit('driver:offline', {
          driverId: Number(userId),
          name: socket.user.name || null,
          at: new Date().toISOString(),
        });
      }
    });
  });

  return ioInstance;
}

/**
 * Mengambil instance Socket.IO dari service/controller lain
 */
function getIO() {
  return ioInstance;
}

/**
 * Helper untuk broadcast perubahan status order secara realtime ke Pelanggan, Driver, dan Admin
 */
function emitOrderStatusUpdate(order) {
  if (!ioInstance || !order) return;

  const payload = {
    orderId: order.id,
    orderCode: order.orderCode,
    status: order.status,
    carUnitId: order.carUnitId || null,
    driverId: order.driverId || null,
    updatedAt: order.updatedAt || new Date().toISOString(),
    order,
  };

  ioInstance.to(`order:${order.id}`).emit('order:status:update', payload);
  if (order.customerId) {
    ioInstance.to(`user:${order.customerId}`).emit('order:status:update', payload);
  }
  if (order.driverId) {
    ioInstance.to(`user:${order.driverId}`).emit('order:status:update', payload);
  }
  ioInstance.to('role:ADMIN').emit('order:status:update', payload);
}

module.exports = {
  initSocket,
  getIO,
  emitOrderStatusUpdate,
};
