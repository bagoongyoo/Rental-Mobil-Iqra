import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getActiveDriversLocationsApi } from '../api/driverApi';
import { connectSocket } from '../../../lib/socket';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

function loadLeafletAssets() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.L) {
      resolve(window.L);
      return;
    }

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L));
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

/**
 * Komponen Peta Leaflet + OpenStreetMap untuk Admin (Dev 3):
 * Menampilkan semua driver aktif & memperbarui posisi marker secara realtime via Socket.IO
 */
export function AdminDriverLiveMap({ defaultCenter = [-6.2088, 106.8456], defaultZoom = 12 }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const updateMapMarkers = useCallback((driverList) => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    driverList.forEach((driver) => {
      if (typeof driver.lat !== 'number' || typeof driver.lng !== 'number') return;

      const popupHtml = `
        <div style="font-family: sans-serif; font-size: 12px; min-width: 180px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">🚗 ${driver.name}</div>
          <div>No. HP: ${driver.phone || '-'}</div>
          <div>Status: <strong>${driver.activeOrder ? 'Sedang Bertugas' : driver.isReady ? 'Siap Jalan' : 'Standby'}</strong></div>
          ${
            driver.activeOrder
              ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
                   <div>Order: <strong>#${driver.activeOrder.orderCode}</strong></div>
                   <div>Mobil: ${driver.activeOrder.carName || '-'} (${driver.activeOrder.plateNumber || '-'})</div>
                   <div>Pelanggan: ${driver.activeOrder.customerName || '-'}</div>
                 </div>`
              : ''
          }
          <div style="margin-top: 4px; color: #64748b; font-size: 11px;">
            Update: ${driver.lastLocationAt ? new Date(driver.lastLocationAt).toLocaleTimeString('id-ID') : 'Baru saja'}
          </div>
        </div>
      `;

      if (markersRef.current[driver.driverId]) {
        markersRef.current[driver.driverId]
          .setLatLng([driver.lat, driver.lng])
          .setPopupContent(popupHtml);
      } else {
        const marker = L.marker([driver.lat, driver.lng])
          .addTo(map)
          .bindPopup(popupHtml);
        markersRef.current[driver.driverId] = marker;
      }
    });
  }, []);

  const fetchInitialDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActiveDriversLocationsApi();
      const list = res.data || [];
      setDrivers(list);
      updateMapMarkers(list);
    } catch {
      // Abaikan jika belum login sebagai ADMIN
    } finally {
      setLoading(false);
    }
  }, [updateMapMarkers]);

  useEffect(() => {
    let isMounted = true;

    loadLeafletAssets().then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current).setView(defaultCenter, defaultZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        mapInstanceRef.current = map;
      }

      fetchInitialDrivers();
    });

    const socket = connectSocket();
    if (socket) {
      const handleLocationUpdate = (payload) => {
        setDrivers((prev) => {
          const exists = prev.some((d) => d.driverId === payload.driverId);
          const next = exists
            ? prev.map((d) =>
                d.driverId === payload.driverId
                  ? { ...d, lat: payload.lat, lng: payload.lng, lastLocationAt: payload.timestamp }
                  : d
              )
            : [
                ...prev,
                {
                  driverId: payload.driverId,
                  name: `Driver #${payload.driverId}`,
                  isReady: true,
                  lat: payload.lat,
                  lng: payload.lng,
                  lastLocationAt: payload.timestamp,
                },
              ];
          updateMapMarkers(next);
          return next;
        });
      };

      socket.on('driver:location:update', handleLocationUpdate);
      return () => {
        isMounted = false;
        socket.off('driver:location:update', handleLocationUpdate);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [defaultCenter, defaultZoom, fetchInitialDrivers, updateMapMarkers]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            🗺️ Peta Lokasi Live Driver (Realtime)
          </h3>
          <p className="text-xs text-slate-500">
            Menampilkan {drivers.filter((d) => d.lat !== null).length} driver dengan titik GPS aktif
          </p>
        </div>
        <button
          type="button"
          onClick={fetchInitialDrivers}
          className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs font-semibold"
        >
          {loading ? 'Memuat...' : 'Segarkan'}
        </button>
      </div>

      <div
        ref={mapContainerRef}
        style={{ height: '420px', width: '100%' }}
        className="z-0 bg-slate-100"
      />
    </div>
  );
}

export default AdminDriverLiveMap;
