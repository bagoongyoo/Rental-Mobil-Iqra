import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from './i18n';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#0b6b55');
}

export const usePrefs = create(
  persist(
    (set) => ({
      theme: 'system', // system | light | dark
      lang: 'id',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setLang: (lang) => {
        i18n.changeLanguage(lang);
        document.documentElement.lang = lang;
        set({ lang });
      },
    }),
    {
      name: 'iqra-prefs',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyTheme(state.theme);
        i18n.changeLanguage(state.lang);
        document.documentElement.lang = state.lang;
      },
    },
  ),
);

media.addEventListener('change', () => applyTheme(usePrefs.getState().theme));
