// Dropdown bertema Iqra (pengganti <select> bawaan browser).
// options: [{ value, label }]. Klik kolom → daftar pilihan terbuka di bawahnya.
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * @param {*} value
 * @param {{ value: *, label: string }[]} options
 * @param {(v: *) => void} onChange
 * @param {import('react').ComponentType} [icon]  ikon kecil di kiri (mis. MapPin)
 * @param {'md'|'sm'} [size]
 * @param {'left'|'right'} [align]  sisi panel menempel (pakai 'right' untuk kolom di tepi kanan)
 * @param {boolean} [required]  wajib dipilih (nilai '' dianggap belum dipilih)
 */
export function Select({ value, options, onChange, icon: Icon, id, size = 'md', align = 'left', required = false, className = '', ...aria }) {
  const autoId = useId();
  const buttonId = id || autoId;
  const listId = `${buttonId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => rootRef.current && !rootRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Pilihan yang disorot selalu terlihat di daftar.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (i) => {
    onChange(options[i].value);
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    const keys = {
      ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
      ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => setOpen(false),
      Tab: () => setOpen(false),
    };
    if (keys[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      keys[e.key]();
    }
  };

  const sm = size === 'sm';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={buttonId}
        data-guard-target
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        {...aria}
        className={`input flex items-center gap-2 text-left ${sm ? 'h-9 text-sm' : ''} ${open ? 'border-brand-500 ring-4 ring-brand-500/15' : ''}`}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-brand-600" />}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180 text-brand-600' : ''}`} />
      </button>
      {/* Wajib dipilih: input tak terlihat supaya ikut validasi form (lihat FormGuard). */}
      {required && (
        <input
          data-guard-proxy
          required
          tabIndex={-1}
          aria-hidden="true"
          value={value ?? ''}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      )}

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={buttonId}
          className={`no-scrollbar absolute top-full z-30 mt-2 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-brand-700 font-bold text-white'
                    : i === active
                      ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                      : 'font-medium text-slate-700 dark:text-slate-200'
                }`}
              >
                {o.label}
                {isSelected && <Check className="h-4 w-4 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
