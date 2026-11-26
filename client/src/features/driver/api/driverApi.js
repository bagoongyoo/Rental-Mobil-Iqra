import { useAuth } from '../../../lib/auth';
import { disconnectSocket } from '../../../lib/socket';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_API_BASE_URL ||
      (import.meta.env?.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : ''))) ||
  '/api';

export const MAX_CONDITION_PHOTO_BYTES = 1048576; // 1 MB (1.048.576 bytes)

function getStoredToken() {
  try {
    const zustandToken = useAuth.getState()?.token;
    if (zustandToken) return zustandToken;
  } catch {
    // Abaikan jika store belum siap
  }
  if (typeof window === 'undefined') return null;
  try {
    const direct = localStorage.getItem('token');
    if (direct) return direct;
    const persisted = JSON.parse(localStorage.getItem('iqra-auth') || '{}');
    return persisted?.state?.token || null;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    disconnectSocket();
  } catch {
    // Abaikan jika socket tidak aktif
  }
  try {
    useAuth.getState()?.logout?.();
  } catch {
    // Abaikan jika store tidak aktif
  }
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // Abaikan jika storage diblokir
  }
}

function getAuthHeaders(isJson = true) {
  const token = getStoredToken();
  const headers = {};
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response, { clearOnUnauthorized = true } = {}) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && clearOnUnauthorized && getStoredToken()) {
      clearStoredSession();
    }
    const err = new Error(data.message || `Request gagal dengan status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

/**
 * Kompres gambar menggunakan HTML5 Canvas hingga ukuran <= maxBytes (default 1 MB)
 */
export async function compressImageUnderLimit(file, maxBytes = MAX_CONDITION_PHOTO_BYTES) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Gagal membaca file gambar untuk dikompres.'));
      element.src = objectUrl;
    });

    const maxDimensions = [1600, 1280, 1024, 800, 640];
    const qualities = [0.82, 0.72, 0.6, 0.48, 0.36];
    let bestBlob = null;

    for (const maxDim of maxDimensions) {
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const width = Math.max(1, Math.round((img.width || 800) * scale));
      const height = Math.max(1, Math.round((img.height || 600) * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      for (const quality of qualities) {
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob) {
          bestBlob = blob;
          if (blob.size <= maxBytes) {
            const cleanName = (file.name || 'foto').replace(/\.\w+$/, '');
            return new File([blob], `${cleanName}-compressed.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
          }
        }
      }
    }

    if (bestBlob && bestBlob.size <= maxBytes) {
      const cleanName = (file.name || 'foto').replace(/\.\w+$/, '');
      return new File([bestBlob], `${cleanName}-compressed.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    throw new Error('Gambar terlalu besar untuk dikompres di bawah batas ukuran. Silakan pilih foto lain.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Mengambil gambar privat dari API menggunakan Authorization Bearer dan mengembalikan { previewUrl, blob }
 */
export async function fetchAuthorizedAsset(path) {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
    };
  } catch {
    return null;
  }
}

/**
 * Cek koneksi internet ke server API sebelum driver memulai tugas
 */
export async function checkServerConnectivity() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pendaftaran driver baru (FormData: name, email, password, phone, address, licenseNumber, simPhoto, profilePhoto)
 */
export async function registerDriverApi(formData) {
  const res = await fetch(`${API_BASE_URL}/drivers/register`, {
    method: 'POST',
    headers: getAuthHeaders(false),
    body: formData,
  });
  return handleResponse(res, { clearOnUnauthorized: false });
}

/**
 * Login khusus driver (mendukung akun driver dari pendaftaran Dev 3, seed Dev 1, maupun tambah driver Dev 1)
 */
export async function loginDriverApi({ email, password }) {
  const res = await fetch(`${API_BASE_URL}/drivers/login`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      password,
    }),
  });
  return handleResponse(res, { clearOnUnauthorized: false });
}

/**
 * Ambil data akun aktif dari endpoint auth bersama (Dev 1: GET /api/auth/me)
 */
export async function getAuthMeApi() {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Ambil profil driver yang sedang login
 */
export async function getMyDriverProfileApi() {
  const res = await fetch(`${API_BASE_URL}/drivers/me`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Ambil daftar tugas driver (filter: 'today' | 'active' | 'history')
 */
export async function getDriverTasksApi(filter = 'today') {
  const res = await fetch(`${API_BASE_URL}/drivers/me/tasks?filter=${encodeURIComponent(filter)}`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Ubah status Siap Jalan driver (wajib gpsGranted = true & koordinat lat/lng)
 */
export async function setDriverReadyApi({ isReady, gpsGranted, lat, lng }) {
  const res = await fetch(`${API_BASE_URL}/drivers/me/ready`, {
    method: 'PATCH',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ isReady, gpsGranted, lat, lng }),
  });
  return handleResponse(res);
}

/**
 * Mulai tugas order (CONFIRMED -> ONGOING, wajib GPS aktif)
 */
export async function startDriverTaskApi(orderId, { gpsGranted, lat, lng }) {
  const res = await fetch(`${API_BASE_URL}/drivers/me/tasks/${orderId}/start`, {
    method: 'PATCH',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ gpsGranted, lat, lng }),
  });
  return handleResponse(res);
}

/**
 * Selesaikan tugas order (ONGOING -> COMPLETED)
 */
export async function completeDriverTaskApi(orderId, { lat, lng, notes } = {}) {
  const res = await fetch(`${API_BASE_URL}/drivers/me/tasks/${orderId}/complete`, {
    method: 'PATCH',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ lat, lng, notes }),
  });
  return handleResponse(res);
}

/**
 * Ambil metadata 4 foto kondisi fisik unit mobil yang sudah tersimpan di server
 * GET ${API_BASE_URL}/drivers/me/tasks/${orderId}/condition-photos
 */
export async function getDriverConditionPhotosApi(orderId) {
  const res = await fetch(`${API_BASE_URL}/drivers/me/tasks/${orderId}/condition-photos`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Unggah 4 foto kondisi fisik unit mobil (maks 1 MB per foto) untuk order aktif
 * POST ${API_BASE_URL}/drivers/me/tasks/${orderId}/condition-photos
 */
export async function uploadDriverConditionPhotosApi(orderId, formData) {
  const res = await fetch(`${API_BASE_URL}/drivers/me/tasks/${orderId}/condition-photos`, {
    method: 'POST',
    headers: getAuthHeaders(false),
    body: formData,
  });
  return handleResponse(res);
}

/**
 * Kirim lokasi GPS driver via HTTP (sebagai fallback selain Socket.IO)
 */
export async function sendDriverLocationHttpApi({ orderId, lat, lng }) {
  const res = await fetch(`${API_BASE_URL}/tracking/location`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ orderId, lat, lng }),
  });
  return handleResponse(res);
}

/**
 * Ambil semua lokasi driver aktif untuk peta Leaflet Admin
 */
export async function getActiveDriversLocationsApi() {
  const res = await fetch(`${API_BASE_URL}/tracking/drivers`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Ambil lokasi live driver & riwayat rute untuk 1 order (Pelanggan / Admin)
 */
export async function getOrderTrackingApi(orderId) {
  const res = await fetch(`${API_BASE_URL}/tracking/orders/${orderId}`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Ambil daftar unit (plat nomor) & driver bebas untuk penugasan Admin
 */
export async function getAssignableResourcesApi({ carTypeId, startTime, endTime, excludeOrderId }) {
  const params = new URLSearchParams({
    carTypeId: String(carTypeId),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(excludeOrderId ? { excludeOrderId: String(excludeOrderId) } : {}),
  });
  const res = await fetch(`${API_BASE_URL}/availability/resources?${params.toString()}`, {
    headers: getAuthHeaders(true),
  });
  return handleResponse(res);
}

/**
 * Admin menugaskan plat unit & driver ke order yang sudah PAID
 */
export async function assignOrderUnitAndDriverApi(orderId, { carUnitId, driverId }) {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}/assign`, {
    method: 'PATCH',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ carUnitId, driverId }),
  });
  return handleResponse(res);
}
