import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru';
import en from './locales/en';
import he from './locales/he';

export const languages = [
  { code: 'he', label: 'עברית', dir: 'rtl' as const },
  { code: 'ru', label: 'Русский', dir: 'ltr' as const },
  { code: 'en', label: 'English', dir: 'ltr' as const },
];

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    he: { translation: he },
  },
  lng: localStorage.getItem('lang') ?? 'he',
  fallbackLng: 'he',
  interpolation: { escapeValue: false },
});

export function applyDocumentDirection(lang: string) {
  const meta = languages.find((l) => l.code === lang) ?? languages[0];
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
}

applyDocumentDirection(i18n.language);

i18n.on('languageChanged', applyDocumentDirection);

export default i18n;
