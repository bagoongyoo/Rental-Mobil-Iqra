import { create } from 'zustand';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const useToast = create((set) => ({
  items: [],
  show: (message, tone = 'success') => {
    const id = Math.random();
    set((s) => ({ items: [...s.items, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3500);
  },
}));

export const toast = (message, tone) => useToast.getState().show(message, tone);

export function Toaster() {
  const items = useToast((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
          {i.tone === 'error' ? <AlertCircle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-brand-400" />}
          {i.message}
        </div>
      ))}
    </div>
  );
}
