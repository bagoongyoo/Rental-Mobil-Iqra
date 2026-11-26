import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Search, UserRound, KeyRound } from 'lucide-react';
import { dateStrWIB, TZ_LABEL, TZ_OFFSET_HOURS } from '../../lib/format';
import { MAX_QTY, SERVICE_PACKAGES } from '../../lib/constants';
import { Button, DatePicker, Select, TimePicker } from '../../components/ui';
import { DEFAULT_CITY } from './palu';

export const defaultSearch = () => ({ service: 'WITH_DRIVER', package: 'HOURS_12', city: '', date: dateStrWIB(1), time: '08:00', qty: 1 });

/**
 * Waktu mulai paling awal yang boleh dipesan: 1 jam dari sekarang (aturan server),
 * dibulatkan ke atas per 15 menit, dalam WITA. Jika sudah lewat tengah malam, tanggalnya besok.
 */
export function earliestStart() {
  const local = new Date(Date.now() + (TZ_OFFSET_HOURS + 1) * 3600000);
  let minutes = Math.ceil((local.getUTCHours() * 60 + local.getUTCMinutes()) / 15) * 15;
  let day = local;
  if (minutes >= 24 * 60) {
    minutes = 0;
    day = new Date(local.getTime() + 86400000);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return { date: day.toISOString().slice(0, 10), time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` };
}

/** Batas rencana pemesanan: paling jauh 3 bulan dari hari ini (WITA). */
export const MAX_ADVANCE_MONTHS = 3;
export function latestStartDate() {
  const d = new Date(`${dateStrWIB(0)}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + MAX_ADVANCE_MONTHS);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // mis. 30 Nov + 3 bulan → 28/29 Feb, bukan 2 Mar
  return d.toISOString().slice(0, 10);
}

export function searchFromParams(params) {
  const d = defaultSearch();
  const service = params.get('service') === 'SELF_DRIVE' ? 'SELF_DRIVE' : 'WITH_DRIVER';
  const pkg = SERVICE_PACKAGES[service].includes(params.get('package')) ? params.get('package') : SERVICE_PACKAGES[service][0];
  return {
    service,
    package: pkg,
    city: params.get('city') || d.city,
    // Tanggal dari URL di luar rentang yang boleh (lewat atau > 3 bulan) → kembali ke default.
    date: validDate(params.get('date')) || d.date,
    time: params.get('time') || d.time,
    qty: Math.min(MAX_QTY[pkg], Math.max(1, Number(params.get('qty')) || 1)),
  };
}

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && s >= dateStrWIB(0) && s <= latestStartDate() ? s : null;
}

export function SearchForm({ initial, onSubmit, compact }) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial || defaultSearch());
  // Skema bersama belum menyimpan kota per unit; layanan saat ini di Palu.
  const data = { cities: [DEFAULT_CITY] };
  const cities = data?.cities || [];

  useEffect(() => {
    if (!v.city && cities.length) setV((s) => ({ ...s, city: cities.includes(DEFAULT_CITY) ? DEFAULT_CITY : cities[0] }));
  }, [cities, v.city]);

  const earliest = earliestStart();
  const minTime = v.date === earliest.date ? earliest.time : undefined;
  // Pilih tanggal paling awal (mis. hari ini) dengan jam yang sudah lewat → majukan jamnya.
  const setDate = (date) => setV((s) => ({ ...s, date, time: date === earliest.date && s.time < earliest.time ? earliest.time : s.time }));
  const setService = (service) => setV((s) => ({ ...s, service, package: SERVICE_PACKAGES[service][0], qty: 1 }));
  const qtyUnit = v.package === 'MONTHLY' ? 'month' : v.package === 'YEARLY' ? 'year' : 'day';

  const submit = (e) => {
    e.preventDefault();
    if (v.city) onSubmit(v);
  };

  return (
    <form onSubmit={submit} className={compact ? '' : 'card p-4 shadow-xl shadow-slate-900/5 sm:p-5'}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          { key: 'WITH_DRIVER', icon: UserRound, label: t('service.WITH_DRIVER'), sub: t('service.WITH_DRIVER_sub') },
          { key: 'SELF_DRIVE', icon: KeyRound, label: t('service.SELF_DRIVE'), sub: t('service.SELF_DRIVE_sub') },
        ].map((s) => (
          <button
            type="button"
            key={s.key}
            onClick={() => setService(s.key)}
            aria-pressed={v.service === s.key}
            className={`flex items-center gap-2.5 rounded-xl border-2 p-2.5 text-left transition sm:p-3 ${v.service === s.key ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/60' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${v.service === s.key ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
              <s.icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900 dark:text-white">{s.label}</span>
              <span className="block truncate text-xs text-slate-500">{s.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.3fr_1fr_0.8fr_1fr_0.8fr_auto] lg:items-end">
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="search-city" className="field-label">{t('search.city')}</label>
          <Select id="search-city" icon={MapPin} value={v.city} options={cities.map((c) => ({ value: c, label: c }))} onChange={(city) => setV((s) => ({ ...s, city }))} />
        </div>
        <div>
          <label htmlFor="search-date" className="field-label">{t('search.date')}</label>
          <DatePicker id="search-date" value={v.date} min={earliest.date} max={latestStartDate()} today={dateStrWIB(0)} onChange={setDate} />
        </div>
        <div>
          <label htmlFor="search-time" className="field-label">{t('search.time')} ({TZ_LABEL})</label>
          <TimePicker id="search-time" value={v.time} min={minTime} onChange={(time) => setV((s) => ({ ...s, time }))} />
        </div>
        <div>
          <label htmlFor="search-package" className="field-label">{t('search.package')}</label>
          <Select
            id="search-package"
            value={v.package}
            options={SERVICE_PACKAGES[v.service].map((p) => ({ value: p, label: t(`package.${p}`) }))}
            onChange={(pkg) => setV((s) => ({ ...s, package: pkg, qty: 1 }))}
          />
        </div>
        <div>
          <label htmlFor="search-duration" className="field-label">{t('search.duration')}</label>
          <Select
            id="search-duration"
            align="right"
            value={v.qty}
            options={Array.from({ length: MAX_QTY[v.package] }, (_, i) => ({ value: i + 1, label: t(`unit.${qtyUnit}`, { count: i + 1 }) }))}
            onChange={(qty) => setV((s) => ({ ...s, qty }))}
          />
        </div>
        <Button type="submit" size="lg" className="col-span-2 lg:col-span-1">
          <Search className="h-5 w-5" /> {t('search.submit')}
        </Button>
      </div>
    </form>
  );
}
