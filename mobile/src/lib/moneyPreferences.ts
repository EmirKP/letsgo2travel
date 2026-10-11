import { CURRENCIES } from '../../../lib/travel-assistant/money';
import { COST_CURRENCIES } from '../../../lib/country-intelligence/currencies';

const KEY = 'l2t-money-pair-v1';
export type MoneyPair = { base: string; quote: string };
export function readMoneyPair(): MoneyPair | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    return value && CURRENCIES.includes(value.base) && CURRENCIES.includes(value.quote) ? { base: value.base, quote: value.quote } : null;
  } catch { return null; }
}
export function saveMoneyPair(value: MoneyPair) {
  if (!CURRENCIES.includes(value.base) || !CURRENCIES.includes(value.quote)) return;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* The current choice still works without storage. */ }
}
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  ...COST_CURRENCIES, AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', XK: 'EUR',
  CN: 'CNY', IN: 'INR', KR: 'KRW', BR: 'BRL', SA: 'SAR', SG: 'SGD', HK: 'HKD', ZA: 'ZAR',
  LI: 'CHF', PR: 'USD', VI: 'USD', GU: 'USD', EC: 'USD', TL: 'USD', SV: 'USD',
};
/** Never substitute a neighbouring country's currency when unsupported. */
export function moneyCurrencyForCountry(country: string): string | null {
  const currency = CURRENCY_BY_COUNTRY[country.toUpperCase()];
  return CURRENCIES.includes(currency) ? currency : null;
}
