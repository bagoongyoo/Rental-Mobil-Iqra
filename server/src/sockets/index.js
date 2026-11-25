const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let ioInstance = null;

/**
 * Inisialisasi Socket.IO Server (Dev 3 - Realtime Lokasi Driver & Status Order)
 */
function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Middleware autentikasi JWT untuk koneksi Socket.IO
  ioInstance.use((socket, next) => {
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
      socket.user = decoded; // { id, email, role }
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
    socket.on('driver:location', (payload) => {
      if (role !== 'DRIVER') return;

      const { orderId, lat, lng } = payload || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const locationUpdate = {
        driverId: userId,
        orderId: orderId || null,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      };

      // Kirim live update ke semua Admin (peta pemantauan semua driver aktif)
      ioInstance.to('role:ADMIN').emit('driver:location:update', locationUpdate);

      // Jika terkait order aktif, kirim juga ke pelanggan di room order tersebut
      if (orderId) {
        ioInstance.to(`order:${orderId}`).emit('driver:location:update', locationUpdate);
      }
    });

    socket.on('disconnect', () => {
      // Koneksi socket terputus
    });
  });

  return ioInstance;
}

/**
 * Mengambil instance Socket.IO dari service/controller lain
 * (misalnya untuk emit perubahan status order ke pelanggan)
 */
function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO belum diinisialisasi. Panggil initSocket(httpServer) terlebih dahulu.');
  }
  return ioInstance;
}

module.exports = {
  initSocket,
  getIO,
};
