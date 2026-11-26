// Dashboard pelanggan (Dev 2): ringkasan setelah login.
// Data dari GET /api/bookings/dashboard, diperbarui realtime lewat event socket "order:status:update" (Dev 3).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlarmClock, CalendarClock, CarFront, ChevronRight, CircleCheck, CreditCard, KeyRound, Lock, MapPin, MessageCircle,
  Navigation, Phone, ReceiptText, RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, UserRound, Wallet,
} from 'lucide-react';
import { myDashboard } from '../../lib/adapters';
import { useAuth } from '../../lib/auth';
import { useOrderUpdates } from '../../lib/useOrderUpdates';
import { dateStrWIB, formatDate, formatDateTime, formatIDR, localHour } from '../../lib/format';
import { Badge, Button, CarImage, ErrorNote, Spinner, StatusBadge } from '../../components/ui';
import { toSearchParams } from './HomePage';
import { ADMIN_WHATSAPP, DEFAULT_CITY, REGION_LABEL, waLink } from './palu';

/** Jam sekarang, diperbarui tiap `ms` (untuk hitung mundur dan progres sewa). */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "dalam 3 hari" / "in 2 hours" */
function useRelative() {
  const { i18n } = useTranslation();
  return (to, now = Date.now()) => {
    const rtf = new Intl.RelativeTimeFormat(i18n.language === 'en' ? 'en' : 'id', { numeric: 'auto' });
    const s = (new Date(to).getTime() - now) / 1000;
    if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    return rtf.format(Math.round(s / 86400), 'day');
  };
}

/** Lama waktu dalam bentuk pendek: "2 hari 3 jam", "5 jam 20 mnt", "12 mnt". */
function useDuration() {
  const { t } = useTranslation();
  return (ms) => {
    const m = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    if (d) return t('dashboard.durDH', { d, h });
    if (h) return t('dashboard.durHM', { h, m: m % 60 });
    return t('dashboard.durM', { m });
  };
}

const quickLink = (service, pkg, extra = {}) =>
  `/cari?${toSearchParams({ service, package: pkg, city: DEFAULT_CITY, date: dateStrWIB(1), time: '08:00', qty: 1, ...extra })}`;

export function DashboardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ['customer-dashboard'], queryFn: myDashboard, refetchInterval: 60_000 });

  // Status pesanan berubah (dibayar, unit ditugaskan, mulai, selesai) -> muat ulang ringkasan.
  useOrderUpdates(() => {
    qc.invalidateQueries({ queryKey: ['customer-dashboard'] });
    qc.invalidateQueries({ queryKey: ['my-bookings'] });
  });

  const hour = localHour();
  const greet = hour < 4 ? 'greetNight' : hour < 11 ? 'greetMorning' : hour < 15 ? 'greetAfternoon' : hour < 18 ? 'greetEvening' : 'greetNight';
  const docs = Object.fromEntries((data?.documents || []).map((d) => [d.type, d]));
  const docsApproved = docs.KTP?.status === 'APPROVED' && docs.SIM?.status === 'APPROVED';

  return (
    <div className="pb-6">
      {/* Sapaan + statistik */}
      <section className="relative overflow-hidden bg-brand-800 text-white dark:bg-brand-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_110%_-20%,rgba(245,184,61,0.22),transparent_60%),radial-gradient(30rem_18rem_at_-10%_130%,rgba(21,150,118,0.55),transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-4 pt-5 pb-16 sm:pt-8">
          <p className="text-sm text-brand-100/90">{t(`dashboard.${greet}`)},</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{user.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-100/80 sm:text-sm">
            <MapPin className="h-3.5 w-3.5" /> {REGION_LABEL} · {formatDate(Date.now(), { weekday: 'long', year: undefined })}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: CalendarClock, label: t('dashboard.statActive'), value: data ? data.stats.activeCount : '–' },
              { icon: CircleCheck, label: t('dashboard.statCompleted'), value: data ? data.stats.completedCount : '–' },
              { icon: Wallet, label: t('dashboard.statSpent'), value: data ? formatIDR(data.stats.totalSpent) : '–', small: true },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15 sm:p-3">
                <dt className="flex items-center gap-1 text-[11px] leading-tight text-brand-100/90 sm:text-xs">
                  <s.icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" /> {s.label}
                </dt>
                <dd className={`mt-1 font-extrabold tabular-nums ${s.small ? 'truncate text-[13px] sm:text-lg' : 'text-xl sm:text-2xl'}`}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="relative mx-auto -mt-10 max-w-5xl px-4">
        {isLoading && <div className="card"><Spinner /></div>}
        <ErrorNote error={error} />
        {data && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="space-y-4">
              {data.pendingPayment.map((b) => <PendingPaymentCard key={b.id} booking={b} />)}
              {data.current ? <CurrentRentalCard booking={data.current} /> : data.upcoming[0] ? <UpcomingCard booking={data.upcoming[0]} /> : <NoTripCard hasPending={data.pendingPayment.length > 0} />}
              {data.current && data.upcoming[0] && <UpcomingCard booking={data.upcoming[0]} compact />}
              {data.upcoming.slice(1).map((b) => <UpcomingCard key={b.id} booking={b} compact />)}
              <QuickBook docsApproved={docsApproved} last={data.lastCompleted} />
              <RecentBookings list={data.recent} />
            </div>
            <aside className="space-y-4">
              <VerificationCard docs={docs} approved={docsApproved} />
              <ProfileCard user={user} complete={data.profileComplete} memberSince={data.stats.memberSince} />
              <HelpCard name={user.name} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-bold text-slate-900 dark:text-white">{children}</h2>
      {action}
    </div>
  );
}

function PendingPaymentCard({ booking: b }) {
  const { t } = useTranslation();
  const now = useNow(1000);
  const s = Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - now) / 1000));
  const left = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="card flex flex-col gap-3 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-amber-950"><AlarmClock className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="font-bold text-amber-950 dark:text-amber-100">{t('dashboard.payTitle')}</p>
          <p className="truncate text-sm text-amber-900/80 dark:text-amber-200/80">{b.carType.name} · {formatDateTime(b.startAt)}</p>
          <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">
            {t('dashboard.payLeft')} <span className="font-extrabold tabular-nums">{left}</span> · <span className="font-semibold">{formatIDR(b.totalPrice)}</span>
          </p>
        </div>
      </div>
      <Button as={Link} to={`/pesanan/${b.id}`} className="w-full sm:w-auto">
        <CreditCard className="h-4 w-4" /> {t('detail.payNow')}
      </Button>
    </div>
  );
}

function CurrentRentalCard({ booking: b }) {
  const { t } = useTranslation();
  const now = useNow(30_000);
  const duration = useDuration();
  const start = new Date(b.startedAt || b.startAt).getTime();
  const end = new Date(b.endAt).getTime();
  const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const withDriver = b.service === 'WITH_DRIVER';

  return (
    <section className="card overflow-hidden ring-2 ring-brand-600/70 dark:ring-brand-500/60">
      <div className="flex items-center justify-between gap-2 bg-brand-700 px-4 py-2 text-sm font-semibold text-white dark:bg-brand-800">
        <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-sun-400" />{t('dashboard.currentTitle')}</span>
        <span className="text-xs text-brand-100">{b.code}</span>
      </div>
      <div className="p-4">
        <div className="flex gap-3">
          <CarImage type={b.carType} className="h-16 w-24 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">{t(`service.${b.service}`)} · {t(`package.${b.package}`)}</p>
            <p className="truncate font-bold text-slate-900 dark:text-white">{b.carType.name}</p>
            {b.unit && <p className="mt-0.5 inline-block rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-bold tracking-wider text-white dark:bg-slate-700">{b.unit.plate}</p>}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs font-semibold">
            <span className="text-brand-700 dark:text-brand-400">{t('dashboard.remaining', { time: duration(end - now) })}</span>
            <span className="text-slate-500">{withDriver ? t('dashboard.endsAt') : t('dashboard.returnBy')} {formatDateTime(b.endAt)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {withDriver && b.driver && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{b.driver.name[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">{t('detail.driver')}</p>
              <p className="truncate font-semibold text-slate-900 dark:text-white">{b.driver.name}</p>
            </div>
            {b.driver.phone && (
              <>
                <Button as="a" href={`tel:${b.driver.phone}`} variant="secondary" size="icon" aria-label={t('dashboard.call')}><Phone className="h-4 w-4" /></Button>
                <Button as="a" href={waLink(b.driver.phone)} target="_blank" rel="noreferrer" variant="soft" size="icon" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
              </>
            )}
          </div>
        )}

        <Button as={Link} to={`/pesanan/${b.id}`} variant={withDriver ? 'primary' : 'secondary'} className="mt-4 w-full">
          {withDriver ? <><Navigation className="h-4 w-4" /> {t('dashboard.trackDriver')}</> : t('dashboard.seeDetail')}
        </Button>
      </div>
    </section>
  );
}

function UpcomingCard({ booking: b, compact }) {
  const { t } = useTranslation();
  const now = useNow(60_000);
  const relative = useRelative();
  const info = b.status === 'CONFIRMED' ? t('dashboard.unitReady', { plate: b.unit?.plate || '-' }) : t('dashboard.preparing');

  if (compact) {
    return (
      <Link to={`/pesanan/${b.id}`} className="card flex items-center gap-3 p-3 transition hover:shadow-md">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"><CalendarClock className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{b.carType.name}</p>
          <p className="truncate text-xs text-slate-500">{t('dashboard.startsIn', { time: relative(b.startAt, now) })} · {formatDateTime(b.startAt)}</p>
        </div>
        <StatusBadge status={b.status} />
      </Link>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <span className="text-sm font-bold text-slate-900 dark:text-white">{t('dashboard.nextTitle')}</span>
        <StatusBadge status={b.status} />
      </div>
      <div className="p-4">
        <p className="text-2xl font-extrabold text-brand-700 first-letter:uppercase dark:text-brand-400">{t('dashboard.startsIn', { time: relative(b.startAt, now) })}</p>
        <div className="mt-3 flex gap-3">
          <CarImage type={b.carType} className="h-16 w-24 shrink-0 rounded-xl" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-bold text-slate-900 dark:text-white">{b.carType.name}</p>
            <p className="text-slate-500">{formatDateTime(b.startAt)}</p>
            <p className="text-slate-500">{t(`service.${b.service}`)} · {t(`package.${b.package}`)}</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex gap-2 text-slate-600 dark:text-slate-300"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span className="min-w-0">{b.pickupAddress}</span></li>
          <li className="flex gap-2 text-slate-600 dark:text-slate-300"><CarFront className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span>{info}{b.status === 'CONFIRMED' && b.driver ? ` ${t('dashboard.driverIs', { name: b.driver.name })}` : ''}</span></li>
        </ul>
        <Button as={Link} to={`/pesanan/${b.id}`} variant="secondary" className="mt-4 w-full">{t('dashboard.seeDetail')}</Button>
      </div>
    </section>
  );
}

function NoTripCard({ hasPending }) {
  const { t } = useTranslation();
  if (hasPending) return null;
  return (
    <section className="card flex items-center gap-4 p-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><CarFront className="h-6 w-6" /></span>
      <div>
        <p className="font-bold text-slate-900 dark:text-white">{t('dashboard.noTripTitle')}</p>
        <p className="text-sm text-slate-500">{t('dashboard.noTripText')}</p>
      </div>
    </section>
  );
}

function QuickBook({ docsApproved, last }) {
  const { t } = useTranslation();
  const tiles = [
    { to: quickLink('WITH_DRIVER', 'HOURS_12'), icon: UserRound, title: t('service.WITH_DRIVER'), text: t('dashboard.quickDriverText') },
    { to: quickLink('SELF_DRIVE', 'DAILY'), icon: docsApproved ? KeyRound : Lock, title: t('service.SELF_DRIVE'), text: docsApproved ? t('dashboard.quickSelfText') : t('dashboard.quickSelfLocked'), locked: !docsApproved },
  ];
  return (
    <section className="card p-4">
      <SectionTitle action={<Link to="/" className="flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-400"><SlidersHorizontal className="h-3.5 w-3.5" />{t('dashboard.customSearch')}</Link>}>
        {t('dashboard.quickTitle')}
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((x) => (
          <Link key={x.title} to={x.to} className="group rounded-xl border-2 border-slate-200 p-3 transition hover:border-brand-600 dark:border-slate-800 dark:hover:border-brand-500">
            <span className={`mb-2 grid h-9 w-9 place-items-center rounded-lg ${x.locked ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-brand-700 text-white'}`}><x.icon className="h-[18px] w-[18px]" /></span>
            <span className="block text-sm font-bold text-slate-900 dark:text-white">{x.title}</span>
            <span className={`block text-xs ${x.locked ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>{x.text}</span>
          </Link>
        ))}
      </div>
      {last && (
        <Link to={quickLink(last.service, last.package)} className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800">
          <CarImage type={last.carType} className="h-10 w-14 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-500">{t('dashboard.rebook')}</span>
            <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{last.carType.name} · {t(`package.${last.package}`)}</span>
          </span>
          <RotateCcw className="h-4 w-4 shrink-0 text-brand-600" />
        </Link>
      )}
    </section>
  );
}

function RecentBookings({ list }) {
  const { t } = useTranslation();
  return (
    <section className="card p-4">
      <SectionTitle action={list.length > 0 && <Link to="/pesanan" className="text-sm font-semibold text-brand-700 dark:text-brand-400">{t('common.seeAll')}</Link>}>
        {t('dashboard.recentTitle')}
      </SectionTitle>
      {list.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <ReceiptText className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500">{t('bookings.emptyText')}</p>
        </div>
      ) : (
        <ul className="-mx-1 divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((b) => (
            <li key={b.id}>
              <Link to={`/pesanan/${b.id}`} className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <CarImage type={b.carType} className="h-10 w-14 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{b.carType.name}</p>
                  <p className="truncate text-xs text-slate-500">{formatDate(b.startAt)} · {formatIDR(b.totalPrice)}</p>
                </div>
                <StatusBadge status={b.status} />
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const DOC_TONE = { PENDING: 'amber', APPROVED: 'brand', REJECTED: 'red' };

function VerificationCard({ docs, approved }) {
  const { t } = useTranslation();
  const rejected = Object.values(docs).some((d) => d.status === 'REJECTED');
  const pending = !rejected && docs.KTP && docs.SIM && !approved;
  const msg = approved ? 'docsReady' : rejected ? 'docsRejected' : pending ? 'docsPending' : 'docsNeeded';
  const Icon = approved ? ShieldCheck : ShieldAlert;
  return (
    <section className="card p-4">
      <SectionTitle>{t('dashboard.docsTitle')}</SectionTitle>
      <div className={`mb-3 flex gap-2 rounded-xl p-3 text-sm ${approved ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/60 dark:text-brand-100' : rejected ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t(`dashboard.${msg}`)}</span>
      </div>
      <ul className="space-y-2">
        {['KTP', 'SIM'].map((type) => (
          <li key={type} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{t(`account.doc_${type}`)}</span>
            {docs[type] ? <Badge tone={DOC_TONE[docs[type].status]}>{t(`docStatus.${docs[type].status}`)}</Badge> : <Badge>{t('account.docMissing')}</Badge>}
          </li>
        ))}
      </ul>
      {!approved && (
        <Button as={Link} to="/akun#dokumen" variant={rejected || !docs.KTP || !docs.SIM ? 'primary' : 'secondary'} size="sm" className="mt-3 w-full">
          {t('dashboard.docsAction')}
        </Button>
      )}
    </section>
  );
}

function ProfileCard({ user, complete, memberSince }) {
  const { t } = useTranslation();
  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{user.name[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900 dark:text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <p className="text-xs text-slate-400">{t('dashboard.memberSince', { date: formatDate(memberSince, { day: undefined }) })}</p>
        </div>
      </div>
      {!complete && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{t('dashboard.profileIncomplete')}</p>}
      <Button as={Link} to="/akun" variant="ghost" size="sm" className="mt-2 w-full">{t('dashboard.editProfile')}</Button>
    </section>
  );
}

function HelpCard({ name }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl bg-slate-900 p-4 text-white dark:bg-slate-800">
      <p className="font-bold">{t('dashboard.helpTitle')}</p>
      <p className="mt-1 text-sm text-slate-300">{t('dashboard.helpText')}</p>
      <Button as="a" href={waLink(ADMIN_WHATSAPP, t('dashboard.helpMessage', { name }))} target="_blank" rel="noreferrer" size="sm" className="mt-3 w-full !bg-[#25D366] !text-slate-950 hover:!bg-[#1ebe5b]">
        <MessageCircle className="h-4 w-4" /> {t('dashboard.helpButton')}
      </Button>
    </section>
  );
}
