import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket, emitDriverLocation } from '../../../lib/socket';
import { sendDriverLocationHttpApi } from '../api/driverApi';

/**
 * Hook Geolocation GPS Driver (Dev 3):
 * 1. Meminta izin Geolocation API sebelum status "Siap Jalan" atau sebelum mulai tugas.
 * 2. Jika ditolak (permissionStatus === 'denied'), driver tidak bisa mulai tugas.
 * 3. Mengirim lokasi berkala tiap 10 detik via Socket.IO selama ada tugas yang berstatus ONGOING.
 */
export function useDriverLiveLocation({ activeOrderId = null, isTaskOngoing = false, intervalMs = 10000 } = {}) {
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'unsupported'
  const [coords, setCoords] = useState(null); // { lat, lng, accuracy, timestamp }
  const [gpsError, setGpsError] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const coordsRef = useRef(null);

  const requestLocationPermission = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        const msg = 'Perangkat atau browser ini tidak mendukung fitur GPS (Geolocation API).';
        setPermissionStatus('unsupported');
        setGpsError(msg);
        reject(new Error(msg));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString(),
          };
          coordsRef.current = current;
          setCoords(current);
          setPermissionStatus('granted');
          setGpsError(null);
          resolve(current);
        },
        (error) => {
          let message = 'Gagal mendapatkan lokasi GPS.';
          if (error.code === error.PERMISSION_DENIED) {
            setPermissionStatus('denied');
            message =
              'Izin lokasi (GPS) ditolak. Anda wajib mengizinkan akses lokasi di browser/HP sebelum bisa Siap Jalan atau Mulai Tugas.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            message = 'Sinyal GPS tidak tersedia. Pastikan GPS di HP Anda menyala.';
          } else if (error.code === error.TIMEOUT) {
            message = 'Waktu permintaan GPS habis. Coba lagi di tempat dengan sinyal lebih baik.';
          }
          setGpsError(message);
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);

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
        coordsRef.current = current;
        setCoords(current);
        setGpsError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          setGpsError('Izin lokasi (GPS) dicabut. Harap aktifkan kembali izin lokasi.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [permissionStatus]);

  // Kirim lokasi berkala setiap 10 detik via Socket.IO selama tugas berjalan (ONGOING)
  useEffect(() => {
    if (!isTaskOngoing || permissionStatus !== 'granted') {
      return undefined;
    }

    connectSocket();

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
    requestLocationPermission,
  };
}
