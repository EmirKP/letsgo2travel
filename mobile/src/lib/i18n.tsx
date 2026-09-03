/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { alpha2FromAlpha3 } from "../data/countryIso";

export type AppLocale = "tr" | "en";

const LOCALE_KEY = "l2t-language-v1";

function initialLocale(): AppLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "tr" || stored === "en") return stored;
  } catch {
    // Kısıtlı depolamada cihaz diline düş.
  }
  return navigator.language.toLocaleLowerCase().startsWith("tr") ? "tr" : "en";
}

type I18nValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  copy: (tr: string, en: string) => string;
  countryName: (alpha3: string, fallback: string) => string;
  dateLocale: string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = (next: AppLocale) => {
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
    const displayNames = new Intl.DisplayNames(locale === "tr" ? "tr-TR" : "en-GB", { type: "region" });
    return {
      locale,
      setLocale,
      copy: (tr, en) => locale === "tr" ? tr : en,
      countryName: (alpha3, fallback) => {
        const alpha2 = alpha2FromAlpha3(alpha3);
        if (alpha2 === "XK") return locale === "tr" ? "Kosova" : "Kosovo";
        return alpha2 ? displayNames.of(alpha2) || fallback : fallback;
      },
      dateLocale: locale === "tr" ? "tr-TR" : "en-GB",
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
