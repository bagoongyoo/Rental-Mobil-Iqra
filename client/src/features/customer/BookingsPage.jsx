import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ReceiptText, ChevronRight } from 'lucide-react';
import { myBookings } from '../../lib/adapters';
import { formatDateTime, formatIDR } from '../../lib/format';
import { ACTIVE_STATUSES } from '../../lib/constants';
import { Button, CarImage, EmptyState, ErrorNote, Segmented, Spinner, StatusBadge } from '../../components/ui';

export function BookingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('active');
  const { data, isLoading, error } = useQuery({ queryKey: ['my-bookings'], queryFn: myBookings });
  const list = (data || []).filter((b) => (tab === 'active' ? ACTIVE_STATUSES.includes(b.status) : !ACTIVE_STATUSES.includes(b.status)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
      <h1 className="mb-4 text-2xl font-extrabold text-slate-900 dark:text-white">{t('bookings.title')}</h1>
      <Segmented className="mb-4 w-full sm:w-auto" value={tab} onChange={setTab} options={[{ value: 'active', label: t('bookings.active') }, { value: 'history', label: t('bookings.history') }]} />
      {isLoading && <Spinner />}
      <ErrorNote error={error} />
      {data && list.length === 0 && (
        <EmptyState icon={ReceiptText} title={t('bookings.empty')} action={<Button as={Link} to="/">{t('bookings.bookNow')}</Button>}>
          {t('bookings.emptyText')}
        </EmptyState>
      )}
      <div className="space-y-3">
        {list.map((b) => (
          <Link key={b.id} to={`/pesanan/${b.id}`} className="card flex items-center gap-3 p-3 transition hover:shadow-md">
            <CarImage type={b.carType} className="h-16 w-24 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <StatusBadge status={b.status} />
                <span className="text-xs text-slate-400">{b.code}</span>
              </div>
              <p className="truncate font-bold text-slate-900 dark:text-white">{b.carType.name}</p>
              <p className="truncate text-xs text-slate-500">{formatDateTime(b.startAt)} · {formatIDR(b.totalPrice)}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
