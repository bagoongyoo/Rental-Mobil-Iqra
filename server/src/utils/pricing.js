import { addDays, addMonths } from './dates.js';

export const PACKAGES = {
  HOURS_4: { service: 'WITH_DRIVER', priceField: 'priceDriver4h', hours: 4 },
  HOURS_12: { service: 'WITH_DRIVER', priceField: 'priceDriver12h', hours: 12 },
  DAILY: { service: 'SELF_DRIVE', priceField: 'priceDaily' },
  MONTHLY: { service: 'SELF_DRIVE', priceField: 'priceMonthly' },
  YEARLY: { service: 'SELF_DRIVE', priceField: 'priceYearly' },
};

/**
 * Hitung waktu selesai sewa.
 * - Dengan driver: paket berlaku per hari, `quantity` = jumlah hari.
 * - Lepas kunci: `quantity` = jumlah hari / bulan / tahun sesuai paket.
 */
export function computeEndAt(pkg, startAt, quantity) {
  const def = PACKAGES[pkg];
  if (def.hours) return new Date(addDays(startAt, quantity - 1).getTime() + def.hours * 3600000);
  if (pkg === 'DAILY') return addDays(startAt, quantity);
  if (pkg === 'MONTHLY') return addMonths(startAt, quantity);
  return addMonths(startAt, quantity * 12);
}

export function unitPriceFor(carType, pkg) {
  return carType[PACKAGES[pkg].priceField] ?? null;
}

/** Biaya tambahan saat ini (diatur admin). Baris dibuat otomatis dengan nilai 0 jika belum ada. */
export async function getFees(db) {
  return db.pricingSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** Biaya yang berlaku untuk satu pesanan. Biaya antar hanya untuk lepas kunci. */
export function feesFor(service, fees) {
  return { serviceFee: fees.serviceFee, deliveryFee: service === 'SELF_DRIVE' ? fees.deliveryFee : 0 };
}
