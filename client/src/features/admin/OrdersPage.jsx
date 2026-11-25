// Order (Dev 3 untuk logika status/penugasan, ditampilkan di panel admin Dev 1).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, ReceiptText } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, formatIDR } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorNote, Field, Modal, Spinner, StatusBadge, toast } from '../../components/ui';
import { PageTitle } from './AdminApp';
import { hasPickupPin, mapsLink } from '../../lib/maps';

const FILTERS = ['', 'ACTION', 'PENDING_PAYMENT', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

export default function OrdersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-orders', status, q], queryFn: () => api('/orders', { query: { status, q } }) });

  return (
    <>
      <PageTitle title={t('admin.nav.orders')} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder={t('admin.searchOrder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setParams(f ? { status: f } : {})}
              className={`h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${status === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}
            >
              {f === '' ? t('admin.all') : f === 'ACTION' ? t('admin.needAssign') : t(`status.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Spinner />}
      <ErrorNote error={error} />
      {data?.bookings.length === 0 && <EmptyState icon={ReceiptText} title={t('admin.noOrders')} />}

      {/* Kartu di HP, tabel di layar lebar */}
      <div className="space-y-2 md:hidden">
        {data?.bookings.map((b) => (
          <button key={b.id} onClick={() => setOpenId(b.id)} className="card block w-full p-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 dark:text-white">{b.code}</span>
              <StatusBadge status={b.status} />
            </div>
            <p className="mt-1 text-sm">{b.customer.name} · {b.carType.name}</p>
            <p className="text-xs text-slate-500">{formatDateTime(b.startAt)} · {t(`service.${b.service}`)} · {formatIDR(b.totalPrice)}</p>
          </button>
        ))}
      </div>
      {data?.bookings.length > 0 && (
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase dark:border-slate-800">
              <tr>
                {['code', 'customer', 'car', 'schedule', 'assigned', 'total', 'status'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{t(`admin.col.${h}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.bookings.map((b) => (
                <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">{b.code}</td>
                  <td className="px-3 py-2.5">{b.customer.name}<div className="text-xs text-slate-500">{b.customer.phone}</div></td>
                  <td className="px-3 py-2.5">{b.carType.name}<div className="text-xs text-slate-500">{t(`service.${b.service}`)} · {b.city}</div></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(b.startAt)}</td>
                  <td className="px-3 py-2.5 text-xs">{b.unit?.plate || '-'}<div className="text-slate-500">{b.driver?.name || ''}</div></td>
                  <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{formatIDR(b.totalPrice)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <OrderModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function OrderModal({ id, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-order', id], queryFn: () => api(`/orders/${id}`) });
  const [assign, setAssign] = useState({ unitId: '', driverId: '' });
  const done = (msg) => {
    toast(msg || t('common.saved'));
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
    qc.invalidateQueries({ queryKey: ['admin-order', id] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const action = useMutation({
    mutationFn: ({ path, body }) => api(`/orders/${id}/${path}`, { method: 'POST', body: body || {} }),
    onSuccess: () => done(),
  });
  const b = data?.booking;

  return (
    <Modal open onClose={onClose} title={b ? `${t('admin.order')} ${b.code}` : t('admin.order')} wide>
      {isLoading || !b ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <StatusBadge status={b.status} />
            <span className="text-lg font-extrabold">{formatIDR(b.totalPrice)}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label={t('admin.col.customer')}>
              {b.customer.name} {b.customer.status === 'DELETED' && <Badge>{t('admin.deletedAccounts')}</Badge>}
              <br /><span className="text-slate-500">{b.customer.phone} · {b.customer.deletedEmail || b.customer.email}</span>
            </Info>
            <Info label={t('admin.col.car')}>{b.carType.brand} {b.carType.name}<br /><span className="text-slate-500">{t(`service.${b.service}`)} · {t(`package.${b.package}`)} × {b.quantity}</span></Info>
            <Info label={t('detail.schedule')}>{formatDateTime(b.startAt)}<br />→ {formatDateTime(b.endAt)}</Info>
            <Info label={t('checkout.address')}>
              {b.pickupAddress}, {b.city}
              <br />
              <a href={mapsLink(b)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
                {hasPickupPin(b) ? t('pickup.openPin') : t('pickup.openMaps')}
              </a>
            </Info>
            {b.notes && <Info label={t('checkout.notes')}>{b.notes}</Info>}
            {b.cancelReason && <Info label={t('admin.cancelReason')}>{b.cancelReason}</Info>}
            <Info label={t('admin.col.assigned')}>{b.unit ? `${b.unit.plate} (${b.unit.color})` : '-'}{b.driver && <><br />{b.driver.name} · {b.driver.phone}</>}</Info>
          </dl>

          {data.options && (
            <form
              className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate({ path: 'assign', body: { unitId: Number(assign.unitId), driverId: assign.driverId ? Number(assign.driverId) : null } });
              }}
            >
              <p className="mb-2 font-bold">{b.status === 'PAID' ? t('admin.assignTitle') : t('admin.reassignTitle')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t('admin.unit')}>
                  <select className="input" required value={assign.unitId} onChange={(e) => setAssign({ ...assign, unitId: e.target.value })}>
                    <option value="">{t('admin.chooseUnit', { count: data.options.units.length })}</option>
                    {data.options.units.map((u) => <option key={u.id} value={u.id}>{u.plate} · {u.color} · {u.year}</option>)}
                  </select>
                </Field>
                {b.service === 'WITH_DRIVER' && (
                  <Field label={t('admin.driver')}>
                    <select className="input" required value={assign.driverId} onChange={(e) => setAssign({ ...assign, driverId: e.target.value })}>
                      <option value="">{t('admin.chooseDriver', { count: data.options.drivers.length })}</option>
                      {data.options.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.driverProfile?.isReady ? ` · ${t('driver.ready')}` : ''}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <Button type="submit" className="mt-3 w-full sm:w-auto" loading={action.isPending && action.variables?.path === 'assign'}>{t('admin.assignButton')}</Button>
            </form>
          )}

          <ErrorNote error={action.error} />
          <div className="flex flex-wrap gap-2">
            {b.status === 'CONFIRMED' && b.service === 'SELF_DRIVE' && <Button onClick={() => action.mutate({ path: 'start' })}>{t('admin.handOver')}</Button>}
            {b.status === 'ONGOING' && <Button onClick={() => action.mutate({ path: 'complete' })}>{b.service === 'SELF_DRIVE' ? t('admin.returned') : t('admin.complete')}</Button>}
            {['PENDING_PAYMENT', 'PAID', 'CONFIRMED'].includes(b.status) && (
              <Button variant="secondary" className="text-red-600" onClick={() => window.confirm(t('admin.confirmCancel')) && action.mutate({ path: 'cancel' })}>{t('admin.cancelOrder')}</Button>
            )}
            {b.status === 'CANCELLED' && b.paidAt && <Button variant="secondary" onClick={() => action.mutate({ path: 'refund' })}>{t('admin.markRefunded')}</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}
