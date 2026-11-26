// Plat nomor kendaraan Indonesia (TNKB):
//   kode wilayah 1–2 huruf · nomor 1–4 angka · seri belakang 0–3 huruf
//   contoh: "DN 1234 AB", "B 1 XYZ", "DD 88"

/** Pola lengkap (dipakai atribut `pattern` dan disamakan dengan validasi server). */
export const PLATE_PATTERN = '[A-Z]{1,2} [0-9]{1,4}( [A-Z]{1,3})?';
export const PLATE_REGEX = new RegExp(`^${PLATE_PATTERN}$`);

/**
 * Rapikan ketikan menjadi format plat: huruf besar, spasi otomatis, dan karakter yang
 * melanggar aturan (huruf ke-3 di depan, angka ke-5, huruf ke-4 di belakang, angka di awal,
 * simbol) langsung diabaikan, jadi isian yang salah memang tidak bisa diketik.
 */
export function formatPlate(raw) {
  let region = '';
  let number = '';
  let suffix = '';
  for (const ch of String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    const isDigit = ch >= '0' && ch <= '9';
    if (!number && !isDigit) {
      if (region.length < 2) region += ch;
    } else if (isDigit) {
      if (region && !suffix && number.length < 4) number += ch;
    } else if (suffix.length < 3) {
      suffix += ch;
    }
  }
  return [region, number, suffix].filter(Boolean).join(' ');
}
