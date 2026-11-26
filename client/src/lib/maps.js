// Link Google Maps untuk lokasi pesanan. Dipakai pelanggan, admin, dan driver.
const hasPin = (b) => b.pickupLat != null && b.pickupLng != null;

/** Buka titik di Google Maps: koordinat akurat jika ada, kalau tidak cari berdasarkan alamat. */
export const mapsLink = (b) =>
  hasPin(b)
    ? `https://www.google.com/maps/search/?api=1&query=${b.pickupLat},${b.pickupLng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.pickupAddress}, ${b.city}`)}`;

/** Petunjuk arah (navigasi) ke titik jemput/antar. */
export const directionsLink = (b) =>
  `https://www.google.com/maps/dir/?api=1&destination=${hasPin(b) ? `${b.pickupLat},${b.pickupLng}` : encodeURIComponent(`${b.pickupAddress}, ${b.city}`)}`;

export { hasPin as hasPickupPin };
