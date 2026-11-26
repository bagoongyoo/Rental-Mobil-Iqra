import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CarFront, ChevronRight, CircleAlert, FileCheck2, PlayCircle, TrendingDown, TrendingUp, UserCheck, Wallet, Wrench } from 'lucide-react';
import { ErrorNote, Spinner, StatusBadge, Badge } from '../../components/ui';
import { formatDate, formatDateTime, formatIDR, localHour } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { getDashboard } from './adminApi';
import { StatTile, statusKey } from './ui';

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: getDashboard, refetchInterval: 60_000 });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;

  const { todo, stats, month, latestOrders, serviceReminders } = data;
  const h = localHour();
  const greet = h < 11 ? 'morning' : h < 15 ? 'afternoon' : h < 19 ? 'evening' : 'night';

  // Daftar hal yang perlu ditindaklanjuti, hanya yang ada isinya.
  const tasks = [
    { n: todo.needAssign, to: '/admin/pesanan?status=PAID', icon: CircleAlert, text: t('admin.todoAssign', { count: todo.needAssign }) },
    { n: todo.pendingDocs, to: '/admin/pengguna?tab=docs', icon: FileCheck2, text: t('admin.todoDocs', { count: todo.pendingDocs }) },
    { n: todo.pendingDrivers, to: '/admin/pengguna?tab=drivers', icon: UserCheck, text: t('admin.todoDrivers', { count: todo.pendingDrivers }) },
  ].filter((x) => x.n > 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500">{t(`admin.greet.${greet}`)},</p>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{user?.name}</h1>
      </div>

      {tasks.length > 0 ? (
        <section className="space-y-2">
          {tasks.map((x) => (
            <Link key={x.to} to={x.to} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <x.icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{x.text}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ))}
        </section>
      ) : (
        <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">{t('admin.allDone')}</p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500 uppercase">{t('admin.thisMonth')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile icon={TrendingUp} label={t('admin.income')} value={formatIDR(month.income)} tone="brand" />
          <StatTile icon={TrendingDown} label={t('admin.expense')} value={formatIDR(month.expense)} tone="red" />
          <div className="col-span-2 sm:col-span-1">
            <StatTile icon={Wallet} label={t('admin.profit')} value={formatIDR(month.profit)} tone={month.profit < 0 ? 'red' : 'slate'} />
          </div>
        </div>
        <Link to="/admin/keuangan" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-400">
          {t('admin.openFinance')} <ChevronRight className="h-4 w-4" />
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-500 uppercase">{t('admin.today')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={CalendarClock} label={t('admin.ordersToday')} value={stats.ordersToday} />
          <StatTile icon={PlayCircle} label={t('admin.ongoing')} value={stats.ongoing} />
          <StatTile icon={CarFront} label={t('admin.unitsAvailable')} value={`${stats.units.AVAILABLE}/${stats.units.total}`} hint={t('admin.unitsHint', { rented: stats.units.RENTED, maintenance: stats.units.MAINTENANCE })} />
          <StatTile icon={UserCheck} label={t('admin.readyDrivers')} value={stats.readyDrivers} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('admin.serviceReminder')}</h2>
            <Link to="/admin/perawatan" className="text-sm font-semibold text-brand-700 dark:text-brand-400">{t('common.seeAll')}</Link>
          </div>
          {serviceReminders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">{t('admin.noService')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 px-4 dark:divide-slate-800">
              {serviceReminders.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <Wrench className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.carUnit.plateNumber} · {m.serviceType}</p>
                    <p className="text-xs text-slate-500">{m.carUnit.carType.name} · {formatDate(m.scheduledDate)}</p>
                  </div>
                  {m.isOverdue ? <Badge tone="red">{t('admin.overdue')}</Badge> : m.status === 'IN_PROGRESS' ? <Badge tone="violet">{t('admin.inProgress')}</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-bold text-slate-900 dark:text-white">{t('admin.latestOrders')}</h2>
            <Link to="/admin/pesanan" className="text-sm font-semibold text-brand-700 dark:text-brand-400">{t('common.seeAll')}</Link>
          </div>
          {latestOrders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">{t('admin.noOrders')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 px-4 dark:divide-slate-800">
              {latestOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/pesanan?open=${o.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{o.customer.name} · {o.carType.name}</p>
                      <p className="text-xs text-slate-500">{o.orderCode} · {formatDateTime(o.startTime)}</p>
                    </div>
                    <StatusBadge status={statusKey(o.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
