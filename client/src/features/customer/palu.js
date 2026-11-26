// Data lokasi Rental Mobil Iqra di Palu, Sulawesi Tengah (dipakai halaman pelanggan).
// Ubah di sini saja kalau nomor/titik jemput berubah.

export const DEFAULT_CITY = 'Palu';
export const REGION_LABEL = 'Palu, Sulawesi Tengah';

/** Titik jemput / serah terima yang sering dipakai pelanggan. Ditampilkan sebagai pilihan cepat di checkout. */
export const PICKUP_POINTS = [
  'Bandara Mutiara SIS Al-Jufri, Palu',
  'Pelabuhan Pantoloan, Palu Utara',
  'Palu Grand Mall, Jl. Moh. Hatta, Palu',
  'Pantai Talise, Palu',
  'Terminal Mamboro, Palu Utara',
  'Universitas Tadulako, Palu',
];

/** Kontak admin untuk pelanggan. Ganti dengan nomor WhatsApp resmi Iqra (format 62...). */
export const ADMIN_WHATSAPP = '6281200000001';

export const waLink = (phone, text = '') => {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0/, '62');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

// ---------- Lokasi akurat pelanggan ----------
export const PALU_CENTER = [-0.8917, 119.8707];
/** Di atas jarak ini (km dari pusat Palu) pelanggan diberi peringatan. Server menolak di atas 150 km. */
export const FAR_FROM_PALU_KM = 60;

export function distanceFromPaluKm(lat, lng) {
  const rad = (d) => (d * Math.PI) / 180;
  const [lat0, lng0] = PALU_CENTER;
  const h = Math.sin(rad(lat - lat0) / 2) ** 2 + Math.cos(rad(lat0)) * Math.cos(rad(lat)) * Math.sin(rad(lng - lng0) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Alamat dari koordinat (OpenStreetMap Nominatim, gratis, maks. ±1 permintaan/detik).
 * Gagal/offline -> null, pelanggan tinggal mengetik alamat sendiri.
 */
export async function reverseGeocode(lat, lng, lang = 'id', signal) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=0&lat=${lat}&lon=${lng}&accept-language=${lang === 'en' ? 'en' : 'id'}`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    // Buang bagian yang berulang, kode pos, dan negara; ambil 4 bagian pertama supaya ringkas.
    if (!data.display_name) return null;
    const parts = [...new Set(data.display_name.split(', '))].filter((x) => x !== 'Indonesia' && !/^\d{5}$/.test(x));
    return parts.slice(0, 4).join(', ').slice(0, 255);
  } catch {
    return null;
  }
}
