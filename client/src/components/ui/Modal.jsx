import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Dialog: tampil sebagai bottom sheet di HP dan modal di tengah di layar lebar. */
export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-white p-0 text-slate-800 backdrop:bg-slate-950/50 backdrop:backdrop-blur-[2px] sm:m-auto sm:rounded-3xl dark:bg-slate-900 dark:text-slate-200 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
