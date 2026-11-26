// Aturan data diri yang sama untuk semua pendaftaran akun
// (pelanggan: /api/auth/register, driver: /api/drivers/register, admin: /api/users/drivers).
const { AsYouType, parsePhoneNumberFromString } = require('libphonenumber-js/max');
const { z } = require('zod');

/** Nama: hanya huruf (termasuk huruf beraksen) dan spasi tunggal di antaranya. */
const NAME_REGEX = /^\p{L}+(?: \p{L}+)*$/u;
const NAME_MESSAGE = 'Nama hanya boleh berisi huruf dan spasi (2–100 karakter).';

/** Email lengkap dengan domain dan akhiran, mis. nama@domain.com. */
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const EMAIL_MESSAGE = 'Format email tidak valid (contoh: nama@email.com).';

const PHONE_MESSAGE = 'Nomor telepon tidak valid (contoh: +62 812 2941 9850).';

const normalizeName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const isValidName = (name) => name.length >= 2 && name.length <= 100 && NAME_REGEX.test(name);

const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();
const isValidEmail = (email) => email.length <= 191 && EMAIL_REGEX.test(email);

/**
 * Nomor telepon → format internasional dengan spasi, mis. "+62 812 2941 9850".
 * Menerima "+62 812…", "0812…" (dianggap Indonesia), atau kode negara lain.
 * Nomor lama yang lebih pendek tetap diterima selama sah menurut aturan negaranya.
 * @returns {string|null} nomor rapi, atau null bila tidak valid
 */
function normalizePhone(v) {
  const raw = String(v ?? '').trim();
  const phone = raw ? parsePhoneNumberFromString(raw, 'ID') : null;
  if (!phone || !phone.isValid()) return null;
  return new AsYouType().input(phone.number);
}

// Potongan zod siap pakai.
const zName = z.string().transform(normalizeName).refine(isValidName, NAME_MESSAGE);
const zEmail = z.string().transform(normalizeEmail).refine(isValidEmail, EMAIL_MESSAGE);
const zPhone = z
  .string()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE });
    return phone;
  });

module.exports = {
  NAME_MESSAGE,
  EMAIL_MESSAGE,
  PHONE_MESSAGE,
  normalizeName,
  isValidName,
  normalizeEmail,
  isValidEmail,
  normalizePhone,
  zName,
  zEmail,
  zPhone,
};
