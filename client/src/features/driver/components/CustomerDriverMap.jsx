import React, { useEffect, useRef, useState } from 'react';
import { getOrderTrackingApi } from '../api/driverApi';
import { connectSocket, joinOrderRoom, leaveOrderRoom } from '../../../lib/socket';

/**
 * Komponen Peta Leaflet untuk Pelanggan memantau posisi live driver pada ordernya (Dev 3)
 */
export function CustomerDriverMap({ orderId }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [tracking, setTracking] = useState(null);

  useEffect(() => {
    if (!orderId) return undefined;

    let isMounted = true;

    async function init() {
      try {
        const res = await getOrderTrackingApi(orderId);
        if (!isMounted) return;
        setTracking(res.data);

        const L = window.L;
        if (L && mapContainerRef.current && res.data?.driver?.lat && res.data?.driver?.lng) {
          const { lat, lng, name } = res.data.driver;
          if (!mapInstanceRef.current) {
            const map = L.map(mapContainerRef.current).setView([lat, lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '&copy; OpenStreetMap contributors',
            }).addTo(map);
            mapInstanceRef.current = map;
          }
          if (!markerRef.current) {
            markerRef.current = L.marker([lat, lng])
              .addTo(mapInstanceRef.current)
              .bindPopup(`Driver: ${name}`);
          } else {
            markerRef.current.setLatLng([lat, lng]);
          }
        }
      } catch {
        // Abaikan jika order belum memiliki lokasi driver
      }
    }

    init();

    const socket = connectSocket();
    if (socket) {
      joinOrderRoom(orderId);
      const handleUpdate = (payload) => {
        if (Number(payload.orderId) !== Number(orderId)) return;
        setTracking((prev) =>
          prev
            ? {
                ...prev,
                driver: {
                  ...prev.driver,
                  lat: payload.lat,
                  lng: payload.lng,
                  lastLocationAt: payload.timestamp,
                },
              }
            : prev
        );
        if (markerRef.current && mapInstanceRef.current) {
          markerRef.current.setLatLng([payload.lat, payload.lng]);
          mapInstanceRef.current.panTo([payload.lat, payload.lng]);
        }
      };

      socket.on('driver:location:update', handleUpdate);
      return () => {
        isMounted = false;
        leaveOrderRoom(orderId);
        socket.off('driver:location:update', handleUpdate);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">
            📍 Posisi Live Driver: {tracking?.driver?.name || 'Menunggu Penugasan'}
          </p>
          <p className="text-slate-500">
            Plat Nomor: {tracking?.plateNumber || '-'} | Status: {tracking?.status || '-'}
          </p>
        </div>
      </div>
      <div ref={mapContainerRef} style={{ height: '300px', width: '100%' }} className="bg-slate-100" />
    </div>
  );
}

export default CustomerDriverMap;
