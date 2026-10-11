import type { FxQuote } from './types';
export const CURRENCIES = ['TRY','EUR','USD','GBP','AED','JPY','CHF','CAD','AUD','THB','GEL','BAM','RSD','ALL','AZN','PLN','CZK','HUF','SEK','NOK','DKK','KRW','CNY','INR','BRL','SAR','SGD','HKD','NZD','ZAR'];
/** A unit converted to itself never needs a provider or a cached market rate. */
export function identityQuote(base: string, quote: string, now = Date.now()): FxQuote | null {
  if (base !== quote || !CURRENCIES.includes(base)) return null;
  const fetchedAt = new Date(now).toISOString();
  return { base, quote, rate: 1, date: fetchedAt.slice(0, 10), fetchedAt, previousRate: null, previousDate: null, changePercent: null, sourceUrl: '' };
}
export function parseAmount(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,10}([.,]\d{1,4})?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
}
export function makeQuote(raw: unknown, base: string, quote: string, now = new Date()): FxQuote | null {
  if (!Array.isArray(raw)) return null;
  const today = now.toISOString().slice(0,10);
  const points = raw.filter((r): r is {base:string;quote:string;date:string;rate:number} => r && r.base === base && r.quote === quote
    && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0,10) === r.date && r.date <= today
    && typeof r.rate === 'number' && Number.isFinite(r.rate) && r.rate > 0).sort((a,b) => b.date.localeCompare(a.date));
  const latest = points[0];
  if (!latest || now.getTime() - Date.parse(latest.date) > 7 * 86400000) return null;
  const previous = points.find(r => r.date < latest.date);
  return { ...latest, previousRate: previous?.rate ?? null, previousDate: previous?.date ?? null,
    changePercent: previous ? (latest.rate / previous.rate - 1) * 100 : null,
    sourceUrl: 'https://frankfurter.dev/', fetchedAt: now.toISOString() };
}
