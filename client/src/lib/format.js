import i18n from './i18n';

const locale = () => (i18n.language === 'en' ? 'en-GB' : 'id-ID');
// Rental Mobil Iqra beroperasi di Palu, Sulawesi Tengah: WITA (UTC+8).
// Nama fungsi "...WIB" dipertahankan supaya file tim lain tidak perlu diubah; nilainya sekarang WITA.
export const TZ = 'Asia/Makassar';
export const TZ_OFFSET_HOURS = 8;
export const TZ_LABEL = 'WITA';

export const formatIDR = (n) =>
  n == null ? '-' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

/** Angka ringkas untuk sumbu grafik: 1,2 jt / 450 rb */
export const formatShort = (n) => {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1).replace('.0', '')} M`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '')} jt`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)} rb`;
  return String(n);
};

export const formatDate = (d, opts = {}) =>
  d ? new Intl.DateTimeFormat(locale(), { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', ...opts }).format(new Date(d)) : '-';

export const formatDateTime = (d) =>
  d ? new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '-';

export const formatTime = (d) => (d ? new Intl.DateTimeFormat(locale(), { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '-');

/** "YYYY-MM-DD" hari ini (WITA) ditambah n hari. */
export function dateStrWIB(offsetDays = 0) {
  const d = new Date(Date.now() + TZ_OFFSET_HOURS * 3600000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Gabungkan tanggal + jam yang dipilih pengguna (WITA) menjadi ISO string. */
export const wibToISO = (date, time) => new Date(`${date}T${time}:00+0${TZ_OFFSET_HOURS}:00`).toISOString();

/** Jam saat ini di Palu (0-23), untuk sapaan pagi/siang/sore/malam. */
export const localHour = () => new Date(Date.now() + TZ_OFFSET_HOURS * 3600000).getUTCHours();

export function timeAgo(d) {
  if (!d) return '-';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (s < 60) return rtf.format(-s, 'second');
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
