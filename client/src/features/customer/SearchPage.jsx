import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Briefcase, Cog, Fuel, SlidersHorizontal, CarFront, MapPin } from 'lucide-react';
import { searchCars } from '../../lib/adapters';
import { formatDateTime, formatIDR, wibToISO } from '../../lib/format';
import { Badge, Button, CarImage, EmptyState, ErrorNote, Select, Spinner } from '../../components/ui';
import { SearchForm, searchFromParams } from './SearchForm';
import { toSearchParams } from './HomePage';

export function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const s = searchFromParams(params);
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState('ALL');
  const [sort, setSort] = useState('price');
  const qtyUnit = s.package === 'MONTHLY' ? 'month' : s.package === 'YEARLY' ? 'year' : 'day';

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', s],
    enabled: Boolean(s.city),
    queryFn: () => searchCars({ pkg: s.package, startISO: wibToISO(s.date, s.time), qty: s.qty }),
  });

  const results = useMemo(() => {
    let list = data || [];
    if (category !== 'ALL') list = list.filter((r) => r.category === category);
    // Yang habis selalu di bawah, lalu urut sesuai pilihan.
    const soldOutLast = (a, b) => (a.available <= 0) - (b.available <= 0);
    list = [...list].sort((a, b) => soldOutLast(a, b) || (sort === 'seats' ? b.seats - a.seats : a.totalPrice - b.totalPrice));
    return list;
  }, [data, category, sort]);
  const categories = [...new Set((data || []).map((r) => r.category))];

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      {/* Ringkasan pencarian */}
      <div className="card mb-4 p-3 sm:p-4">
        {editing ? (
          <SearchForm
            compact
            initial={s}
            onSubmit={(v) => {
              setEditing(false);
              navigate(`/cari?${toSearchParams(v)}`, { replace: true });
            }}
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-slate-900 dark:text-white">
                {s.city} · {t(`service.${s.service}`)}
              </p>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {formatDateTime(wibToISO(s.date, s.time))} · {t(`package.${s.package}`)} · {t(`unit.${qtyUnit}`, { count: s.qty })}
              </p>
            </div>
            <Button variant="soft" size="sm" onClick={() => setEditing(true)}>
              <SlidersHorizontal className="h-4 w-4" /> {t('search.change')}
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="mb-4 flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {['ALL', ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition ${category === c ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300'}`}
              >
                {c === 'ALL' ? t('search.allTypes') : t(`category.${c}`)}
              </button>
            ))}
          </div>
          <Select
            size="sm"
            align="right"
            className="shrink-0"
            aria-label={t('search.sort')}
            value={sort}
            options={[{ value: 'price', label: t('search.sortPrice') }, { value: 'seats', label: t('search.sortSeats') }]}
            onChange={setSort}
          />
        </div>
      )}

      {isLoading && <Spinner />}
      <ErrorNote error={error} />
      {data && results.length === 0 && (
        <EmptyState icon={CarFront} title={t('search.emptyTitle')}>{t('search.emptyText')}</EmptyState>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((r) => {
          const soldOut = r.available <= 0;
          return (
            <article key={r.id} className={`card flex flex-col overflow-hidden ${soldOut ? 'opacity-60' : ''}`}>
              <div className="relative">
                <CarImage type={r} credit className="aspect-[16/9]" />
                <div className="absolute top-3 left-3">
                  {soldOut ? <Badge tone="red">{t('search.soldOut')}</Badge> : r.available <= 2 ? <Badge tone="amber">{t('search.left', { count: r.available })}</Badge> : <Badge tone="brand">{t('search.available')}</Badge>}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-xs font-semibold text-slate-500">{r.brand} · {t(`category.${r.category}`)}</p>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{r.name}</h3>
                {r.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.description}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t('car.seats', { count: r.seats })}</span>
                  <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{t('car.luggage', { count: r.luggage })}</span>
                  <span className="flex items-center gap-1"><Cog className="h-3.5 w-3.5" />{t(`transmission.${r.transmission}`)}</span>
                  <span className="flex items-center gap-1"><Fuel className="h-3.5 w-3.5" />{r.fuel}</span>
                </div>
                <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                  <div>
                    <p className="text-xs text-slate-500">{formatIDR(r.unitPrice)} × {t(`unit.${qtyUnit}`, { count: s.qty })}</p>
                    <p className="text-xl font-extrabold text-slate-900 dark:text-white">{formatIDR(r.totalPrice)}</p>
                  </div>
                  <Button disabled={soldOut} onClick={() => navigate(`/pesan?${toSearchParams(s)}&carTypeId=${r.id}`)}>
                    {t('search.choose')}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
