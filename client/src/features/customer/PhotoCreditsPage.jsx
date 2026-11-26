// Kredit foto mobil bawaan (Dev 2). Wajib ada karena sebagian foto berlisensi CC BY-SA 4.0.
import { useTranslation } from 'react-i18next';
import { CAR_PHOTOS } from '../../components/ui';

export function PhotoCreditsPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('credits.title')}</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500">{t('credits.text')}</p>
      <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
        {CAR_PHOTOS.map((p) => (
          <li key={p.key} className="flex items-center gap-3 p-3">
            <img src={`/cars/${p.key}-400.webp`} alt={p.model} loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{p.model}</p>
              <p className="text-slate-500">
                {t('credits.by')} <a href={p.source} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">{p.author}</a>
                {' · '}<a href={p.licenseUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.license}</a>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-400">{t('credits.note')}</p>
    </div>
  );
}
