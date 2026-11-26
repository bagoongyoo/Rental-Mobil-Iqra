// Pemilih tanggal dengan kalender bertema Iqra (pengganti <input type="date"> bawaan browser).
// Nilai berupa string "YYYY-MM-DD". Klik kolom → kalender terbuka di bawahnya.
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

// Semua perhitungan memakai UTC supaya tanggal tidak bergeser karena zona waktu perangkat.
const toDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toStr = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => toStr(new Date(toDate(s).getTime() + n * 86400000));
const monthKey = (s) => s.slice(0, 7); // "YYYY-MM"
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  return toStr(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param {string} value   tanggal terpilih "YYYY-MM-DD"
 * @param {string} min     tanggal paling awal yang boleh dipilih
 * @param {string} [max]   tanggal paling akhir yang boleh dipilih (mis. batas 3 bulan ke depan)
 * @param {string} today   "hari ini" menurut zona waktu operasional (WITA)
 * @param {(v: string) => void} onChange
 */
export function DatePicker({ value, min, max, today, onChange, id, className = '' }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'id-ID';
  const autoId = useId();
  const inputId = id || autoId;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(monthKey(value || today));
  const [focused, setFocused] = useState(value || today);
  const rootRef = useRef(null);
  const outOfRange = (s) => Boolean((min && s < min) || (max && s > max));
  const gridRef = useRef(null);

  // Tutup saat klik di luar atau tekan Esc.
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

  // Fokus keyboard mengikuti tanggal yang sedang disorot.
  useEffect(() => {
    if (open) gridRef.current?.querySelector(`[data-date="${focused}"]`)?.focus();
  }, [open, focused, view]);

  const openPicker = () => {
    const start = value || today;
    setView(monthKey(start));
    setFocused(start);
    setOpen(true);
  };

  const pick = (s) => {
    if (outOfRange(s)) return;
    onChange(s);
    setOpen(false);
  };

  const moveFocus = (n) => {
    let next = addDays(focused, n);
    if (min && next < min) next = min;
    if (max && next > max) next = max;
    setFocused(next);
    setView(monthKey(next));
  };

  const onGridKey = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key]) {
      e.preventDefault();
      moveFocus(moves[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focused);
    }
  };

  // Susun sel kalender: minggu dimulai Senin.
  const first = toDate(`${view}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${view}-${String(i + 1).padStart(2, '0')}`),
  ];

  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts });
  const monthLabel = capitalize(fmt({ month: 'long', year: 'numeric' }).format(first));
  // 2024-01-01 adalah hari Senin.
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
  const display = value ? fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(value)) : '';
  const displayShort = value ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(value)) : '';
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const canGoBack = !min || shiftMonth(view, -1) >= monthKey(min);
  const canGoNext = !max || shiftMonth(view, 1) <= monthKey(max);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={inputId}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input flex items-center gap-2 pl-3 text-left ${open ? 'border-brand-500 ring-4 ring-brand-500/15' : ''}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-600" />
        {/* Layar sempit (HP): tanpa nama hari supaya tidak terpotong */}
        <span className="truncate sm:hidden">{displayShort}</span>
        <span className="hidden truncate sm:inline">{display}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('datePicker.choose')}
          className="absolute top-full left-0 z-30 mt-2 w-[18.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(shiftMonth(view, -1))}
              disabled={!canGoBack}
              aria-label={t('datePicker.prevMonth')}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold text-slate-900 dark:text-white" aria-live="polite">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setView(shiftMonth(view, 1))}
              disabled={!canGoNext}
              aria-label={t('datePicker.nextMonth')}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            {weekdays.map((w) => <span key={w} className="py-1">{w.replace('.', '')}</span>)}
          </div>

          <div ref={gridRef} role="grid" className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
            {cells.map((s, i) => {
              if (!s) return <span key={`e${i}`} />;
              const disabled = outOfRange(s);
              const selected = s === value;
              const isToday = s === today;
              return (
                <button
                  key={s}
                  type="button"
                  data-date={s}
                  tabIndex={s === focused ? 0 : -1}
                  disabled={disabled}
                  onClick={() => pick(s)}
                  aria-selected={selected}
                  aria-label={fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(s))}
                  className={`relative grid aspect-square place-items-center rounded-lg text-sm transition ${
                    selected
                      ? 'bg-brand-700 font-bold text-white shadow-sm shadow-brand-900/20'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300 dark:text-slate-700'
                        : 'font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800 dark:text-slate-200 dark:hover:bg-brand-950 dark:hover:text-brand-200'
                  } ${isToday && !selected ? 'ring-1 ring-brand-500 ring-inset' : ''}`}
                >
                  {Number(s.slice(8))}
                </button>
              );
            })}
          </div>

          {max && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              {t('datePicker.maxHint', { date: fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(max)) })}
            </p>
          )}

          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {[0, 1].map((n) => {
              const s = addDays(today, n);
              const active = value === s;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(s)}
                  disabled={outOfRange(s)}
                  className={`h-8 flex-1 rounded-full border text-xs font-semibold transition disabled:opacity-40 ${
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-950 dark:text-brand-200'
                      : 'border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {capitalize(relative.format(n, 'day'))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
