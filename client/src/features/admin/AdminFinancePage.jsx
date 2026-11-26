// Manajemen keuangan: pantau pemasukan & pengeluaran harian/mingguan/bulanan/tahunan, catat transaksi, unduh CSV.
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Badge, Button, DatePicker, EmptyState, ErrorNote, Field, Modal, Segmented, Select, Spinner, errorText, toast } from '../../components/ui';
import { dateStrWIB, formatDate, formatDateTime, formatIDR } from '../../lib/format';
import i18n from '../../lib/i18n';
import * as A from './adminApi';
import { Group, MoneyInput, PageHeader, StatTile } from './ui';

// Grafik (Recharts) dimuat terpisah supaya halaman admin lain tetap ringan.
const FinanceChart = lazy(() => import('./FinanceChart'));

const PERIODS = ['day', 'week', 'month', 'year'];

/** Geser tanggal acuan satu periode ke depan/belakang. */
function shiftDate(dateStr, period, dir) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (period === 'day') dt.setUTCDate(dt.getUTCDate() + dir);
  if (period === 'week') dt.setUTCDate(dt.getUTCDate() + 7 * dir);
  if (period === 'month') dt.setUTCMonth(dt.getUTCMonth() + dir, 1);
  if (period === 'year') dt.setUTCFullYear(dt.getUTCFullYear() + dir, 0, 1);
  return dt.toISOString().slice(0, 10);
}

function periodLabel(period, range) {
  if (!range) return '';
  const locale = i18n.language === 'en' ? 'en-GB' : 'id-ID';
  const start = new Date(range.start);
  const lastDay = new Date(new Date(range.end).getTime() - 1);
  const fmt = (d, o) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Makassar', ...o }).format(d);
  if (period === 'day') return fmt(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (period === 'week') return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(lastDay, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (period === 'month') return fmt(start, { month: 'long', year: 'numeric' });
  return fmt(start, { year: 'numeric' });
}

export function AdminFinancePage() {
  const { t } = useTranslation();
  const today = dateStrWIB();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(today);
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const query = { period, date, type: type || undefined };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin', 'finance', query],
    queryFn: () => A.getFinance(query),
    placeholderData: keepPreviousData,
  });
  // Periode yang sedang berjalan (berisi hari ini) adalah yang paling akhir; masa depan belum punya data.
  const nextDisabled = !data?.range || new Date(data.range.end).getTime() > Date.now();

  const download = async () => {
    setDownloading(true);
    try {
      await A.downloadFinanceCsv(query);
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('admin.nav.finance')}
        subtitle={t('admin.financeSub')}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> <span className="sm:hidden">{t('admin.record')}</span>
            <span className="hidden sm:inline">{t('admin.addTxn')}</span>
          </Button>
        }
      />

      <div className="space-y-3">
        <Segmented className="w-full sm:w-auto" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) }))} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" onClick={() => setDate(shiftDate(date, period, -1))} aria-label={t('common.previous')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <p className="flex-1 text-center font-bold text-slate-900 dark:text-white">{periodLabel(period, data?.range)}</p>
          <Button variant="secondary" size="icon" disabled={nextDisabled} onClick={() => setDate(shiftDate(date, period, 1))} aria-label={t('common.next')}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {date !== today && (
          <button className="mx-auto block text-sm font-semibold text-brand-700 dark:text-brand-400" onClick={() => setDate(today)}>
            {t('admin.backToNow')}
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorNote error={error} className="mt-4" />
      ) : (
        <div className={`mt-4 space-y-4 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={TrendingUp} label={t('admin.income')} value={formatIDR(data.totals.income)} tone="brand" />
            <StatTile icon={TrendingDown} label={t('admin.expense')} value={formatIDR(data.totals.expense)} tone="red" />
            <div className="col-span-2 sm:col-span-1">
              <StatTile icon={Wallet} label={t('admin.profit')} value={formatIDR(data.totals.profit)} tone={data.totals.profit < 0 ? 'red' : 'slate'} />
            </div>
          </div>

          <section className="card p-4">
            <h2 className="mb-3 font-bold text-slate-900 dark:text-white">{t('admin.chartTitle')}</h2>
            <Suspense fallback={<div className="h-56 sm:h-64" />}>
              <FinanceChart data={data.chart} />
            </Suspense>
          </section>

          {data.byCategory.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold text-slate-900 dark:text-white">{t('admin.byCategory')}</h2>
              <CategoryBars items={data.byCategory} totals={data.totals} />
            </section>
          )}

          <section className="card">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
              <h2 className="flex-1 font-bold text-slate-900 dark:text-white">{t('admin.transactions', { count: data.totals.count })}</h2>
              <Button size="sm" variant="secondary" loading={downloading} onClick={download}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
            <div className="px-4 pt-3">
              <Segmented
                value={type}
                onChange={setType}
                className="w-full sm:w-auto"
                options={[
                  { value: '', label: t('admin.all') },
                  { value: 'INCOME', label: t('admin.income') },
                  { value: 'EXPENSE', label: t('admin.expense') },
                ]}
              />
            </div>
            <TransactionList items={data.transactions} />
          </section>
        </div>
      )}

      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function CategoryBars({ items, totals }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3">
      {items.map((c) => {
        const base = c.type === 'INCOME' ? totals.income : totals.expense;
        const pct = base ? Math.round((c.total / base) * 100) : 0;
        return (
          <li key={`${c.type}-${c.category}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">
                {c.category} <span className="text-xs font-normal text-slate-500">· {c.type === 'INCOME' ? t('admin.income') : t('admin.expense')}</span>
              </span>
              <span className="font-bold">{formatIDR(c.total)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${c.type === 'INCOME' ? 'bg-brand-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TransactionList({ items }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: A.deleteTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      toast(t('admin.deleted'));
    },
    onError: (e) => toast(errorText(e, t), 'error'),
  });

  if (items.length === 0) return <EmptyState icon={Receipt} title={t('admin.noTxnPeriod')} />;
  return (
    <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((x) => {
        const ref = x.order?.orderCode || (x.maintenance && `${x.maintenance.carUnit?.plateNumber || ''}`);
        return (
          <li key={x.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${x.type === 'INCOME' ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300'}`}>
              {x.type === 'INCOME' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {x.category}
                {x.source !== 'MANUAL' && <Badge tone="blue">{t('admin.auto')}</Badge>}
              </p>
              <p className="truncate text-xs text-slate-500">
                {formatDateTime(x.transactionDate)}
                {(x.description || ref) && ` · ${x.description || ref}`}
              </p>
            </div>
            <p className={`text-sm font-bold whitespace-nowrap ${x.type === 'INCOME' ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>
              {x.type === 'INCOME' ? '+' : '−'}
              {formatIDR(x.amount)}
            </p>
            {x.source === 'MANUAL' && (
              <button
                onClick={() => window.confirm(t('admin.confirmDeleteTxn')) && remove.mutate(x.id)}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                aria-label={t('common.delete')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TransactionForm({ onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const today = dateStrWIB();
  const { data: categories } = useQuery({ queryKey: ['admin', 'categories'], queryFn: A.getCategories, staleTime: Infinity });
  const [form, setForm] = useState({ type: 'EXPENSE', category: 'BBM', amount: '', description: '', date: today });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const options = (categories?.[form.type] || []).map((c) => ({ value: c, label: c }));

  const save = useMutation({
    mutationFn: () =>
      A.addTransaction({
        type: form.type,
        category: form.category,
        amount: form.amount,
        description: form.description || null,
        // Tanggal hari ini memakai jam sekarang; tanggal lampau dicatat pukul 12:00 WITA.
        transactionDate: form.date === today ? new Date().toISOString() : new Date(`${form.date}T12:00:00+08:00`).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      toast(t('admin.txnSaved'));
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.addTxn')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button form="txn-form" type="submit" className="flex-1" loading={save.isPending}>{t('common.save')}</Button>
        </>
      }
    >
      <form
        id="txn-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ErrorNote error={save.error} />
        <Segmented
          className="w-full"
          value={form.type}
          onChange={(type) => setForm((f) => ({ ...f, type, category: categories?.[type]?.[0] || '' }))}
          options={[
            { value: 'EXPENSE', label: t('admin.expense') },
            { value: 'INCOME', label: t('admin.income') },
          ]}
        />
        <Field label={t('admin.amount')}>
          <MoneyInput value={form.amount} onChange={set('amount')} autoFocus required />
        </Field>
        <Group label={t('admin.category')}>
          <Select value={form.category} onChange={set('category')} options={options} aria-label={t('admin.category')} />
        </Group>
        <Group label={t('admin.date')}>
          <DatePicker value={form.date} today={today} min={shiftDate(today, 'year', -5)} max={today} onChange={set('date')} />
        </Group>
        <Field label={t('admin.note')}>
          <input className="input" value={form.description} onChange={set('description')} placeholder={t('admin.notePlaceholder')} maxLength={500} />
        </Field>
        {form.date !== today && <p className="text-xs text-slate-500">{t('admin.pastDateNote', { date: formatDate(`${form.date}T12:00:00+08:00`) })}</p>}
      </form>
    </Modal>
  );
}
