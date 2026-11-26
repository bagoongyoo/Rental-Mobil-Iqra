// Peringatan kolom wajib untuk SEMUA form (pelanggan, admin, driver).
// Cukup pasang <FormGuard /> sekali di App. Setiap kolom dengan atribut `required`
// (dan aturan bawaan lain: email, minLength, min/max) yang belum benar saat form dikirim akan:
//   1. diberi garis merah + getar singkat,
//   2. diberi pesan jelas tepat di bawah kolom,
//   3. di-scroll otomatis ke kolom pertama yang salah lalu difokuskan,
//   4. diringkas lewat toast ("Lengkapi 2 kolom wajib ...").
// Tanda merah hilang sendiri begitu kolom diisi dengan benar.
//
// Kontrol buatan sendiri (Select, slot foto, dll.) bisa ikut dengan "proxy":
//   <input data-guard-proxy required value={nilai} ... />  di dalam kontrolnya.
// Atribut opsional:
//   data-guard-message="..."  pesan khusus (untuk semua jenis kesalahan)
//   data-guard-pattern="..."  pesan khusus bila isian tidak cocok dengan atribut `pattern`
//   data-guard-anchor         pada pembungkus yang diberi garis merah (untuk proxy / input tersembunyi);
//                             ="after" → pesan ditaruh setelah pembungkus, bukan di dalamnya
//   data-guard-target         pada tombol pemicu kontrol (Select/DatePicker) di sebelah proxy
import { useEffect } from 'react';
import i18n from '../../lib/i18n';
import { toast } from './Toast';

const records = new Map(); // elemen input -> { highlight, bubble }
let batch = [];
let frame = 0;

const t = (key, opts) => i18n.t(`validation.${key}`, opts);

function isVisible(el) {
  if (!el || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
}

/** Elemen yang diberi garis merah dan menjadi patokan posisi pesan. */
function highlightFor(el) {
  const anchor = el.closest('[data-guard-anchor]');
  if (anchor) return anchor;
  if (el.hasAttribute('data-guard-proxy')) {
    const target = el.parentElement?.querySelector('[data-guard-target]');
    if (target) return target;
  }
  let node = el;
  while (node && !isVisible(node)) node = node.parentElement;
  return node || el;
}

function messageFor(el) {
  const custom = el.getAttribute('data-guard-message');
  if (custom) return custom;
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === 'file') return t('fileRequired');
    if (el.type === 'checkbox') return t('checkRequired');
    if (el.tagName === 'SELECT' || el.hasAttribute('data-guard-proxy')) return t('chooseRequired');
    return t('required');
  }
  if (v.typeMismatch) return el.type === 'email' ? t('email') : t('format');
  if (v.tooShort) return t('tooShort', { min: el.minLength, count: el.value.length });
  if (v.tooLong) return t('tooLong', { max: el.maxLength });
  if (v.rangeUnderflow) return t('min', { min: el.min });
  if (v.rangeOverflow) return t('max', { max: el.max });
  if (v.patternMismatch) return el.getAttribute('data-guard-pattern') || el.title || t('format');
  if (v.customError) return el.validationMessage;
  return t('format');
}

function focusTarget(el, highlight) {
  if (!el.hasAttribute('data-guard-proxy') && isVisible(el)) return el;
  if (highlight.matches('button, input, textarea, select, [tabindex]')) return highlight;
  return highlight.querySelector('button, input:not([data-guard-proxy]), textarea, select') || el;
}

/**
 * Pesan merah tepat di bawah kolom (ikut alur halaman, jadi tidak menutupi label lain).
 * Kolom biasa → disisipkan setelahnya; tombol Select → setelah pembungkusnya;
 * pembungkus (slot foto, fieldset, label berisi input tersembunyi) → di bagian paling bawahnya.
 */
function makeMessage(highlight) {
  const b = document.createElement('p');
  b.className = 'guard-msg';
  b.setAttribute('role', 'alert');
  b.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg><span></span>';
  const parent = highlight.parentElement;
  // Pembungkus berisi hiasan absolut (mis. "Rp", ikon cari) jangan sampai ikut memanjang.
  const decorated = [...parent.children].some((c) => c !== highlight && getComputedStyle(c).position === 'absolute');
  if (highlight.getAttribute('data-guard-anchor') === 'after') highlight.after(b); // kotak gabungan, mis. PhoneInput
  else if (highlight.hasAttribute('data-guard-target') || (decorated && highlight.matches('input, textarea, select'))) parent.after(b);
  else if (highlight.matches('input, textarea, select, button')) highlight.after(b);
  else highlight.appendChild(b);
  return b;
}

function clear(el) {
  const rec = records.get(el);
  if (!rec) return;
  rec.highlight.removeAttribute('data-guard-invalid');
  el.removeAttribute('aria-invalid');
  rec.bubble.remove();
  records.delete(el);
}

/** Tiap frame: buang tanda yang sudah benar dan perbarui teks pesannya. */
function tick() {
  frame = 0;
  for (const [el, rec] of records) {
    if (!el.isConnected || el.validity.valid) {
      clear(el);
      continue;
    }
    const text = messageFor(el); // mis. "wajib diisi" berubah jadi "minimal 8 karakter"
    const span = rec.bubble.querySelector('span');
    if (span.textContent !== text) span.textContent = text;
  }
  if (records.size) frame = requestAnimationFrame(tick);
}

function flag(el) {
  const highlight = highlightFor(el);
  let rec = records.get(el);
  if (!rec || !rec.bubble.isConnected || rec.highlight !== highlight) {
    if (rec) rec.bubble.remove();
    rec = { highlight, bubble: makeMessage(highlight) };
    records.set(el, rec);
  }
  rec.bubble.querySelector('span').textContent = messageFor(el);
  el.setAttribute('aria-invalid', 'true');
  // Ulangi animasi getar setiap kali form dikirim lagi.
  highlight.removeAttribute('data-guard-invalid');
  void highlight.offsetWidth;
  highlight.setAttribute('data-guard-invalid', '');
}

function flush() {
  const items = batch.filter((el, i) => batch.indexOf(el) === i && el.isConnected);
  batch = [];
  if (!items.length) return;
  items.forEach(flag);

  const first = items[0];
  const highlight = highlightFor(first);
  highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
  focusTarget(first, highlight).focus({ preventScroll: true });

  toast(items.length > 1 ? t('summaryMany', { count: items.length }) : t('summaryOne'), 'error');
  if (!frame) frame = requestAnimationFrame(tick);
}

function onInvalid(e) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  e.preventDefault(); // ganti gelembung bawaan browser dengan pesan bertema
  if (!batch.length) setTimeout(flush, 0);
  batch.push(el);
}

export function FormGuard() {
  useEffect(() => {
    document.addEventListener('invalid', onInvalid, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      [...records.keys()].forEach(clear);
    };
  }, []);
  return null;
}
