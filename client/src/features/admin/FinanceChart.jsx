// Grafik batang pemasukan vs pengeluaran (Recharts), dimuat lazy dari AdminFinancePage.
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatIDR, formatShort } from '../../lib/format';

export default function FinanceChart({ data }) {
  const { t } = useTranslation();
  const empty = data.every((d) => !d.income && !d.expense);
  if (empty) return <p className="py-10 text-center text-sm text-slate-500">{t('admin.noTxnPeriod')}</p>;
  return (
    <div className="h-56 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={1}>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatShort} width={58} />
          <Tooltip
            cursor={{ fill: 'rgba(100,116,139,0.1)' }}
            formatter={(v, name) => [formatIDR(v), name === 'income' ? t('admin.income') : t('admin.expense')]}
            contentStyle={{ borderRadius: 12, fontSize: 13 }}
          />
          <Bar dataKey="income" fill="#159676" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#159676]" />{t('admin.income')}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />{t('admin.expense')}</span>
      </div>
    </div>
  );
}
