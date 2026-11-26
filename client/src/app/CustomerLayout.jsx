import { NavLink, Outlet, Link, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, LayoutDashboard, ReceiptText, UserRound, LogIn } from 'lucide-react';
import { Logo, ThemeToggle, LangToggle } from '../components/ui';
import { homeFor, useAuth } from '../lib/auth';

export function CustomerLayout() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const isCustomer = user?.role === 'CUSTOMER';

  // Pelanggan yang sudah masuk mendapat menu Dasbor. Item terakhir (Akun/Masuk) hanya tampil di navigasi bawah HP.
  const nav = [
    { to: '/', icon: Home, label: t('nav.home'), end: true },
    ...(isCustomer ? [{ to: '/dasbor', icon: LayoutDashboard, label: t('nav.dashboard') }] : []),
    { to: '/pesanan', icon: ReceiptText, label: t('nav.bookings') },
    { to: isCustomer ? '/akun' : '/masuk', icon: isCustomer ? UserRound : LogIn, label: isCustomer ? t('nav.account') : t('nav.login') },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[1000] border-b border-slate-200/70 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16">
          <Logo />
          <nav className="ml-8 hidden items-center gap-1 md:flex">
            {nav.slice(0, -1).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center">
            <LangToggle />
            <ThemeToggle />
            {user ? (
              <Link to={isCustomer ? '/akun' : homeFor(user.role)} className="ml-1 hidden items-center gap-2 rounded-xl py-1.5 pr-3 pl-1.5 text-sm font-semibold hover:bg-slate-100 md:flex dark:hover:bg-slate-800">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{user.name[0]}</span>
                {user.name.split(' ')[0]}
              </Link>
            ) : (
              <Link to="/masuk" className="ml-1 hidden h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 md:flex">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>

      <footer className="hidden border-t border-slate-200 bg-white py-8 text-sm text-slate-500 md:block dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <Logo small />
          <p>© {new Date().getFullYear()} Rental Mobil Iqra · {t('footer.tagline')} · <Link to="/kredit-foto" className="hover:underline">{t('credits.link')}</Link></p>
          <Link to="/driver/daftar" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">{t('footer.becomeDriver')}</Link>
        </div>
      </footer>

      {/* Navigasi bawah untuk HP */}
      <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <div className={`grid ${nav.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {nav.map((n) => (
            <NavLink key={n.label} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500'}`}>
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
