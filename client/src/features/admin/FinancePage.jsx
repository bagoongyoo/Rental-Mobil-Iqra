// Keuangan (Dev 1): laporan harian/mingguan/bulanan/tahunan, grafik, input transaksi, ekspor CSV.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Plus, TrendingUp, TrendingDown, Scale, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { dateStrWIB, formatDate, formatIDR, formatShort, TZ } from '../../lib/format';
import { Badge, Button, ErrorNote, Field, Modal, Segmented, Spinner, toast } from '../../components/ui';
import { PageTitle, Stat } from './AdminApp';

const shift = (dateStr, period, dir) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (period === 'day') d.setUTCDate(d.getUTCDate() + dir);
  if (period === 'week') d.setUTCDate(d.getUTCDate() + 7 * dir);
  if (period === 'month') d.setUTCMonth(d.getUTCMonth() + dir, 1);
  if (period === 'year') d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
};

export default function FinancePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(dateStrWIB(0));
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['finance', period, date, type], queryFn: () => api('/finance/summary', { query: { period, date, type } }) });

  const exportCsv = useMutation({
    mutationFn: async () => {
      const blob = await apiBlob('/finance/export', { period, date, type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `keuangan-${period}-${date}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  });
  const del = useMutation({
    mutationFn: (id) => api(`/finance/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });

  const rangeLabel = data ? (period === 'day' ? formatDate(data.from, { weekday: 'long' }) : period === 'year' ? date.slice(0, 4) : period === 'month' ? new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(data.from)) : `${formatDate(data.from)} – ${formatDate(new Date(new Date(data.to).getTime() - 1))}`) : '';
  const tickLabel = (l) => (period === 'day' ? l.slice(0, 2) : period === 'year' ? new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(`${l}-15`)) : String(Number(l.slice(8))));

  return (
    <>
      <PageTitle
        title={t('admin.nav.finance')}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => exportCsv.mutate()} loading={exportCsv.isPending}><Download className="h-4 w-4" /> CSV</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('admin.addTxn')}</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={period} onChange={setPeriod} options={['day', 'week', 'month', 'year'].map((p) => ({ value: p, label: t(`period.${p}`) }))} />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setDate(shift(date, period, -1))} aria-label={t('common.previous')}><ChevronLeft className="h-5 w-5" /></Button>
          <span className="min-w-36 text-center text-sm font-bold">{rangeLabel}</span>
          <Button size="icon" variant="ghost" onClick={() => setDate(shift(date, period, 1))} aria-label={t('common.next')}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <input type="date" className="input h-9 w-auto text-sm" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <select className="input h-9 w-auto text-sm" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('admin.allTxn')}</option>
          <option value="INCOME">{t('admin.income')}</option>
          <option value="EXPENSE">{t('admin.expense')}</option>
        </select>
      </div>

      {isLoading && <Spinner />}
      <ErrorNote error={error || exportCsv.error} />
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label={t('admin.income')} value={formatIDR(data.totals.income)} tone="brand" icon={TrendingUp} />
            <Stat label={t('admin.expense')} value={formatIDR(data.totals.expense)} tone="red" icon={TrendingDown} />
            <Stat label={t('admin.profit')} value={formatIDR(data.totals.profit)} tone={data.totals.profit >= 0 ? 'slate' : 'red'} icon={Scale} />
          </div>

          <section className="card mt-4 p-4">
            <h2 className="mb-2 font-bold text-slate-900 dark:text-white">{t('admin.chartTitle')}</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ left: -8, right: 4, top: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickFormatter={tickLabel} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip formatter={(v) => formatIDR(v)} labelFormatter={tickLabel} contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ fillOpacity: 0.06 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name={t('admin.income')} fill="#159676" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expense" name={t('admin.expense')} fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
            <section className="card p-4">
              <h2 className="mb-3 font-bold text-slate-900 dark:text-white">{t('admin.byCategory')}</h2>
              <ul className="space-y-2 text-sm">
                {data.byCategory.map((c) => (
                  <li key={`${c.type}${c.category}`} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${c.type === 'INCOME' ? 'bg-brand-500' : 'bg-red-400'}`} />{c.category}</span>
                    <span className="font-semibold tabular-nums">{formatIDR(c.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card overflow-hidden">
              <h2 className="p-4 pb-2 font-bold text-slate-900 dark:text-white">{t('admin.transactions', { count: data.totals.count })}</h2>
              <ul className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {data.transactions.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{tx.category} {tx.isAuto && <Badge className="ml-1">{t('admin.auto')}</Badge>}</p>
                      <p className="truncate text-xs text-slate-500">{formatDate(tx.date)}{tx.note ? ` · ${tx.note}` : ''}</p>
                    </div>
                    <span className={`font-bold whitespace-nowrap tabular-nums ${tx.type === 'INCOME' ? 'text-brand-700 dark:text-brand-400' : 'text-red-600'}`}>{tx.type === 'INCOME' ? '+' : '−'}{formatIDR(tx.amount)}</span>
                    {!tx.isAuto && (
                      <button onClick={() => window.confirm(t('admin.confirmDelete')) && del.mutate(tx.id)} className="text-slate-400 hover:text-red-600" aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      {adding && <TxnForm onClose={() => setAdding(false)} />}
    </>
  );
}

function TxnForm({ onClose }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['finance-cats'], queryFn: () => api('/finance/categories') });
  const [f, setF] = useState({ type: 'EXPENSE', category: 'BBM', amount: '', date: dateStrWIB(0), note: '' });
  const list = f.type === 'INCOME' ? cats.data?.income : cats.data?.expense;
  const save = useMutation({
    mutationFn: () => api('/finance/transactions', { method: 'POST', body: { ...f, amount: Number(f.amount) } }),
    onSuccess: () => {
      toast(t('common.saved'));
      qc.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.addTxn')}
      footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="txn" className="flex-1" loading={save.isPending}>{t('common.save')}</Button></>}
    >
      <form
        id="txn"
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Segmented className="col-span-2" value={f.type} onChange={(type) => setF({ ...f, type, category: (type === 'INCOME' ? cats.data?.income : cats.data?.expense)?.[0] || '' })} options={[{ value: 'EXPENSE', label: t('admin.expense') }, { value: 'INCOME', label: t('admin.income') }]} />
        <Field label={t('admin.category')}>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{list?.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label={t('admin.date')}><input type="date" className="input" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t('admin.amount')} className="col-span-2"><input type="number" min={1} step={500} className="input" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="150000" /></Field>
        <Field label={t('checkout.notes')} className="col-span-2"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorNote error={save.error} className="col-span-2" />
      </form>
    </Modal>
  );
}
