import { useAuth } from './auth';

const BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** fetch ke backend. Otomatis menyisipkan token JWT dan membaca pesan error dari server. */
export async function api(path, { method = 'GET', body, query, raw } = {}) {
  const url = new URL(`${BASE}/api${path}`, window.location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  const headers = {};
  const token = useAuth.getState().token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && token) useAuth.getState().logout();
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).message || res.statusText);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || res.statusText, data.details);
  return data;
}

export const assetUrl = (p) => (p ? `${BASE}${p}` : null);

/** Unduh file (CSV, gambar privat) dengan token, kembalikan Blob. */
export async function apiBlob(path, query) {
  const res = await api(path, { query, raw: true });
  return res.blob();
}
