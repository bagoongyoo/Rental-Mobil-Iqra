const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000/api';

function getAuthHeaders(isJson = true) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = {};
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request gagal dengan status ${response.status}`);
  }
  return data;
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
  return handleResponse(res);
}

/**
 * Login khusus driver (ditolak jika belum disetujui Admin)
 */
export async function loginDriverApi({ email, password }) {
  const res = await fetch(`${API_BASE_URL}/drivers/login`, {
    method: 'POST',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ email, password }),
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
