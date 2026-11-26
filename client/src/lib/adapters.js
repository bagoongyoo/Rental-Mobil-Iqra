// Penerjemah data server (skema bersama: Order, CarType, UserDocument) ke bentuk yang dipakai halaman pelanggan.
// Server membalas { success, data }. Halaman pelanggan cukup memanggil fungsi di sini,
// jadi kalau nama kolom di server berubah, yang perlu disesuaikan hanya file ini.
import { api } from './api';

const PRICE_FIELDS = {
  HOURS_4: 'price4HoursDriver',
  HOURS_12: 'price12HoursDriver',
  DAILY: 'priceDailySelfDrive',
  MONTHLY: 'priceMonthlySelfDrive',
  YEARLY: 'priceYearlySelfDrive',
};

// CarType di skema bersama belum punya kategori. Tebak dari nama untuk ikon & filter.
function guessCategory(name = '') {
  if (/alphard|vellfire|camry|premium/i.test(name)) return 'PREMIUM';
  if (/hiace|elf|van/i.test(name)) return 'VAN';
  if (/fortuner|pajero|rush|terios|crv|cr-v|suv/i.test(name)) return 'SUV';
  if (/brio|agya|ayla|jazz|yaris|hatch/i.test(name)) return 'HATCHBACK';
  if (/vios|civic|city|sedan/i.test(name)) return 'SEDAN';
  return 'MPV';
}

/** CarType mentah (atau hasil /availability) → bentuk untuk UI. Harga 0 = paket tidak tersedia. */
export function toCarType(ct) {
  if (!ct) return null;
  const p = ct.prices || ct;
  const price = (field) => (p[field] > 0 ? p[field] : null);
  return {
    ...ct,
    brand: ct.brand || '',
    category: ct.category || guessCategory(ct.name),
    seats: ct.capacity,
    luggage: ct.luggage ?? 2,
    fuel: ct.fuel || 'Bensin',
    color: ct.color || '#0f766e',
    imagePath: ct.photoUrl || null,
    priceDriver4h: price('price4HoursDriver'),
    priceDriver12h: price('price12HoursDriver'),
    priceDaily: price('priceDailySelfDrive'),
    priceMonthly: price('priceMonthlySelfDrive'),
    priceYearly: price('priceYearlySelfDrive'),
    available: ct.availableStock,
  };
}

/** Order (server) → booking (UI). Status WAITING_PAYMENT ditampilkan sebagai PENDING_PAYMENT. */
export function toBooking(o) {
  if (!o) return null;
  const tracking = (o.notes || '').match(/https:\/\/maps\.google\.com\/\?q=(-?[\d.]+),(-?[\d.]+)/);
  return {
    ...o,
    code: o.orderCode,
    service: o.serviceType,
    package: o.packageType,
    quantity: o.duration,
    city: o.pickupCity,
    startAt: o.startTime,
    endAt: o.endTime,
    expiresAt: o.paymentExpiresAt,
    status: o.status === 'WAITING_PAYMENT' ? 'PENDING_PAYMENT' : o.status,
    unitPrice: o.duration ? Math.round(o.totalPrice / o.duration) : o.totalPrice,
    serviceFee: 0,
    deliveryFee: 0,
    paidAt: o.payment?.paidAt || null,
    pickupLat: tracking ? Number(tracking[1]) : null,
    pickupLng: tracking ? Number(tracking[2]) : null,
    notes: (o.notes || '').replace(/\n?Titik lokasi: \S+/, '').trim() || null,
    carType: toCarType(o.carType),
    unit: o.carUnit ? { ...o.carUnit, plate: o.carUnit.plateNumber } : null,
  };
}

export const toDocument = (d) => (d ? { ...d, rejectReason: d.rejectionReason } : d);

/** Waktu selesai sewa (sama dengan perhitungan server). */
export function computeEndISO(pkg, startISO, qty) {
  const start = new Date(startISO);
  if (pkg === 'HOURS_4' || pkg === 'HOURS_12') {
    const hours = pkg === 'HOURS_4' ? 4 : 12;
    return new Date(start.getTime() + (qty - 1) * 86400000 + hours * 3600000).toISOString();
  }
  if (pkg === 'DAILY') return new Date(start.getTime() + qty * 86400000).toISOString();
  const end = new Date(start);
  end.setMonth(end.getMonth() + (pkg === 'MONTHLY' ? qty : qty * 12));
  return end.toISOString();
}

/** Tipe mobil + stok untuk jadwal tertentu (API ketersediaan Dev 3). */
export async function searchCars({ pkg, startISO, qty, carTypeId }) {
  const { data } = await api('/availability', {
    query: { startTime: startISO, endTime: computeEndISO(pkg, startISO, qty), carTypeId },
  });
  return (data || [])
    .map(toCarType)
    .map((t) => {
      const unitPrice = (t.prices || {})[PRICE_FIELDS[pkg]] || 0;
      return { ...t, unitPrice, totalPrice: unitPrice * qty };
    })
    .filter((t) => t.unitPrice > 0);
}

/** Semua tipe mobil untuk beranda (stok 24 jam ke depan). */
export async function listCarTypes() {
  const { data } = await api('/availability');
  return (data || []).map(toCarType);
}

export const myDocuments = async () => ((await api('/documents/mine')).data || []).map(toDocument);
export const myBookings = async () => ((await api('/bookings')).data || []).map(toBooking);

export async function myBooking(id) {
  const res = await api(`/bookings/${id}`);
  return { booking: toBooking(res.data), paymentMode: res.paymentMode };
}

export async function myDashboard() {
  const { data } = await api('/bookings/dashboard');
  const many = (list) => (list || []).map(toBooking);
  return {
    ...data,
    current: toBooking(data.current),
    upcoming: many(data.upcoming),
    pendingPayment: many(data.pendingPayment),
    recent: many(data.recent),
    documents: (data.documents || []).map(toDocument),
  };
}
