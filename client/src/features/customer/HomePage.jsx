import { useNavigate, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, ShieldCheck, Wrench, Wallet, Users, Briefcase, Cog, ChevronDown, ArrowRight } from 'lucide-react';
import { listCarTypes } from '../../lib/adapters';
import { dateStrWIB, formatIDR } from '../../lib/format';
import { CarImage, CarSvg } from '../../components/ui';
import { SearchForm } from './SearchForm';
import { DEFAULT_CITY } from './palu';

export const toSearchParams = (v) => new URLSearchParams({ service: v.service, package: v.package, city: v.city, date: v.date, time: v.time, qty: String(v.qty) });

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['types'], queryFn: listCarTypes });

  const perks = [
    { icon: Wallet, title: t('home.perk1'), text: t('home.perk1Text') },
    { icon: BadgeCheck, title: t('home.perk2'), text: t('home.perk2Text') },
    { icon: Wrench, title: t('home.perk3'), text: t('home.perk3Text') },
    { icon: ShieldCheck, title: t('home.perk4'), text: t('home.perk4Text') },
  ];
  const steps = [t('home.step1'), t('home.step2'), t('home.step3')];
  const faqs = [1, 2, 3, 4, 5].map((i) => ({ q: t(`faq.q${i}`), a: t(`faq.a${i}`) }));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-800 text-white dark:bg-brand-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_110%_-10%,rgba(245,184,61,0.22),transparent_60%),radial-gradient(40rem_25rem_at_-10%_120%,rgba(21,150,118,0.55),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-6 px-4 pt-8 pb-28 sm:pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-36">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-sun-400" /> {t('home.eyebrow')}
            </p>
            <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl">{t('home.title')}</h1>
            <p className="mt-3 max-w-xl text-[15px] text-brand-100/90 sm:text-lg">{t('home.subtitle')}</p>
          </div>
          <div className="relative hidden lg:block">
            <div className="absolute inset-x-6 bottom-2 h-10 rounded-[50%] bg-black/25 blur-xl" />
            <CarSvg category="SUV" color="#f5b83d" className="relative w-full drop-shadow-2xl" />
          </div>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-24 max-w-6xl px-4 lg:-mt-28">
        <SearchForm onSubmit={(v) => navigate(`/cari?${toSearchParams(v)}`)} />
      </div>

      {/* Keunggulan */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {perks.map((p) => (
            <div key={p.title} className="card p-4">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{p.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Armada */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl dark:text-white">{t('home.fleetTitle')}</h2>
            <p className="text-sm text-slate-500">{t('home.fleetSubtitle')}</p>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {(data || []).map((type) => {
            const from = type.priceDaily ?? type.priceDriver12h;
            return (
              <Link
                key={type.id}
                to={`/cari?${toSearchParams({ service: type.priceDaily ? 'SELF_DRIVE' : 'WITH_DRIVER', package: type.priceDaily ? 'DAILY' : 'HOURS_12', city: DEFAULT_CITY, date: dateStrWIB(1), time: '08:00', qty: 1 })}`}
                className="card group w-60 shrink-0 snap-start overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg sm:w-auto"
              >
                <CarImage type={type} className="aspect-[16/9]" />
                <div className="p-3.5">
                  <p className="text-xs font-semibold text-slate-500">{type.brand} · {t(`category.${type.category}`)}</p>
                  <h3 className="font-bold text-slate-900 dark:text-white">{type.name}</h3>
                  <div className="mt-2 flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{type.seats}</span>
                    <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{type.luggage}</span>
                    <span className="flex items-center gap-1"><Cog className="h-3.5 w-3.5" />{t(`transmission.${type.transmission}`)}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {t('home.from')} <span className="text-base font-extrabold text-brand-700 dark:text-brand-400">{formatIDR(from)}</span>
                    {type.priceDaily ? t('home.perDay') : t('home.per12h')}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Cara pesan */}
      <section className="border-y border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-6 text-xl font-extrabold text-slate-900 sm:text-2xl dark:text-white">{t('home.howTitle')}</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun-400 font-extrabold text-slate-900">{i + 1}</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{s}</p>
                  <p className="text-sm text-slate-500">{t(`home.step${i + 1}Text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="mb-4 text-xl font-extrabold text-slate-900 sm:text-2xl dark:text-white">{t('home.faqTitle')}</h2>
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {faqs.map((f) => (
            <details key={f.q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900 dark:text-white">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
        <Link to="/driver/daftar" className="mt-6 flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white md:hidden dark:bg-slate-800">
          <span className="text-sm font-semibold">{t('footer.becomeDriver')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  );
}
