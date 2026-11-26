import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Clock, Search, UserRound, KeyRound } from 'lucide-react';
import { dateStrWIB, TZ_LABEL } from '../../lib/format';
import { MAX_QTY, SERVICE_PACKAGES } from '../../lib/constants';
import { Button, DatePicker } from '../../components/ui';
import { DEFAULT_CITY } from './palu';

export const defaultSearch = () => ({ service: 'WITH_DRIVER', package: 'HOURS_12', city: '', date: dateStrWIB(1), time: '08:00', qty: 1 });

export function searchFromParams(params) {
  const d = defaultSearch();
  const service = params.get('service') === 'SELF_DRIVE' ? 'SELF_DRIVE' : 'WITH_DRIVER';
  const pkg = SERVICE_PACKAGES[service].includes(params.get('package')) ? params.get('package') : SERVICE_PACKAGES[service][0];
  return {
    service,
    package: pkg,
    city: params.get('city') || d.city,
    date: params.get('date') || d.date,
    time: params.get('time') || d.time,
    qty: Math.min(MAX_QTY[pkg], Math.max(1, Number(params.get('qty')) || 1)),
  };
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

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
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
        <label className="col-span-2 lg:col-span-1">
          <span className="field-label">{t('search.city')}</span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-600" />
            <select className="input appearance-none pl-9" value={v.city} onChange={set('city')} required>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </label>
        <div>
          <label htmlFor="search-date" className="field-label">{t('search.date')}</label>
          <DatePicker id="search-date" value={v.date} min={dateStrWIB(0)} today={dateStrWIB(0)} onChange={(date) => setV((s) => ({ ...s, date }))} />
        </div>
        <label>
          <span className="field-label">{t('search.time')} ({TZ_LABEL})</span>
          <div className="relative">
            <Clock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-600" />
            <input type="time" className="input pl-9" value={v.time} step="900" onChange={set('time')} required />
          </div>
        </label>
        <label>
          <span className="field-label">{t('search.package')}</span>
          <select className="input" value={v.package} onChange={(e) => setV((s) => ({ ...s, package: e.target.value, qty: 1 }))}>
            {SERVICE_PACKAGES[v.service].map((p) => <option key={p} value={p}>{t(`package.${p}`)}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">{t('search.duration')}</span>
          <select className="input" value={v.qty} onChange={(e) => setV((s) => ({ ...s, qty: Number(e.target.value) }))}>
            {Array.from({ length: MAX_QTY[v.package] }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{t(`unit.${qtyUnit}`, { count: n })}</option>
            ))}
          </select>
        </label>
        <Button type="submit" size="lg" className="col-span-2 lg:col-span-1">
          <Search className="h-5 w-5" /> {t('search.submit')}
        </Button>
      </div>
    </form>
  );
}
