// Panel driver (Dev 3), mobile-first.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, MapPin, LocateFixed, Play, Flag, Navigation, Phone, LogOut, CircleAlert, Clock3 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { getSocket } from '../../lib/socket';
import { formatDateTime, timeAgo } from '../../lib/format';
import { Badge, Button, ErrorNote, LangToggle, Logo, Spinner, StatusBadge, ThemeToggle, toast } from '../../components/ui';
import { getPosition, useConnection, useGeoPermission, useLocationSender } from './useDriverTracking';
import { directionsLink, hasPickupPin } from '../../lib/maps';

export default function DriverApp() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const conn = useConnection();
  const [perm, setPerm] = useGeoPermission();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['driver-me'], queryFn: () => api('/drivers/me'), refetchInterval: 60_000 });
  const ready = data?.profile?.isReady ?? false;

  const setReady = useMutation({
    mutationFn: async (next) => {
      if (!next) return api('/drivers/me/ready', { method: 'POST', body: { ready: false } });
      if (!conn.online) throw new Error(t('driver.needInternet'));
      let pos;
      try {
        pos = await getPosition();
      } catch (e) {
        if (e.code === 1) setPerm('denied');
        throw new Error(e.code === 1 ? t('driver.locationDenied') : t('driver.locationUnavailable'));
      }
      setPerm('granted');
      return api('/drivers/me/ready', { method: 'POST', body: { ready: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver-me'] }),
  });

  // Izin lokasi dicabut saat siap jalan -> otomatis berhenti siap jalan.
  const onDenied = useCallback(() => {
    setPerm('denied');
    api('/drivers/me/ready', { method: 'POST', body: { ready: false } }).catch(() => {}).finally(() => refetch());
  }, [refetch, setPerm]);
  const tracking = useLocationSender(ready, onDenied);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => refetch();
    socket?.on('booking:updated', onUpdate);
    return () => socket?.off('booking:updated', onUpdate);
  }, [refetch]);

  const task = useMutation({
    mutationFn: ({ id, action }) => api(`/drivers/me/tasks/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_r, v) => {
      toast(v.action === 'start' ? t('driver.started') : t('driver.finished'));
      refetch();
    },
  });

  const locationOk = perm !== 'denied' && perm !== 'unsupported';
  const canStart = ready && conn.online && locationOk;

  return (
    <div className="min-h-dvh pb-8">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <Logo to="/driver" small />
          <span className="rounded-md bg-brand-700 px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase">Driver</span>
          <div className="ml-auto flex">
            <LangToggle />
            <ThemeToggle />
            <button onClick={() => { logout(); navigate('/masuk'); }} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('nav.logout')}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-3 px-4 py-4">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{t('driver.hello', { name: user.name.split(' ')[0] })}</h1>

        {/* Status siap jalan */}
        <section className={`rounded-3xl p-4 text-white transition ${ready ? 'bg-brand-700 dark:bg-brand-800' : 'bg-slate-800 dark:bg-slate-900'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold opacity-80">{t('driver.status')}</p>
              <p className="text-2xl font-extrabold">{ready ? t('driver.ready') : t('driver.offDuty')}</p>
              {ready && <p className="mt-0.5 text-xs opacity-80">{tracking.lastSent ? t('driver.lastSent', { time: timeAgo(tracking.lastSent) }) : t('driver.sending')}</p>}
            </div>
            <button
              role="switch"
              aria-checked={ready}
              aria-label={t('driver.toggleReady')}
              disabled={setReady.isPending || isLoading}
              onClick={() => setReady.mutate(!ready)}
              className={`relative h-9 w-16 shrink-0 rounded-full transition disabled:opacity-60 ${ready ? 'bg-sun-400' : 'bg-white/25'}`}
            >
              <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${ready ? 'left-8' : 'left-1'}`} />
            </button>
          </div>
          {setReady.error && <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{setReady.error.message}</p>}
          {!ready && !setReady.error && <p className="mt-3 text-sm opacity-80">{t('driver.readyHint')}</p>}
        </section>

        {/* Syarat: internet + lokasi */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <div className={`mb-1 flex items-center gap-1.5 text-sm font-bold ${conn.online ? 'text-brand-700 dark:text-brand-400' : 'text-red-600'}`}>
              {conn.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {conn.checking ? t('driver.checking') : conn.online ? t('driver.online') : t('driver.offline')}
            </div>
            <p className="text-xs text-slate-500">{conn.online ? (conn.latency > 1500 ? t('driver.slow', { ms: conn.latency }) : t('driver.latency', { ms: conn.latency })) : t('driver.offlineHint')}</p>
            <button onClick={conn.recheck} className="mt-1 text-xs font-semibold text-brand-700 dark:text-brand-400">{t('driver.recheck')}</button>
          </div>
          <div className="card p-3">
            <div className={`mb-1 flex items-center gap-1.5 text-sm font-bold ${perm === 'granted' ? 'text-brand-700 dark:text-brand-400' : perm === 'denied' ? 'text-red-600' : 'text-amber-600'}`}>
              <LocateFixed className="h-4 w-4" />
              {t(`driver.perm_${perm}`)}
            </div>
            <p className="text-xs text-slate-500">{perm === 'denied' ? t('driver.permDeniedHint') : perm === 'granted' ? t('driver.permGrantedHint') : t('driver.permPromptHint')}</p>
            {perm === 'prompt' && <button onClick={() => getPosition().then(() => setPerm('granted')).catch((e) => e.code === 1 && setPerm('denied'))} className="mt-1 text-xs font-semibold text-brand-700 dark:text-brand-400">{t('driver.allow')}</button>}
          </div>
        </div>
        {tracking.error === 'unavailable' && ready && <ErrorNote error={{ message: t('driver.gpsWeak') }} />}

        {/* Tugas */}
        <h2 className="pt-2 font-bold text-slate-900 dark:text-white">{t('driver.tasks')}</h2>
        {isLoading && <Spinner />}
        <ErrorNote error={error || task.error} />
        {data?.tasks.length === 0 && <p className="card p-6 text-center text-sm text-slate-500">{t('driver.noTasks')}</p>}
        {data?.tasks.map((b) => (
          <article key={b.id} className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <span className="font-extrabold tracking-wide">{b.code}</span>
              <StatusBadge status={b.status} />
            </div>
            <div className="space-y-2.5 p-4 text-sm">
              <p className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{formatDateTime(b.startAt)} → {formatDateTime(b.endAt)}</p>
              <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span>{b.pickupAddress}, {b.city}{hasPickupPin(b) && <Badge tone="brand" className="ml-1.5 align-middle">{t('pickup.pinBadge')}</Badge>}</span></p>
              <p className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{b.customer.name} · <a className="font-semibold text-brand-700 dark:text-brand-400" href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></p>
              <p className="text-slate-500">{b.carType.brand} {b.carType.name} · <Badge>{b.unit?.plate}</Badge> · {t(`package.${b.package}`)} × {b.quantity}</p>
              {b.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{b.notes}</p>}
            </div>
            <div className="flex gap-2 px-4 pb-4">
              <Button as="a" variant="secondary" className="flex-1" target="_blank" rel="noreferrer" href={directionsLink(b)}>
                <Navigation className="h-4 w-4" /> {t('driver.navigate')}
              </Button>
              {b.status === 'CONFIRMED' && (
                <Button className="flex-1" disabled={!canStart} loading={task.isPending && task.variables?.id === b.id} onClick={() => task.mutate({ id: b.id, action: 'start' })}>
                  <Play className="h-4 w-4" /> {t('driver.start')}
                </Button>
              )}
              {b.status === 'ONGOING' && (
                <Button className="flex-1" loading={task.isPending && task.variables?.id === b.id} onClick={() => window.confirm(t('driver.confirmFinish')) && task.mutate({ id: b.id, action: 'finish' })}>
                  <Flag className="h-4 w-4" /> {t('driver.finish')}
                </Button>
              )}
            </div>
            {b.status === 'CONFIRMED' && !canStart && <p className="px-4 pb-4 text-xs text-amber-700 dark:text-amber-400">{t('driver.startRequirement')}</p>}
          </article>
        ))}

        {data?.history.length > 0 && (
          <>
            <h2 className="pt-2 font-bold text-slate-900 dark:text-white">{t('driver.history')}</h2>
            <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
              {data.history.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 p-3 text-sm">
                  <span>{b.code} · {b.carType.name}</span>
                  <span className="text-slate-500">{formatDateTime(b.completedAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

