import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Clock3, CarFront, UserRound, MapPin, CreditCard, Navigation, LocateFixed, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateTime, formatIDR, timeAgo } from '../../lib/format';
import { getSocket } from '../../lib/socket';
import { Button, CarImage, ErrorNote, Modal, Spinner, StatusBadge, toast } from '../../components/ui';
import { mapsLink } from '../../lib/maps';

const LiveMap = lazy(() => import('../../components/map/LiveMap'));
const FLOW = ['PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'ONGOING', 'COMPLETED'];

function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!to) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [to]);
  if (!to) return null;
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Muat Snap.js Midtrans sekali saja. */
function loadSnap(clientKey, isProduction) {
  if (window.snap) return Promise.resolve(window.snap);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = isProduction ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';
    s.dataset.clientKey = clientKey;
    s.onload = () => resolve(window.snap);
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

export function BookingDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [simOpen, setSimOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [livePos, setLivePos] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['booking', id], queryFn: () => api(`/bookings/${id}`) });
  const b = data?.booking;
  const hasPin = b?.pickupLat != null && b?.pickupLng != null;
  const countdown = useCountdown(b?.status === 'PENDING_PAYMENT' ? b.expiresAt : null);
  const trackQ = useQuery({ queryKey: ['track', id], queryFn: () => api(`/tracking/bookings/${id}`), enabled: b?.status === 'ONGOING' && b?.service === 'WITH_DRIVER' });

  // Update status & posisi driver realtime
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onBooking = (p) => {
      if (String(p.id) === String(id)) {
        refetch();
        qc.invalidateQueries({ queryKey: ['my-bookings'] });
      }
    };
    const onLoc = (p) => p.booking && String(p.booking.id) === String(id) && setLivePos(p);
    socket.on('booking:updated', onBooking);
    socket.on('driver:location', onLoc);
    return () => {
      socket.off('booking:updated', onBooking);
      socket.off('driver:location', onLoc);
    };
  }, [id, refetch, qc]);

  const pay = useMutation({
    mutationFn: () => api(`/payments/${id}/pay`, { method: 'POST' }),
    onSuccess: async (res) => {
      if (res.mode === 'simulate') return setSimOpen(true);
      const snap = await loadSnap(res.clientKey, res.isProduction);
      snap.pay(res.token, { onSuccess: () => refetch(), onPending: () => refetch(), onClose: () => refetch() });
    },
  });
  const simulate = useMutation({
    mutationFn: () => api(`/payments/${id}/simulate-success`, { method: 'POST' }),
    onSuccess: () => {
      setSimOpen(false);
      toast(t('detail.paidToast'));
      refetch();
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/bookings/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      setCancelOpen(false);
      refetch();
    },
  });

  if (isLoading) return <Spinner />;
  if (!b) return <ErrorNote className="m-4" error={error} />;

  const stepIndex = FLOW.indexOf(b.status);
  const qtyUnit = b.package === 'MONTHLY' ? 'month' : b.package === 'YEARLY' ? 'year' : 'day';
  const driverPos = livePos || trackQ.data?.driver;
  const canCancel = ['PENDING_PAYMENT', 'PAID', 'CONFIRMED'].includes(b.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:py-6">
      <Link to="/pesanan" className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t('bookings.title')}
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">{t('detail.code')}</p>
          <h1 className="text-2xl font-extrabold tracking-wide text-slate-900 dark:text-white">{b.code}</h1>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {/* Langkah status */}
      {stepIndex >= 0 && (
        <ol className="card mb-4 grid grid-cols-5 gap-1 p-3">
          {FLOW.map((st, i) => (
            <li key={st} className="flex flex-col items-center gap-1 text-center">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i < stepIndex ? 'bg-brand-600 text-white' : i === stepIndex ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-600 dark:bg-brand-900 dark:text-brand-100' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[10px] leading-tight font-semibold sm:text-xs ${i <= stepIndex ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>{t(`status.${st}`)}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Pembayaran */}
      {b.status === 'PENDING_PAYMENT' && (
        <section className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('detail.payBefore')}</p>
              <p className="flex items-center gap-1.5 text-2xl font-extrabold text-amber-900 tabular-nums dark:text-amber-100"><Clock3 className="h-5 w-5" />{countdown}</p>
            </div>
            <Button size="lg" onClick={() => pay.mutate()} loading={pay.isPending}>
              <CreditCard className="h-5 w-5" /> {t('detail.payNow')}
            </Button>
          </div>
          <ErrorNote className="mt-3" error={pay.error} />
        </section>
      )}
      {b.status === 'PAID' && <p className="card mb-4 p-4 text-sm text-slate-600 dark:text-slate-300">{t('detail.waitingAssign')}</p>}
      {b.status === 'CANCELLED' && b.paidAt && <p className="card mb-4 p-4 text-sm text-slate-600 dark:text-slate-300">{t('detail.refundInfo')}</p>}

      {/* Posisi driver */}
      {b.status === 'ONGOING' && b.service === 'WITH_DRIVER' && (
        <section className="card mb-4 overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Navigation className="h-4 w-4 text-brand-600" />{t('detail.driverLocation')}</h2>
            {driverPos?.at && <span className="text-xs text-slate-500">{timeAgo(driverPos.at)}</span>}
          </div>
          {driverPos?.lat ? (
            <Suspense fallback={<Spinner />}>
              <LiveMap
                className="h-64"
                points={[
                  { id: 'driver', lat: driverPos.lat, lng: driverPos.lng, label: '🚗', title: b.driver?.name, active: true },
                  ...(hasPin ? [{ id: 'pickup', lat: b.pickupLat, lng: b.pickupLng, label: 'J', title: t('checkout.pickup'), subtitle: b.pickupAddress }] : []),
                ]}
                trail={(trackQ.data?.trail || []).map((p) => [p.lat, p.lng])}
              />
            </Suspense>
          ) : (
            <p className="px-4 pb-4 text-sm text-slate-500">{t('detail.noLocation')}</p>
          )}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex gap-3 p-4">
          <CarImage type={b.carType} className="h-20 w-28 shrink-0 rounded-xl" />
          <div>
            <p className="text-xs font-semibold text-slate-500">{t(`service.${b.service}`)} · {t(`package.${b.package}`)}</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{b.carType.brand} {b.carType.name}</h2>
            {b.unit && <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">{b.unit.plate} · {b.unit.color}</p>}
          </div>
        </div>
        <dl className="divide-y divide-slate-100 border-t border-slate-100 text-sm dark:divide-slate-800 dark:border-slate-800">
          <Row icon={Clock3} label={t('detail.schedule')}>{formatDateTime(b.startAt)} → {formatDateTime(b.endAt)}<br /><span className="text-slate-500">{t(`unit.${qtyUnit}`, { count: b.quantity })}</span></Row>
          <Row icon={MapPin} label={b.service === 'WITH_DRIVER' ? t('checkout.pickup') : t('checkout.delivery')}>
            {b.pickupAddress}, {b.city}
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {hasPin && <span className="flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-400"><LocateFixed className="h-3.5 w-3.5" />{t('pickup.pinSaved')}</span>}
              <a href={mapsLink(b)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"><ExternalLink className="h-3.5 w-3.5" />{t('pickup.openMaps')}</a>
            </span>
            {hasPin && b.status !== 'ONGOING' && (
              <Suspense fallback={null}>
                <LiveMap className="mt-2 h-40 overflow-hidden rounded-xl" points={[{ id: 'pickup', lat: b.pickupLat, lng: b.pickupLng, label: b.service === 'WITH_DRIVER' ? 'J' : 'A', title: b.pickupAddress, active: true }]} />
              </Suspense>
            )}
          </Row>
          {b.service === 'WITH_DRIVER' && <Row icon={UserRound} label={t('detail.driver')}>{b.driver ? `${b.driver.name} · ${b.driver.phone || ''}` : t('detail.notAssigned')}</Row>}
          {b.service === 'SELF_DRIVE' && <Row icon={CarFront} label={t('detail.unit')}>{b.unit ? b.unit.plate : t('detail.notAssigned')}</Row>}
          {b.notes && <Row label={t('checkout.notes')}>{b.notes}</Row>}
          <div className="flex justify-between p-4 text-base font-extrabold text-slate-900 dark:text-white">
            <span>{t('checkout.total')}</span>
            <span>{formatIDR(b.totalPrice)}</span>
          </div>
        </dl>
      </section>

      {canCancel && (
        <Button variant="ghost" className="mt-4 w-full !text-red-600 dark:!text-red-400" onClick={() => setCancelOpen(true)}>
          {t('detail.cancel')}
        </Button>
      )}

      <Modal
        open={simOpen}
        onClose={() => setSimOpen(false)}
        title={t('detail.simTitle')}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setSimOpen(false)}>{t('common.cancel')}</Button>
            <Button className="flex-1" loading={simulate.isPending} onClick={() => simulate.mutate()}>{t('detail.simPay', { amount: formatIDR(b.totalPrice) })}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('detail.simText')}</p>
        <ErrorNote className="mt-3" error={simulate.error} />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('detail.cancelTitle')}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>{t('common.back')}</Button>
            <Button variant="danger" className="flex-1" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t('detail.cancelConfirm')}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{b.paidAt ? t('detail.cancelPaidText') : t('detail.cancelText')}</p>
        <ErrorNote className="mt-3" error={cancel.error} />
      </Modal>
    </div>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 p-4">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <span className="w-4" />}
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="text-slate-900 dark:text-slate-100">{children}</dd>
      </div>
    </div>
  );
}
