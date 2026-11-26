// Kerangka halaman driver, disamakan dengan panel admin & dashboard pelanggan:
// header (logo, bahasa, tema), navigasi bawah di HP, sidebar di layar lebar.
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ListChecks, LogOut, UserRound } from 'lucide-react';
import { LangToggle, Logo, ThemeToggle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';

export function useDriverLogout() {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  return () => {
    disconnectSocket();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {
      // storage diblokir: abaikan
    }
    logout();
    navigate('/driver/daftar', { replace: true });
  };
}

export function DriverLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useAuth((s) => s.user);
  const isDriver = user?.role === 'DRIVER';
  const logout = useDriverLogout();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const items = [
    { to: '/driver', end: true, icon: ListChecks, label: t('driver.nav.tasks') },
    { to: '/driver/daftar', icon: UserRound, label: t('driver.nav.profile') },
  ];

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar layar lebar (hanya saat sudah masuk sebagai driver) */}
      {isDriver && (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-950">
          <div className="flex h-16 items-center gap-2 px-4">
            <Logo to="/driver" small />
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'}`
                }
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center gap-1">
              <LangToggle />
              <ThemeToggle />
              <button onClick={logout} className="ml-auto grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={t('driver.nav.logout')} title={t('driver.nav.logout')}>
                <LogOut className="h-5 w-5" />
              </button>
            </div>
            <p className="truncate px-1 pt-1 text-xs text-slate-500">{user?.name}</p>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <header className={`sticky top-0 z-[1000] flex h-14 items-center gap-2 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 ${isDriver ? 'md:hidden' : ''}`}>
          <Logo to={isDriver ? '/driver' : '/'} small />
          <span className="rounded-md bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase dark:bg-brand-500 dark:text-slate-950">Driver</span>
          <div className="ml-auto flex items-center">
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>

        <main className={`mx-auto max-w-3xl px-4 pt-4 md:px-8 md:pt-8 ${isDriver ? 'pb-24 md:pb-10' : 'pb-10'}`}>
          <Outlet />
        </main>

        {/* Navigasi bawah HP */}
        {isDriver && (
          <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95">
            <div className="grid grid-cols-2">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500'}`}
                >
                  <n.icon className="h-5 w-5" />
                  {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
