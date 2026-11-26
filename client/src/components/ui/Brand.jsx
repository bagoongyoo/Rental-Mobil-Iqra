import { Link } from 'react-router';

export function Logo({ to = '/', small }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-extrabold tracking-tight text-slate-900 dark:text-white">
      <img src="/favicon.svg" alt="" className={small ? 'h-7 w-7' : 'h-8 w-8'} />
      <span className={`whitespace-nowrap ${small ? 'text-base' : 'text-lg'}`}>
        Rental Mobil <span className="text-brand-700 dark:text-brand-400">Iqra</span>
      </span>
    </Link>
  );
}
