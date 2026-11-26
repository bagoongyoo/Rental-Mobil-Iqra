// Komponen kecil yang dipakai bersama oleh halaman admin.
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Spinner } from '../../components/ui';
import { documentImage } from './adminApi';

/** Status order server → key terjemahan (WAITING_PAYMENT ditampilkan sebagai "Menunggu bayar"). */
export const statusKey = (s) => (s === 'WAITING_PAYMENT' ? 'PENDING_PAYMENT' : s);

export function PageHeader({ title, subtitle, back, action }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {back && (
        <Link to={back} className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Kembali">
          <ChevronLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneClass = {
  brand: 'text-brand-700 dark:text-brand-400',
  red: 'text-red-600 dark:text-red-400',
  slate: 'text-slate-900 dark:text-white',
  amber: 'text-amber-600 dark:text-amber-400',
};

export function StatTile({ icon: Icon, label, value, tone = 'slate', hint }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {Icon && <Icon className="h-4 w-4" />}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 truncate text-lg font-extrabold sm:text-xl ${toneClass[tone]}`}>{value}</p>
      {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Baris tombol filter yang bisa digeser di HP. */
export function Chips({ value, onChange, options }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition ${
            value === o.value
              ? 'border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-600'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          {o.label}
          {o.count > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-xs ${value === o.value ? 'bg-white/25' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Input nominal rupiah: menampilkan pemisah ribuan, menyimpan angka bulat. */
export function MoneyInput({ value, onChange, placeholder = '0', ...props }) {
  const shown = value === '' || value == null ? '' : new Intl.NumberFormat('id-ID').format(value);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">Rp</span>
      <input
        {...props}
        inputMode="numeric"
        className="input pl-10"
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
          onChange(digits === '' ? '' : Number(digits));
        }}
      />
    </div>
  );
}

/** Gambar dokumen privat (KTP/SIM) diambil dengan token, bukan lewat URL publik. */
export function DocImage({ id, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url;
    let alive = true;
    documentImage(id)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  if (failed) return <div className="grid aspect-[3/2] place-items-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-800">Gambar tidak tersedia</div>;
  if (!src) return <Spinner className="aspect-[3/2] items-center rounded-xl bg-slate-100 dark:bg-slate-800" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={alt} className="aspect-[3/2] w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800" />
    </a>
  );
}

/**
 * Seperti Field, tapi pembungkusnya <div> (bukan <label>), untuk kontrol berupa tombol
 * (Select, Segmented, DatePicker) supaya klik pada teks label tidak ikut menekan tombol pertama.
 */
export function Group({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

/** "YYYY-MM-DD" (WITA) dari sebuah tanggal. */
export const toDateStr = (d) => new Date(new Date(d).getTime() + 8 * 3600000).toISOString().slice(0, 10);
