import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, CalendarClock, UserRound, ArrowLeft, NotebookPen } from 'lucide-react';
import { api } from '../../lib/api';
import { myDocuments, searchCars } from '../../lib/adapters';
import { useAuth } from '../../lib/auth';
import { formatDateTime, formatIDR, wibToISO } from '../../lib/format';
import { PACKAGE_PRICE_FIELD } from '../../lib/constants';
import { Button, CarImage, ErrorNote, Field, Spinner } from '../../components/ui';
import { searchFromParams } from './SearchForm';
import { emptyLocation, PickupLocation } from './PickupLocation';

export function CheckoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const s = searchFromParams(params);
  const carTypeId = Number(params.get('carTypeId'));
  const user = useAuth((st) => st.user);
  const [form, setForm] = useState({ notes: '' });
  const [loc, setLoc] = useState(emptyLocation);

  const typeQ = useQuery({
    queryKey: ['type', carTypeId, s],
    queryFn: () => searchCars({ pkg: s.package, startISO: wibToISO(s.date, s.time), qty: s.qty, carTypeId }),
    enabled: Boolean(carTypeId),
  });
  const docsQ = useQuery({ queryKey: ['my-docs'], queryFn: myDocuments, enabled: s.service === 'SELF_DRIVE' });
  const create = useMutation({
    mutationFn: () => api('/bookings', { method: 'POST', body: { serviceType: s.service, packageType: s.package, pickupCity: s.city, startTime: wibToISO(s.date, s.time), duration: s.qty, carTypeId, notes: form.notes, pickupAddress: loc.address, pickupLat: loc.lat, pickupLng: loc.lng } }),
    onSuccess: ({ data }) => navigate(`/pesanan/${data.id}`, { replace: true }),
  });

  if (typeQ.isLoading) return <Spinner />;
  const type = typeQ.data?.[0];
  if (!type) return <ErrorNote className="m-4" error={typeQ.error || { message: t('common.notFound') }} />;

  const unitPrice = type[PACKAGE_PRICE_FIELD[s.package]];
  const rent = unitPrice * s.qty;
  const fees = { serviceFee: 0, deliveryFee: 0 }; // biaya tambahan belum ada di skema bersama
  const serviceFee = fees.serviceFee;
  const deliveryFee = s.service === 'SELF_DRIVE' ? fees.deliveryFee : 0;
  const total = rent + serviceFee + deliveryFee;
  const qtyUnit = s.package === 'MONTHLY' ? 'month' : s.package === 'YEARLY' ? 'year' : 'day';
  const approved = (docsQ.data || []).filter((d) => d.status === 'APPROVED').length;
  const needDocs = s.service === 'SELF_DRIVE' && docsQ.data && approved < 2;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t('common.back')}
      </button>
      <h1 className="mb-4 text-2xl font-extrabold text-slate-900 dark:text-white">{t('checkout.title')}</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <form
          id="checkout"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {needDocs && (
            <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">{t('checkout.docsRequired')}</p>
                <p className="mt-0.5">{t('checkout.docsRequiredText')}</p>
                <Link to="/akun#dokumen" className="mt-2 inline-block font-bold underline">{t('checkout.uploadDocs')}</Link>
              </div>
            </div>
          )}

          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-white"><UserRound className="h-4 w-4 text-brand-600" />{t('checkout.contact')}</h2>
            <div className="grid gap-1 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
              <p className="text-slate-500">{user.email} · {user.phone || '-'}</p>
            </div>
          </section>

          <PickupLocation service={s.service} city={s.city} value={loc} onChange={setLoc} error={create.error?.details?.pickupAddress} />

          <section className="card p-4">
            <Field label={<span className="flex items-center gap-1.5"><NotebookPen className="h-3.5 w-3.5" />{t('checkout.notes')}</span>} hint={t('checkout.notesHint')}>
              <textarea className="input" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </section>
          <ErrorNote error={create.error} />
        </form>

        <aside className="card overflow-hidden lg:sticky lg:top-20">
          <CarImage type={type} credit className="aspect-[16/9]" sizes="(min-width: 1024px) 360px, 100vw" />
          <div className="space-y-3 p-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">{type.brand} · {t(`service.${s.service}`)}</p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{type.name}</h3>
            </div>
            <div className="flex gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{formatDateTime(wibToISO(s.date, s.time))}</p>
                <p className="text-slate-500">{s.city} · {t(`package.${s.package}`)} · {t(`unit.${qtyUnit}`, { count: s.qty })}</p>
              </div>
            </div>
            <dl className="space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm dark:border-slate-700">
              <div className="flex justify-between"><dt className="text-slate-500">{formatIDR(unitPrice)} × {t(`unit.${qtyUnit}`, { count: s.qty })}</dt><dd>{formatIDR(rent)}</dd></div>
              <FeeRow label={t('checkout.serviceFee')} amount={serviceFee} />
              {s.service === 'SELF_DRIVE' && <FeeRow label={t('checkout.deliveryFee')} amount={deliveryFee} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900 dark:border-slate-700 dark:text-white"><dt>{t('checkout.total')}</dt><dd>{formatIDR(total)}</dd></div>
            </dl>
            {s.service === 'WITH_DRIVER' && <p className="text-xs text-slate-500">{t('checkout.driverIncludes')}</p>}
            <Button type="submit" form="checkout" size="lg" className="w-full" loading={create.isPending} disabled={needDocs}>
              {t('checkout.submit')}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FeeRow({ label, amount }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      {amount > 0 ? <dd>{formatIDR(amount)}</dd> : <dd className="font-semibold text-brand-700 dark:text-brand-400">{t('checkout.free')}</dd>}
    </div>
  );
}
