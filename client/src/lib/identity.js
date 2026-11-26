// Aturan data diri untuk semua form pendaftaran (pelanggan, driver, admin tambah driver).
// Disamakan dengan server: server/src/utils/identity.js
import { AsYouType, getCountries, getCountryCallingCode, getExampleNumber, isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';

// ---------- Nama: hanya huruf dan spasi ----------

/** Atribut `pattern`: minimal satu huruf, isinya hanya huruf & spasi. */
export const NAME_PATTERN = '[\\p{L} ]*\\p{L}[\\p{L} ]*';

/** Buang angka/simbol saat diketik, spasi di depan, dan spasi ganda. */
export const cleanName = (v) => v.replace(/[^\p{L} ]/gu, '').replace(/^ +/, '').replace(/ {2,}/g, ' ');

// ---------- Email ----------

/** Atribut `pattern`: wajib ada @, domain, dan akhiran (mis. nama@domain.com). */
export const EMAIL_PATTERN = '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(\\.[A-Za-z0-9\\-]+)*\\.[A-Za-z]{2,}';

/** Email tidak boleh berspasi dan disimpan huruf kecil. */
export const cleanEmail = (v) => v.replace(/\s/g, '').toLowerCase();

// ---------- Telepon ----------

export const DEFAULT_COUNTRY = 'ID';
export const callingCode = (country) => getCountryCallingCode(country);

/** Batas jumlah angka setelah kode negara (Indonesia paling panjang 12, mis. 812 2941 98501). */
export const maxDigits = (country) => (country === 'ID' ? 12 : 15 - callingCode(country).length);

/** "+62 812 2941 9850" dari negara + angka nasional (tanpa 0 di depan). */
export function formatPhone(country, digits) {
  return digits ? new AsYouType().input(`+${callingCode(country)}${digits}`) : '';
}

export const isValidPhone = (country, digits) => Boolean(digits) && isValidPhoneNumber(digits, country);

/** Contoh nomor untuk placeholder, tanpa kode negara: "812 3456 789". */
export function examplePhone(country) {
  const n = getExampleNumber(country, examples);
  return n ? n.formatInternational().replace(/^\+\d+\s*/, '') : '';
}

/** Pecah nilai tersimpan ("+62 812…", "0812…") menjadi { country, digits }. */
export function splitPhone(value, fallback = DEFAULT_COUNTRY) {
  const raw = String(value || '').trim();
  if (!raw) return { country: fallback, digits: '' };
  const p = parsePhoneNumberFromString(raw, fallback);
  if (p) {
    const country = p.country || getCountries().find((c) => callingCode(c) === p.countryCallingCode) || fallback;
    return { country, digits: p.nationalNumber };
  }
  return { country: fallback, digits: raw.replace(/\D/g, '').replace(/^0+/, '') };
}

export const ALL_COUNTRIES = getCountries();
