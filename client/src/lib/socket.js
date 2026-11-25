import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

let socket = null;

/**
 * Menghubungkan Socket.IO client menggunakan token JWT
 * @param {string} token - JWT token user yang sedang login
 */
export function connectSocket(token) {
  const authToken = token || localStorage.getItem('token');
  if (!authToken) return null;

  if (socket && socket.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  return socket;
}

/**
 * Mengambil instance socket yang sedang aktif
 */
export function getSocket() {
  return socket;
}

/**
 * Memutuskan koneksi Socket.IO (misalnya saat logout)
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Bergabung ke room order tertentu untuk menerima update status & lokasi driver live
 */
export function joinOrderRoom(orderId) {
  if (socket && orderId) {
    socket.emit('order:join', orderId);
  }
}

/**
 * Keluar dari room order tertentu
 */
export function leaveOrderRoom(orderId) {
  if (socket && orderId) {
    socket.emit('order:leave', orderId);
  }
}

/**
 * Mengirim lokasi GPS driver secara berkala (tiap 10 detik selama tugas berjalan)
 */
export function emitDriverLocation({ orderId, lat, lng }, callback) {
  if (!socket || !socket.connected) return false;
  socket.emit('driver:location', { orderId, lat, lng }, callback);
  return true;
}
