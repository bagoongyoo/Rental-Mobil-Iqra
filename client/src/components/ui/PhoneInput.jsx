// Isian nomor telepon dengan pilihan kode negara + bendera (default Indonesia +62).
// Nilai yang dikirim ke form: "+62 812 2941 9850" (tanpa 0 di depan nomor).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  ALL_COUNTRIES, DEFAULT_COUNTRY, callingCode, examplePhone, formatPhone, isValidPhone, maxDigits, splitPhone,
} from '../../lib/identity';

// Bendera SVG (bukan emoji, karena emoji bendera tidak tampil di Windows).
// Tiap bendera jadi file terpisah dan baru diunduh saat terlihat.
const FLAG_FILES = import.meta.glob('../../../node_modules/country-flag-icons/3x2/*.svg', { eager: true, query: '?no-inline', import: 'default' });
const FLAGS = Object.fromEntries(Object.entries(FLAG_FILES).map(([path, url]) => [path.match(/([A-Z]{2})\.svg$/)[1], url]));

function Flag({ country, className = '' }) {
  const src = FLAGS[country];
  return src ? (
    <img src={src} alt="" loading="lazy" className={`h-[14px] w-[21px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`} />
  ) : (
    <span className={`grid h-[14px] w-[21px] shrink-0 place-items-center rounded-[2px] bg-slate-200 text-[8px] font-bold ${className}`}>{country}</span>
  );
}

/**
 * @param {string} value  nomor tersimpan ("+62 812 2941 9850", "0812…", atau '')
 * @param {(v: string) => void} onChange
 * @param {string} [boxClassName]  gaya kotak luar (default mengikuti `.input`)
 */
export function PhoneInput({ value, onChange, id, required, autoFocus, boxClassName, inputClassName = '' }) {
  const { t, i18n } = useTranslation();
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-countries`;
  const [{ country, digits }, setPhone] = useState(() => splitPhone(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Nilai dari luar berubah (mis. form dikosongkan) → ikut diperbarui.
  useEffect(() => {
    if ((value || '') !== formatPhone(country, digits)) setPhone(splitPhone(value, country));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const names = useMemo(() => new Intl.DisplayNames([i18n.language === 'en' ? 'en' : 'id'], { type: 'region' }), [i18n.language]);
  const countries = useMemo(() => {
    const list = ALL_COUNTRIES.map((c) => ({ code: c, name: names.of(c) || c, dial: callingCode(c) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    // Indonesia selalu paling atas.
    return [list.find((c) => c.code === DEFAULT_COUNTRY), ...list.filter((c) => c.code !== DEFAULT_COUNTRY)];
  }, [names]);
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  const shown = q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.code.toLowerCase() === q) : countries;

  const example = useMemo(() => examplePhone(country), [country]);
  const countryName = names.of(country) || country;

  // Nomor belum lengkap/tidak sah → kolom tidak bisa dikirim; pesannya ditampilkan FormGuard.
  useEffect(() => {
    inputRef.current?.setCustomValidity(
      digits && !isValidPhone(country, digits) ? t('validation.phone', { country: countryName, example: `+${callingCode(country)} ${example}` }) : '',
    );
  }, [country, digits, countryName, example, t]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const emit = (nextCountry, nextDigits) => {
    setPhone({ country: nextCountry, digits: nextDigits });
    onChange(formatPhone(nextCountry, nextDigits));
  };

  const onType = (e) => {
    const raw = e.target.value;
    // Tempel nomor lengkap "+60 12…" → kode negaranya ikut terpilih.
    if (raw.trim().startsWith('+')) {
      const p = splitPhone(raw, country);
      return emit(p.country, p.digits.slice(0, maxDigits(p.country)));
    }
    // Hanya angka; 0 di depan dibuang (+62 812…, bukan +62 0812…).
    const next = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, maxDigits(country));
    return emit(country, next);
  };

  const choose = (code) => {
    emit(code, digits.slice(0, maxDigits(code)));
    setOpen(false);
    setQuery('');
    inputRef.current?.focus();
  };

  const openList = () => {
    setQuery('');
    setActive(Math.max(0, countries.findIndex((c) => c.code === country)));
    setOpen(true);
  };

  const onSearchKey = (e) => {
    const keys = {
      ArrowDown: () => setActive((i) => Math.min(shown.length - 1, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Enter: () => shown[active] && choose(shown[active].code),
      Escape: () => setOpen(false),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  // Tampilan nomor di kolom: tanpa kode negara, dikelompokkan "812 2941 9850".
  const display = formatPhone(country, digits).replace(/^\+\d+\s*/, '');

  return (
    <div ref={rootRef} className="relative">
      <div
        data-guard-anchor="after"
        className={boxClassName || 'input flex items-center gap-0 p-0 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15'}
      >
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openList())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('phone.country', { country: countryName })}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-l-[inherit] border-r border-current/15 pr-2 pl-3 text-sm font-semibold tabular-nums"
        >
          <Flag country={country} />
          <span>+{callingCode(country)}</span>
          <ChevronDown className={`h-3.5 w-3.5 opacity-50 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          autoFocus={autoFocus}
          value={display}
          onChange={onType}
          placeholder={example}
          className={`h-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-slate-400 ${inputClassName}`}
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="relative border-b border-slate-100 p-2 dark:border-slate-800">
            <Search className="pointer-events-none absolute top-1/2 left-4.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={t('phone.search')}
              aria-label={t('phone.search')}
              aria-controls={listId}
              className="h-9 w-full rounded-lg bg-slate-100 pr-3 pl-8 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 dark:bg-slate-800"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-3 text-center text-sm text-slate-500">{t('phone.noResult')}</li>}
            {shown.map((c, i) => (
              <li
                key={c.code}
                role="option"
                aria-selected={c.code === country}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(c.code)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${i === active ? 'bg-brand-50 dark:bg-brand-950/60' : ''}`}
              >
                <Flag country={c.code} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-slate-500 tabular-nums">+{c.dial}</span>
                {c.code === country && <Check className="h-4 w-4 text-brand-600" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
