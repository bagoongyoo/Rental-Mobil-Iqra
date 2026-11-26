import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Spinner({ className = '' }) {
  return (
    <div className={`flex justify-center py-12 ${className}`} role="status">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Pesan error dari API, termasuk saat tidak ada koneksi. */
export function ErrorNote({ error, className = '' }) {
  const { t } = useTranslation();
  if (!error) return null;
  const msg = error.message === 'network' ? t('common.networkError') : error.message;
  return (
    <div className={`flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300 ${className}`} role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

export const errorText = (error, t) => (error?.message === 'network' ? t('common.networkError') : error?.message);
