/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { DATE_LOCALES, hasLocaleMessages, isAppLocale, loadLocaleMessages, translateCopy, type AppLocale } from './locale';
import { appRegionName } from './localeFormatting';
import './locale-loading.css';

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
  setLocale: (locale: AppLocale) => Promise<boolean>;
  pendingLocale: AppLocale | null;
  failedLocale: AppLocale | null;
  copy: (tr: string, en: string, sq?: string) => string;
  countryName: (alpha3: string, fallback: string) => string;
  dateLocale: string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [ready, setReady] = useState(() => hasLocaleMessages(locale));
  const [pendingLocale, setPendingLocale] = useState<AppLocale | null>(() => ready ? null : locale);
  const [failedLocale, setFailedLocale] = useState<AppLocale | null>(null);
  const requestGeneration = useRef(0);

  const setLocale = useCallback(async (next: AppLocale, persist = true): Promise<boolean> => {
    if (!isAppLocale(next)) return false;
    const generation = ++requestGeneration.current;
    setFailedLocale(null);
    // Persist the user's choice before loading, including a cold-start retry.
    try {
      if (persist) window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // Dil bu oturumda yine değişir; yazma hatası ana akışı bozmaz.
    }
    if (!hasLocaleMessages(next)) {
      setPendingLocale(next);
      try {
        await loadLocaleMessages(next);
      } catch {
        if (generation === requestGeneration.current) {
          setPendingLocale(null);
          setFailedLocale(next);
        }
        return false;
      }
      if (generation !== requestGeneration.current) return false;
    }
    setLocaleState(next);
    setPendingLocale(null);
    setReady(true);
    return true;
  }, []);

  useEffect(() => {
    if (!hasLocaleMessages(locale)) void setLocale(locale, false);
    return () => { requestGeneration.current++; };
    // Only bootstrap once; later choices start their own cancellable request.
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
  }, [locale]);

  const localized = useMemo(() => {
    return {
      copy: (tr: string, en: string, sq?: string) => translateCopy(locale, tr, en, sq),
      countryName: (alpha3: string, fallback: string) => {
        const alpha2 = alpha2FromAlpha3(alpha3);
        return alpha2 ? appRegionName(alpha2, locale, fallback) : fallback;
      },
      dateLocale: DATE_LOCALES[locale],
    };
  }, [locale]);
  const value = useMemo<I18nValue>(() => ({
    locale, setLocale, pendingLocale, failedLocale, ...localized,
  }), [locale, setLocale, pendingLocale, failedLocale, localized]);

  return <I18nContext.Provider value={value}>{ready ? children : <main className="locale-startup" lang="sq" aria-busy={pendingLocale !== null}>
    <strong className="locale-startup-brand">LetsGo<span>2</span>Travel</strong>
    {failedLocale ? <>
      <p role="alert">Gjuha nuk u ngarkua. Provo përsëri ose zgjidh një gjuhë tjetër.</p>
      <div className="locale-startup-actions">
        <button type="button" onClick={() => void setLocale('sq')}>Provo përsëri</button>
        <button type="button" lang="en" onClick={() => void setLocale('en')}>English</button>
        <button type="button" lang="tr" onClick={() => void setLocale('tr')}>Türkçe</button>
      </div>
    </> : <p role="status">Duke ngarkuar gjuhën…</p>}
  </main>}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider bulunamadı.");
  return value;
}

export function localeFromStorage(): AppLocale {
  return initialLocale();
}
