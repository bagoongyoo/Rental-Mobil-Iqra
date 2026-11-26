import { Moon, Sun, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePrefs } from '../../lib/prefs';

export function ThemeToggle({ className = '' }) {
  const { t } = useTranslation();
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const next = { system: 'light', light: 'dark', dark: 'system' }[theme];
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      onClick={() => setTheme(next)}
      className={`grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
      aria-label={`${t('prefs.theme')}: ${t(`prefs.${theme}`)}`}
      title={`${t('prefs.theme')}: ${t(`prefs.${theme}`)}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function LangToggle({ className = '' }) {
  const lang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  return (
    <button
      onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
      className={`h-10 rounded-xl px-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
      aria-label={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
    >
      {lang === 'id' ? 'ID' : 'EN'}
    </button>
  );
}

/** Pilihan segmen (tab kecil). */
export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${value === o.value ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
