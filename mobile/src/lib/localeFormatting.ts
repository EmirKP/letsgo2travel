import type { AppLocale } from './locale';
import { SQ_REGIONS } from './locales/sq-regions';

// Some WebViews ship without Albanian Intl data and silently use the device
// language. Keep visible currency/region names and dates in the selected language.
const SQ_CURRENCIES: Record<string, string> = {
  TRY: 'Lira turke', EUR: 'Euroja', USD: 'Dollari amerikan', GBP: 'Sterlina britanike',
  AED: 'Dirhami i Emirateve të Bashkuara Arabe', JPY: 'Jeni japonez', CHF: 'Franga zvicerane',
  CAD: 'Dollari kanadez', AUD: 'Dollari australian', THB: 'Bata tajlandeze', GEL: 'Laria gjeorgjiane',
  BAM: 'Marka e konvertueshme e Bosnjë-Hercegovinës', RSD: 'Dinari serb', ALL: 'Leku shqiptar',
  AZN: 'Manata azerbajxhanase', PLN: 'Zllota polake', CZK: 'Koruna çeke', HUF: 'Forinta hungareze',
  SEK: 'Korona suedeze', NOK: 'Korona norvegjeze', DKK: 'Korona daneze', KRW: 'Uoni koreano-jugor',
  CNY: 'Juani kinez', INR: 'Rupia indiane', BRL: 'Reali brazilian', SAR: 'Riali saudit',
  SGD: 'Dollari i Singaporit', HKD: 'Dollari i Hong-Kongut', NZD: 'Dollari i Zelandës së Re', ZAR: 'Randi afrikano-jugor',
};
const MONTHS = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];
const SHORT_MONTHS = ['jan', 'shk', 'mar', 'pri', 'maj', 'qer', 'korr', 'gush', 'sht', 'tet', 'nën', 'dhj'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['e diel', 'e hënë', 'e martë', 'e mërkurë', 'e enjte', 'e premte', 'e shtunë'];
const SHORT_WEEKDAYS = ['die', 'hën', 'mar', 'mër', 'enj', 'pre', 'sht'];
const EN_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function appCurrencyName(code: string, locale: AppLocale): string {
  if (locale === 'sq') return SQ_CURRENCIES[code.toUpperCase()] || code;
  try { return new Intl.DisplayNames(locale, { type: 'currency' }).of(code) || code; } catch { return code; }
}

export function appRegionName(code: string, locale: AppLocale, fallback = code): string {
  if (locale === 'sq') return SQ_REGIONS[code.toUpperCase()] || fallback;
  if (code.toUpperCase() === 'XK') return locale === 'tr' ? 'Kosova' : 'Kosovo';
  try { return new Intl.DisplayNames(locale, { type: 'region' }).of(code) || fallback; } catch { return fallback; }
}

export function formatAppDate(date: Date, locale: AppLocale, options: Intl.DateTimeFormatOptions): string {
  const identifier = locale === 'sq' ? 'sq-AL' : locale === 'tr' ? 'tr-TR' : 'en-GB';
  if (locale !== 'sq') return new Intl.DateTimeFormat(identifier, options).format(date);
  try {
    const formatter = new Intl.DateTimeFormat(identifier, options);
    if (Intl.DateTimeFormat.supportedLocalesOf(['sq-AL']).length && formatter.resolvedOptions().locale.toLowerCase().startsWith('sq')) {
      return formatter.format(date);
    }
  } catch { /* Use bundled labels on older or reduced-locale WebViews. */ }
  // en-GB preserves day/month/year order and the caller's timezone and clock
  // options. Replace only textual date parts; never shift the actual instant.
  return new Intl.DateTimeFormat('en-GB', options).formatToParts(date).map(part => {
    if (part.type === 'month') {
      const index = EN_MONTHS.indexOf(part.value.slice(0, 3).toLowerCase());
      if (index >= 0) return options.month === 'long' || options.dateStyle === 'full' || options.dateStyle === 'long' ? MONTHS[index] : SHORT_MONTHS[index];
    }
    if (part.type === 'weekday') {
      const index = EN_WEEKDAYS.indexOf(part.value.slice(0, 3).toLowerCase());
      if (index >= 0) return options.weekday === 'long' || options.dateStyle === 'full' ? WEEKDAYS[index] : SHORT_WEEKDAYS[index];
    }
    return part.value;
  }).join('');
}
