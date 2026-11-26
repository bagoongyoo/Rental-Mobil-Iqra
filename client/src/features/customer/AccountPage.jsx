import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, ShieldCheck } from 'lucide-react';
import { myDocuments } from '../../lib/adapters';
import { useAuth } from '../../lib/auth';
import { usePrefs } from '../../lib/prefs';
import { Button, Field, Segmented } from '../../components/ui';
import { DocumentUpload } from './DocumentUpload';

export function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme, lang, setLang } = usePrefs();
  const docsQ = useQuery({ queryKey: ['my-docs'], queryFn: myDocuments });
  const docs = Object.fromEntries((docsQ.data || []).map((d) => [d.type, d]));

  useEffect(() => {
    if (window.location.hash === '#dokumen') document.getElementById('dokumen')?.scrollIntoView();
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('account.title')}</h1>

      <section className="card p-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-white">{t('account.profile')}</h2>
        {/* Ubah profil menunggu endpoint modul users (Dev 1). Sementara hanya ditampilkan. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('auth.name')}><input className="input" value={user.name || ''} disabled /></Field>
          <Field label={t('auth.phone')}><input className="input" value={user.phone || '-'} disabled /></Field>
          <Field label="Email" className="sm:col-span-2"><input className="input" value={user.email} disabled /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">{t('account.profileSoon')}</p>
        </div>
      </section>

      <section id="dokumen" className="card scroll-mt-20 p-4">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-4 w-4 text-brand-600" />{t('account.documents')}</h2>
        <p className="mt-1 mb-3 text-sm text-slate-500">{t('account.documentsText')}</p>
        <div className="space-y-2">
          <DocumentUpload type="KTP" doc={docs.KTP} />
          <DocumentUpload type="SIM" doc={docs.SIM} />
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="font-bold text-slate-900 dark:text-white">{t('prefs.title')}</h2>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t('prefs.language')}</span>
          <Segmented value={lang} onChange={setLang} options={[{ value: 'id', label: 'Indonesia' }, { value: 'en', label: 'English' }]} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t('prefs.theme')}</span>
          <Segmented value={theme} onChange={setTheme} options={['system', 'light', 'dark'].map((v) => ({ value: v, label: t(`prefs.${v}`) }))} />
        </div>
      </section>

      <Button
        variant="ghost"
        className="w-full !text-red-600 dark:!text-red-400"
        onClick={() => {
          logout();
          navigate('/');
        }}
      >
        <LogOut className="h-4 w-4" /> {t('nav.logout')}
      </Button>

    </div>
  );
}
