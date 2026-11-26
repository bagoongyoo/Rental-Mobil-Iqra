// Pemilih jam bertema Iqra (pengganti <input type="time"> bawaan browser).
// Nilai berupa string "HH:MM" (24 jam). Klik kolom → panel Jam & Menit terbuka di bawahnya.
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));

/**
 * @param {string} value    jam terpilih "HH:MM"
 * @param {number} step     selang menit (default 15)
 * @param {string} [min]    jam paling awal yang boleh dipilih "HH:MM" (mis. saat tanggal = hari ini)
 * @param {(v: string) => void} onChange
 */
export function TimePicker({ value, onChange, step = 15, min, id, className = '' }) {
  const { t } = useTranslation();
  const autoId = useId();
  const inputId = id || autoId;
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState((value || '08:00').slice(0, 2));
  const rootRef = useRef(null);
  const hourListRef = useRef(null);
  const minutes = Array.from({ length: 60 / step }, (_, i) => pad(i * step));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Gulir daftar jam supaya jam terpilih terlihat di tengah.
  useEffect(() => {
    if (!open) return;
    const list = hourListRef.current;
    const el = list?.querySelector(`[data-hour="${hour}"]`);
    if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDisabled = (time) => Boolean(min && time < min);
  const hourDisabled = (h) => minutes.every((m) => isDisabled(`${h}:${m}`));

  const openPicker = () => {
    setHour((value || '08:00').slice(0, 2));
    setOpen(true);
  };

  const chooseHour = (h) => {
    setHour(h);
    // Pertahankan menit lama jika masih boleh, kalau tidak pakai menit pertama yang boleh.
    const keep = (value || '').slice(3, 5);
    const minute = minutes.includes(keep) && !isDisabled(`${h}:${keep}`) ? keep : minutes.find((m) => !isDisabled(`${h}:${m}`));
    if (minute) onChange(`${h}:${minute}`);
  };

  const chooseMinute = (m) => {
    if (isDisabled(`${hour}:${m}`)) return;
    onChange(`${hour}:${m}`);
    setOpen(false);
  };

  const cell = (active, disabled) =>
    `h-9 w-full shrink-0 rounded-lg text-sm tabular-nums transition ${
      active
        ? 'bg-brand-700 font-bold text-white shadow-sm shadow-brand-900/20'
        : disabled
          ? 'cursor-not-allowed text-slate-300 dark:text-slate-700'
          : 'font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800 dark:text-slate-200 dark:hover:bg-brand-950 dark:hover:text-brand-200'
    }`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={inputId}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input flex items-center gap-2 pl-3 text-left tabular-nums ${open ? 'border-brand-500 ring-4 ring-brand-500/15' : ''}`}
      >
        <Clock className="h-4 w-4 shrink-0 text-brand-600" />
        <span className="truncate">{value}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('timePicker.choose')}
          className="absolute top-full right-0 z-30 mt-2 w-52 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10 sm:right-auto sm:left-0 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <span>{t('timePicker.hour')}</span>
            <span>{t('timePicker.minute')}</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div ref={hourListRef} className="no-scrollbar flex h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label={t('timePicker.hour')}>
              {HOURS.map((h) => {
                const disabled = hourDisabled(h);
                return (
                  <button key={h} type="button" data-hour={h} role="option" aria-selected={h === hour} disabled={disabled} onClick={() => chooseHour(h)} className={cell(h === hour, disabled)}>
                    {h}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-0.5" role="listbox" aria-label={t('timePicker.minute')}>
              {minutes.map((m) => {
                const disabled = isDisabled(`${hour}:${m}`);
                const active = value === `${hour}:${m}`;
                return (
                  <button key={m} type="button" role="option" aria-selected={active} disabled={disabled} onClick={() => chooseMinute(m)} className={cell(active, disabled)}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
