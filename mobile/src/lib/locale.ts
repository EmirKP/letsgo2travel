import { SQ_MESSAGES } from './locales/sq';

export type AppLocale = 'tr' | 'en' | 'sq';
export const APP_LOCALES: readonly AppLocale[] = ['tr', 'en', 'sq'];
export const DATE_LOCALES: Record<AppLocale, string> = { tr: 'tr-TR', en: 'en-GB', sq: 'sq-AL' };
export function isAppLocale(value: unknown): value is AppLocale { return APP_LOCALES.includes(value as AppLocale); }
export function translateCopy(locale: AppLocale, tr: string, en: string, sq?: string): string {
  if (locale === 'tr') return tr;
  if (locale === 'en') return en;
  return sq ?? SQ_MESSAGES[en] ?? en;
}
