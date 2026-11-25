// Semua tanggal disimpan UTC di database. Operasional rental di Palu memakai WITA (UTC+8).
// Nama fungsi "...WIB" dipertahankan supaya modul lain tidak perlu diubah; nilainya sekarang WITA.
export const TZ_OFFSET_MIN = 8 * 60;

/** Awal hari (00:00 WIB) untuk tanggal "YYYY-MM-DD", dikembalikan sebagai Date UTC. */
export function startOfDayWIB(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MIN * 60000);
}

/** "YYYY-MM-DD" dalam WIB dari sebuah Date. */
export function toDateStrWIB(date) {
  const local = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}

export function addMonths(date, n) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/**
 * Rentang [from, to) untuk laporan per periode, dihitung di WIB.
 * period: day | week (Senin-Minggu) | month | year
 */
export function periodRange(period, dateStr) {
  const base = startOfDayWIB(dateStr);
  const local = new Date(base.getTime() + TZ_OFFSET_MIN * 60000); // tanggal WIB dalam bentuk UTC
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const shift = (d) => new Date(d - TZ_OFFSET_MIN * 60000);
  if (period === 'day') return { from: base, to: addDays(base, 1) };
  if (period === 'week') {
    const dow = (local.getUTCDay() + 6) % 7; // 0 = Senin
    const from = addDays(base, -dow);
    return { from, to: addDays(from, 7) };
  }
  if (period === 'month') return { from: shift(Date.UTC(y, m, 1)), to: shift(Date.UTC(y, m + 1, 1)) };
  return { from: shift(Date.UTC(y, 0, 1)), to: shift(Date.UTC(y + 1, 0, 1)) };
}
