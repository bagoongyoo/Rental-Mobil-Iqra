// Update status pesanan realtime untuk halaman pelanggan.
// Memakai koneksi Socket.IO dari lib/socket.js (Dev 3), event "order:status:update".
import { useEffect, useRef } from 'react';
import { connectSocket, joinOrderRoom, leaveOrderRoom } from './socket';
import { useAuth } from './auth';

/** Panggil `onUpdate(payload)` setiap status pesanan pelanggan berubah. `orderId` opsional. */
export function useOrderUpdates(onUpdate, orderId) {
  const token = useAuth((s) => s.token);
  const handler = useRef(onUpdate);
  handler.current = onUpdate;

  useEffect(() => {
    const socket = token ? connectSocket(token) : null;
    if (!socket) return undefined;
    const listener = (payload) => {
      if (!orderId || String(payload.orderId) === String(orderId)) handler.current(payload);
    };
    const join = () => orderId && joinOrderRoom(orderId);
    join();
    socket.on('connect', join);
    socket.on('order:status:update', listener);
    return () => {
      socket.off('connect', join);
      socket.off('order:status:update', listener);
      if (orderId) leaveOrderRoom(orderId);
    };
  }, [token, orderId]);
}
