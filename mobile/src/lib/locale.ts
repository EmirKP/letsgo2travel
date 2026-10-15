export type AppLocale = 'tr' | 'en' | 'sq';
export const APP_LOCALES: readonly AppLocale[] = ['tr', 'en', 'sq'];
export const DATE_LOCALES: Record<AppLocale, string> = { tr: 'tr-TR', en: 'en-GB', sq: 'sq-AL' };
export function isAppLocale(value: unknown): value is AppLocale { return APP_LOCALES.includes(value as AppLocale); }

let albanianMessages: Record<string, string> | undefined;
let albanianRequest: Promise<void> | undefined;

export function hasLocaleMessages(locale: AppLocale): boolean {
  return locale !== 'sq' || albanianMessages !== undefined;
}

export function loadLocaleMessages(locale: AppLocale): Promise<void> {
  if (hasLocaleMessages(locale)) return Promise.resolve();
  if (!albanianRequest) {
    albanianRequest = import('./locales/sq').then(({ SQ_MESSAGES }) => {
      albanianMessages = SQ_MESSAGES;
    }).catch(error => {
      // A failed download must remain retryable in the same session.
      albanianRequest = undefined;
      throw error;
    });
  }
  return albanianRequest;
}

export function translateCopy(locale: AppLocale, tr: string, en: string, sq?: string): string {
  if (locale === 'tr') return tr;
  if (locale === 'en') return en;
  return sq ?? albanianMessages?.[en] ?? en;
}
