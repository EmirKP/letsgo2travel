export type AppLocale = 'tr' | 'en' | 'sq' | 'ro';
export const APP_LOCALES: readonly AppLocale[] = ['tr', 'en', 'sq', 'ro'];
export const DATE_LOCALES: Record<AppLocale, string> = { tr: 'tr-TR', en: 'en-GB', sq: 'sq-AL', ro: 'ro-RO' };
export function isAppLocale(value: unknown): value is AppLocale { return APP_LOCALES.includes(value as AppLocale); }

let albanianMessages: Record<string, string> | undefined;
let albanianRequest: Promise<void> | undefined;
let romanianMessages: Record<string, string> | undefined;
let romanianRequest: Promise<void> | undefined;
const templateCache = new WeakMap<Record<string, string>, Array<{ pattern: RegExp; indexes: number[]; translation: string }>>();

/** Preserve names, numbers and user text while translating the surrounding UI. */
export function translateMessageTemplates(messages: Record<string, string>, value: string): string {
  if (Object.hasOwn(messages, value)) return messages[value];
  let templates = templateCache.get(messages);
  if (!templates) {
    templates = Object.entries(messages)
      .filter(([key]) => /\{\{\d+\}\}/.test(key) && /[\p{L}]/u.test(key.replace(/\{\{\d+\}\}/g, '')))
      .sort(([left], [right]) => right.replace(/\{\{\d+\}\}/g, '').length - left.replace(/\{\{\d+\}\}/g, '').length)
      .map(([key, translation]) => {
      const indexes: number[] = [];
      const parts = key.split(/(\{\{\d+\}\})/g).map(part => {
        const token = part.match(/^\{\{(\d+)\}\}$/);
        if (token) { indexes.push(Number(token[1])); return '(.*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      return { pattern: new RegExp(`^${parts.join('')}$`, 's'), indexes, translation };
    });
    templateCache.set(messages, templates);
  }
  for (const { pattern, indexes, translation } of templates) {
    const match = value.match(pattern);
    if (!match) continue;
    const values = new Map(indexes.map((index, position) => [index, match[position + 1]]));
    return translation.replace(/\{\{(\d+)\}\}/g, (token, index) => values.get(Number(index)) ?? token);
  }
  return value;
}

export function hasLocaleMessages(locale: AppLocale): boolean {
  return locale === 'sq' ? albanianMessages !== undefined : locale === 'ro' ? romanianMessages !== undefined : true;
}

export function loadLocaleMessages(locale: AppLocale): Promise<void> {
  if (hasLocaleMessages(locale)) return Promise.resolve();
  if (locale === 'ro') {
    romanianRequest ||= import('./locales/ro').then(({ RO_MESSAGES }) => { romanianMessages = RO_MESSAGES; }).catch(error => { romanianRequest = undefined; throw error; });
    return romanianRequest;
  }
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
  if (locale === 'ro') return romanianMessages ? translateMessageTemplates(romanianMessages, en) : en;
  return sq ?? albanianMessages?.[en] ?? en;
}

/** For the shared, static [Turkish, English, Albanian] label tables. */
export function translateTuple(locale: AppLocale, labels: readonly string[] | undefined): string {
  return labels ? translateCopy(locale, labels[0], labels[1], labels[2]) : '';
}

/** Translate bundled English editorial copy, never user records or provider data. */
export function translateBundledCopy<T>(locale: AppLocale, value: T): T {
  if (locale !== 'ro') return value;
  if (typeof value === 'string') return translateCopy(locale, value, value) as T;
  if (Array.isArray(value)) return value.map(item => translateBundledCopy(locale, item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateBundledCopy(locale, item)])) as T;
  return value;
}
