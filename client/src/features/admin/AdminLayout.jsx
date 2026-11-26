// Kerangka panel admin: navigasi bawah di HP, sidebar di layar lebar.
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, ReceiptText, CarFront, Wallet, Menu, Wrench, Users, MapPinned, LogOut } from 'lucide-react';
import { Logo, ThemeToggle, LangToggle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';
import { getDashboard } from './adminApi';

export function useLogout() {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  return () => {
    disconnectSocket();
    logout();
    navigate('/masuk', { replace: true });
  };
}

export function AdminLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useAuth((s) => s.user);
  const logout = useLogout();
  // Angka di menu (pesanan perlu ditugaskan, dokumen & driver menunggu) memakai data dashboard yang sama.
  const { data } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: getDashboard, refetchInterval: 60_000 });
  const todo = data?.todo || {};

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const items = [
    { to: '/admin', end: true, icon: LayoutDashboard, label: t('admin.nav.dashboard') },
    { to: '/admin/pesanan', icon: ReceiptText, label: t('admin.nav.orders'), count: todo.needAssign },
    { to: '/admin/mobil', icon: CarFront, label: t('admin.nav.cars') },
    { to: '/admin/keuangan', icon: Wallet, label: t('admin.nav.finance') },
    { to: '/admin/perawatan', icon: Wrench, label: t('admin.nav.maintenance') },
    { to: '/admin/pengguna', icon: Users, label: t('admin.nav.users'), count: (todo.pendingDocs || 0) + (todo.pendingDrivers || 0) },
    { to: '/admin/peta', icon: MapPinned, label: t('admin.nav.map') },
  ];
  // HP: 4 menu utama + "Lainnya" agar tombol tetap besar dan mudah ditekan.
  const moreActive = ['/admin/perawatan', '/admin/pengguna', '/admin/peta', '/admin/menu'].some((p) => pathname.startsWith(p));
  const moreCount = items.slice(4).reduce((s, i) => s + (i.count || 0), 0);
  const mobile = [...items.slice(0, 4), { to: '/admin/menu', icon: Menu, label: t('admin.nav.more'), count: moreCount, forceActive: moreActive }];

  const Count = ({ n }) => (n > 0 ? <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-5 font-bold text-white">{n > 99 ? '99+' : n}</span> : null);

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar layar lebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-950">
        <div className="flex h-16 items-center px-4">
          <Logo to="/admin" small />
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
              <span className="flex-1">{n.label}</span>
              <Count n={n.count} />
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-1">
            <LangToggle />
            <ThemeToggle />
            <button onClick={logout} className="ml-auto grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={t('admin.logout')} title={t('admin.logout')}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          <p className="truncate px-1 pt-1 text-xs text-slate-500">{user?.name}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header HP */}
        <header className="sticky top-0 z-[1000] flex h-14 items-center gap-2 border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-950/90">
          <Logo to="/admin" small />
          <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase dark:bg-white dark:text-slate-900">Admin</span>
          <div className="ml-auto flex items-center">
            <LangToggle />
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-10">
          <Outlet />
        </main>

        {/* Navigasi bawah HP */}
        <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <div className="grid grid-cols-5">
            {mobile.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive || n.forceActive ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500'}`}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
                {n.count > 0 && <span className="absolute top-1 left-1/2 ml-1.5 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-950" />}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

/** Halaman "Lainnya" di HP: menu yang tidak muat di navigasi bawah. */
export function AdminMenuPage() {
  const { t } = useTranslation();
  const logout = useLogout();
  const { data } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: getDashboard });
  const todo = data?.todo || {};
  const links = [
    { to: '/admin/perawatan', icon: Wrench, label: t('admin.nav.maintenance'), sub: t('admin.menu.maintenanceSub') },
    { to: '/admin/pengguna', icon: Users, label: t('admin.nav.users'), sub: t('admin.menu.usersSub'), count: (todo.pendingDocs || 0) + (todo.pendingDrivers || 0) },
    { to: '/admin/peta', icon: MapPinned, label: t('admin.nav.map'), sub: t('admin.menu.mapSub') },
  ];
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-slate-900 dark:text-white">{t('admin.nav.more')}</h1>
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <l.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900 dark:text-white">{l.label}</span>
              <span className="block truncate text-sm text-slate-500">{l.sub}</span>
            </span>
            {l.count > 0 && <span className="rounded-full bg-red-600 px-2 text-xs leading-5 font-bold text-white">{l.count}</span>}
          </NavLink>
        ))}
      </div>
      <button onClick={logout} className="card mt-4 flex w-full items-center gap-3 px-4 py-3.5 text-left font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
        <LogOut className="h-5 w-5" />
        {t('admin.logout')}
      </button>
    </div>
  );
}
