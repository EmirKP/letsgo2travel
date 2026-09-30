/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { DATE_LOCALES, isAppLocale, translateCopy, type AppLocale } from './locale';
import { appRegionName } from './localeFormatting';

export type { AppLocale } from './locale';

const LOCALE_KEY = "l2t-language-v1";

function initialLocale(): AppLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (isAppLocale(stored)) return stored;
  } catch {
    // Kısıtlı depolamada cihaz diline düş.
  }
  const deviceLanguage = navigator.language.toLowerCase().split('-')[0];
  return isAppLocale(deviceLanguage) ? deviceLanguage : 'en';
}

type I18nValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  copy: (tr: string, en: string, sq?: string) => string;
  countryName: (alpha3: string, fallback: string) => string;
  dateLocale: string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = (next: AppLocale) => {
    if (!isAppLocale(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // Dil bu oturumda yine değişir; yazma hatası ana akışı bozmaz.
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    return {
      locale,
      setLocale,
      copy: (tr, en, sq) => translateCopy(locale, tr, en, sq),
      countryName: (alpha3, fallback) => {
        const alpha2 = alpha2FromAlpha3(alpha3);
        return alpha2 ? appRegionName(alpha2, locale, fallback) : fallback;
      },
      dateLocale: DATE_LOCALES[locale],
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider bulunamadı.");
  return value;
}

export function localeFromStorage(): AppLocale {
  return initialLocale();
}
