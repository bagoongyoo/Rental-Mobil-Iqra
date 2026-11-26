import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-sm shadow-brand-900/10 dark:bg-brand-600 dark:hover:bg-brand-500',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60',
};
const sizes = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, as: Tag = 'button', ...props }) {
  return (
    <Tag
      className={`inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={Tag === 'button' ? disabled || loading : undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </Tag>
  );
}
