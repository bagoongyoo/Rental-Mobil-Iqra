// Pesanan: daftar, detail, tugaskan unit & driver, ubah status (memakai API order Dev 3).
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CarFront, MapPin, MessageCircle, Phone, ReceiptText, Search, UserRound } from 'lucide-react';
import { Button, EmptyState, ErrorNote, Modal, Select, Spinner, StatusBadge, errorText, toast } from '../../components/ui';
import { formatDateTime, formatIDR } from '../../lib/format';
import * as A from './adminApi';
import { Chips, Group, PageHeader, statusKey } from './ui';

const FILTERS = ['', 'PAID', 'CONFIRMED', 'ONGOING', 'WAITING_PAYMENT', 'COMPLETED', 'CANCELLED'];

export function AdminOrdersPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const openId = params.get('open');
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'orders'], queryFn: () => A.listOrders(), refetchInterval: 30_000 });

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter(
      (o) =>
        (!status || o.status === status || (status === 'CANCELLED' && ['CANCELLED', 'REFUNDED', 'EXPIRED'].includes(o.status))) &&
        (!s || o.orderCode.toLowerCase().includes(s) || o.customer?.name?.toLowerCase().includes(s) || o.carUnit?.plateNumber?.toLowerCase().includes(s)),
    );
  }, [data, status, q]);
  const count = (s) => (data || []).filter((o) => o.status === s).length;

  return (
    <div>
      <PageHeader title={t('admin.nav.orders')} subtitle={t('admin.ordersSub')} />
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchOrder')} aria-label={t('admin.searchOrder')} />
      </label>
      <div className="mb-4">
        <Chips
          value={status}
          onChange={(v) => setParam('status', v)}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === '' ? t('admin.all') : f === 'PAID' ? t('admin.needAssign') : t(`status.${statusKey(f)}`),
            count: f === 'PAID' ? count('PAID') : 0,
          }))}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : shown.length === 0 ? (
        <div className="card"><EmptyState icon={ReceiptText} title={t('admin.noOrders')} /></div>
      ) : (
        <ul className="space-y-2">
          {shown.map((o) => (
            <li key={o.id}>
              <button onClick={() => setParam('open', o.id)} className="card flex w-full items-start gap-3 p-3.5 text-left transition hover:border-brand-400">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-500">{o.orderCode}</span>
                    <StatusBadge status={statusKey(o.status)} />
                  </div>
                  <p className="mt-1 truncate font-semibold text-slate-900 dark:text-white">{o.customer?.name}</p>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                    {o.carType?.name} · {t(`service.${o.serviceType}`)}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5" /> {formatDateTime(o.startTime)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatIDR(o.totalPrice)}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{o.carUnit?.plateNumber || (o.status === 'PAID' ? <span className="font-sans font-semibold text-amber-600">{t('admin.needAssign')}</span> : '')}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <OrderDetail id={openId} onClose={() => setParam('open', '')} />}
    </div>
  );
}

function OrderDetail({ id, onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: o, isLoading, error } = useQuery({ queryKey: ['admin', 'order', String(id)], queryFn: () => A.getOrder(id) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    qc.invalidateQueries({ queryKey: ['admin', 'order', String(id)] });
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
    qc.invalidateQueries({ queryKey: ['admin', 'units'] });
  };
  const change = useMutation({
    mutationFn: (status) => A.setOrderStatus(id, status),
    onSuccess: (res) => {
      refresh();
      toast(t('admin.statusChanged', { status: t(`status.${statusKey(res.status)}`) }));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });

  const ask = (status, message) => (!message || window.confirm(message)) && change.mutate(status);
  const wa = o?.customer?.phone && `https://wa.me/${o.customer.phone.replace(/\D/g, '').replace(/^0/, '62')}`;

  return (
    <Modal open wide onClose={onClose} title={o ? `${t('admin.order')} ${o.orderCode}` : t('admin.order')}>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={statusKey(o.status)} />
            <span className="text-sm text-slate-500">{t(`service.${o.serviceType}`)} · {t(`package.${o.packageType}`)} × {o.duration}</span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info icon={UserRound} label={t('admin.col.customer')}>
              <p className="font-semibold">{o.customer?.name}</p>
              <p className="text-slate-500">{o.customer?.email}</p>
              {o.customer?.phone && (
                <div className="mt-1 flex gap-3">
                  <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-400"><Phone className="h-3.5 w-3.5" />{o.customer.phone}</a>
                  <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-400"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
                </div>
              )}
            </Info>
            <Info icon={CalendarClock} label={t('admin.col.schedule')}>
              <p className="font-semibold">{formatDateTime(o.startTime)}</p>
              <p className="text-slate-500">{t('admin.until')} {formatDateTime(o.endTime)}</p>
            </Info>
            <Info icon={CarFront} label={t('admin.col.car')}>
              <p className="font-semibold">{o.carType?.name}</p>
              <p className="text-slate-500">
                {o.carUnit ? <span className="font-mono">{o.carUnit.plateNumber}</span> : t('admin.noUnitYet')}
                {o.driver && ` · ${o.driver.name}`}
              </p>
            </Info>
            <Info icon={MapPin} label={t('admin.pickup')}>
              <p className="font-semibold">{o.pickupCity}</p>
              <p className="text-slate-500">{o.pickupAddress}</p>
            </Info>
          </dl>
          {o.notes && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm whitespace-pre-line dark:bg-slate-800/60">{o.notes}</p>}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
            <span className="text-sm text-slate-500">{t('admin.col.total')}</span>
            <span className="text-lg font-extrabold">{formatIDR(o.totalPrice)}</span>
          </div>

          {['PAID', 'CONFIRMED'].includes(o.status) && <AssignForm order={o} onDone={refresh} />}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            {o.status === 'CONFIRMED' && (
              <Button className="flex-1" loading={change.isPending} onClick={() => ask('ONGOING', t('admin.confirmHandOver'))}>{t('admin.handOver')}</Button>
            )}
            {o.status === 'ONGOING' && (
              <Button className="flex-1" loading={change.isPending} onClick={() => ask('COMPLETED', t('admin.confirmReturned'))}>{t('admin.returned')}</Button>
            )}
            {['WAITING_PAYMENT', 'PAID', 'CONFIRMED'].includes(o.status) && (
              <Button variant="secondary" className="flex-1 text-red-600" loading={change.isPending} onClick={() => ask('CANCELLED', t('admin.confirmCancel'))}>{t('admin.cancelOrder')}</Button>
            )}
            {(['PAID', 'CONFIRMED'].includes(o.status) || (o.status === 'CANCELLED' && o.payment?.status === 'PAID')) && (
              <Button variant="ghost" className="flex-1" loading={change.isPending} onClick={() => ask('REFUNDED', t('admin.confirmRefund'))}>{t('admin.markRefunded')}</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500 uppercase">{label}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}

function AssignForm({ order, onDone }) {
  const { t } = useTranslation();
  const needDriver = order.serviceType === 'WITH_DRIVER';
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'resources', order.id], queryFn: () => A.getResources(order) });
  const [unitId, setUnitId] = useState(order.carUnitId || '');
  const [driverId, setDriverId] = useState(order.driverId || '');
  const assign = useMutation({
    mutationFn: () => A.assignOrder(order.id, { carUnitId: Number(unitId), driverId: driverId ? Number(driverId) : null }),
    onSuccess: () => {
      onDone();
      toast(t('admin.assigned'));
    },
  });

  if (isLoading) return <Spinner className="py-4" />;
  if (error) return <ErrorNote error={error} />;

  const units = data.freeUnits.map((u) => ({ value: u.id, label: `${u.plateNumber} · ${u.color} ${u.year}` }));
  const drivers = data.freeDrivers.map((d) => ({ value: d.id, label: `${d.name}${d.isReady ? ` · ${t('admin.ready')}` : ''}` }));

  return (
    <form
      className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (unitId && (!needDriver || driverId)) assign.mutate();
      }}
    >
      <h3 className="mb-3 font-bold text-slate-900 dark:text-white">{order.status === 'PAID' ? t('admin.assignTitle') : t('admin.reassignTitle')}</h3>
      <ErrorNote error={assign.error} className="mb-3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Group label={t('admin.unit')}>
          {units.length ? (
            <Select required value={unitId} onChange={setUnitId} options={[{ value: '', label: t('admin.chooseUnit', { count: units.length }) }, ...units]} aria-label={t('admin.unit')} />
          ) : (
            <p className="text-sm text-red-600">{t('admin.noFreeUnit')}</p>
          )}
        </Group>
        {needDriver && (
          <Group label={t('admin.driver')}>
            {drivers.length ? (
              <Select required value={driverId} onChange={setDriverId} options={[{ value: '', label: t('admin.chooseDriver', { count: drivers.length }) }, ...drivers]} aria-label={t('admin.driver')} />
            ) : (
              <p className="text-sm text-red-600">{t('admin.noFreeDriver')}</p>
            )}
          </Group>
        )}
      </div>
      <Button type="submit" className="mt-3 w-full" loading={assign.isPending} disabled={!units.length || (needDriver && !drivers.length)}>
        {t('admin.assignButton')}
      </Button>
    </form>
  );
}
