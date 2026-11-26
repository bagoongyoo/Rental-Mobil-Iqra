import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket, emitDriverLocation } from '../../../lib/socket';
import { useAuth } from '../../../lib/auth';
import { sendDriverLocationHttpApi } from '../api/driverApi';
import { getPreciseLocation, isBetterFix } from '../../../lib/preciseLocation';
import i18n from '../../../lib/i18n';

const msg = (key) => i18n.t(`driver.gpsError.${key}`);

/** Penyegaran GPS akurat berkala untuk menjaga ketepatan lokasi driver. */
export const GPS_REFRESH_MS = 5 * 60 * 1000;

/**
 * Hook Geolocation GPS Driver (Dev 3):
 * 1. Meminta izin Geolocation API sebelum status "Siap Jalan" atau sebelum mulai tugas.
 * 2. Jika ditolak (permissionStatus === 'denied'), driver tidak bisa mulai tugas.
 * 3. Mengirim lokasi berkala tiap 10 detik via Socket.IO selama ada tugas yang berstatus ONGOING.
 * 4. Setiap 5 menit mengambil ulang posisi GPS akurat (posisi baru, bukan cache) dan
 *    mengirimnya ke server selama driver Siap Jalan atau sedang bertugas (`shareLocation`).
 * Titik GPS diambil seakurat mungkin (lib/preciseLocation): dipertajam sampai ≤ 20 m,
 * dan bacaan kasar sesaat tidak menimpa posisi yang sudah akurat.
 */
export function useDriverLiveLocation({ activeOrderId = null, isTaskOngoing = false, intervalMs = 10000, shareLocation = false } = {}) {
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'unsupported'
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy, timestamp }
  const [gpsError, setGpsError] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const coordsRef = useRef(null);

  const saveFix = useCallback((fix) => {
    coordsRef.current = fix;
    setCoords(fix);
    setGpsError(null);
  }, []);

  const requestLocationPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const text = msg('unsupported');
      setPermissionStatus('unsupported');
      setGpsError(text);
      throw new Error(text);
    }

    // Posisi yang sedang dipantau masih segar & akurat → langsung dipakai (tombol tidak menunggu).
    const recent = coordsRef.current;
    if (recent && Date.now() - new Date(recent.timestamp).getTime() < 15000 && recent.accuracy <= 50) {
      setPermissionStatus('granted');
      return recent;
    }

    try {
      // Titik pertama langsung dipakai, lalu dipertajam selama maksimal 15 detik.
      const fix = await getPreciseLocation({ maxWaitMs: 15000, onProgress: saveFix });
      saveFix(fix);
      setPermissionStatus('granted');
      setLastRefreshAt(new Date().toISOString());
      return fix;
    } catch (error) {
      let message = msg('failed');
      if (error.code === 1) {
        setPermissionStatus('denied');
        message = msg('denied');
      } else if (error.code === 2) {
        message = msg('unavailable');
      } else if (error.code === 3) {
        message = msg('timeout');
      }
      setGpsError(message);
      throw new Error(message);
    }
  }, [saveFix]);

  // Halaman dibuka ulang & izin lokasi sudah pernah diberikan → GPS langsung aktif lagi
  // (tanpa menunggu driver menekan tombol), supaya penyegaran 5 menit tetap berjalan.
  useEffect(() => {
    let cancelled = false;
    navigator.permissions?.query({ name: 'geolocation' })
      .then((status) => {
        if (!cancelled && status.state === 'granted') requestLocationPermission().catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [requestLocationPermission]);

  // Pantau pergerakan posisi GPS saat izin sudah diberikan
  useEffect(() => {
    if (permissionStatus !== 'granted' || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toISOString(),
        };
        // Abaikan lonjakan bacaan kasar (mis. GPS sesaat jatuh ke WiFi/BTS).
        if (isBetterFix(current, coordsRef.current)) saveFix(current);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          setGpsError(msg('revoked'));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [permissionStatus, saveFix]);

  // Penyegaran GPS akurat tiap 5 menit: ambil posisi baru lalu kirim ke server
  // (posisi terakhir driver di peta admin & pelanggan tetap tepat walau driver diam).
  useEffect(() => {
    if (permissionStatus !== 'granted' || !(shareLocation || isTaskOngoing)) {
      return undefined;
    }

    const refresh = async () => {
      try {
        const fix = await getPreciseLocation({ maxWaitMs: 20000 });
        saveFix(fix);
        setLastRefreshAt(new Date().toISOString());
        const payload = { orderId: activeOrderId, lat: fix.lat, lng: fix.lng };
        if (!emitDriverLocation(payload)) await sendDriverLocationHttpApi(payload);
        setLastSentAt(new Date().toISOString());
      } catch (err) {
        if (err?.code === 1) {
          setPermissionStatus('denied');
          setGpsError(msg('revoked'));
        }
      }
    };

    const activeToken = useAuth.getState()?.token || localStorage.getItem('token');
    connectSocket(activeToken);
    const timer = setInterval(refresh, GPS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [permissionStatus, shareLocation, isTaskOngoing, activeOrderId, saveFix]);

  // Kirim lokasi berkala setiap 10 detik via Socket.IO selama tugas berjalan (ONGOING)
  useEffect(() => {
    if (!isTaskOngoing || permissionStatus !== 'granted') {
      return undefined;
    }

    const activeToken = useAuth.getState()?.token || localStorage.getItem('token');
    connectSocket(activeToken);

    const sendCurrentLocation = async () => {
      try {
        let current = coordsRef.current;
        if (!current) {
          current = await requestLocationPermission();
        }
        if (!current) return;

        const payload = {
          orderId: activeOrderId,
          lat: current.lat,
          lng: current.lng,
        };

        const sentViaSocket = emitDriverLocation(payload);
        if (!sentViaSocket) {
          await sendDriverLocationHttpApi(payload);
        }
        setLastSentAt(new Date().toISOString());
      } catch {
        // Abaikan error sementara saat pengiriman berkala
      }
    };

    // Kirim langsung saat mulai, lalu ulangi tiap 10 detik
    sendCurrentLocation();
    const timer = setInterval(sendCurrentLocation, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [isTaskOngoing, activeOrderId, permissionStatus, intervalMs, requestLocationPermission]);

  return {
    permissionStatus,
    isGpsGranted: permissionStatus === 'granted',
    coords,
    gpsError,
    lastSentAt,
    lastRefreshAt,
    requestLocationPermission,
  };
}
