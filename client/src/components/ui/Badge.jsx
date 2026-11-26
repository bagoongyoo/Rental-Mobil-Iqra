const tones = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

export function Badge({ tone = 'slate', className = '', children }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
}
