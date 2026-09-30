import { CITY_PRICE_MONTH, CITY_PRICE_SOURCE, type CityBenchmark } from "../../../lib/country-intelligence/city-benchmarks";
import { BUDGET_CURRENCIES, tripBudget, usableBudgetRate, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";

export type BudgetCockpitIntent = {
  kind: "city-budget";
  ownerId: string | null;
  sourceBenchmarkId: string;
  city: string;
  countryCode: string;
  createdAt: string;
  sourceMonth: string;
  sourceUrl: string;
  sourceCurrency: "GBP";
  sourcePrices: { hotel: number; meal: number; travel: number };
  estimate: NonNullable<ReturnType<typeof tripBudget>>;
  displayCurrency: BudgetCurrency;
  displayTotal: number | null;
  exchangeRate: { rate: number; date: string; provider: "Frankfurter" } | null;
  model: "hotel-dinner-transit-v1";
};

export function validateBudgetCockpitIntent(value: unknown): value is BudgetCockpitIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as BudgetCockpitIntent;
  let sourceTrusted = false;
  try {
    const source = new URL(item.sourceUrl);
    sourceTrusted = source.protocol === "https:" && source.hostname === "www.postoffice.co.uk" && source.pathname.startsWith("/dam") && source.pathname.endsWith(".pdf");
  } catch { /* Invalid source cannot be attached. */ }
  if (item.kind !== "city-budget" || !(item.ownerId === null || typeof item.ownerId === "string" && item.ownerId.length > 0 && item.ownerId.length <= 80)
    || typeof item.sourceBenchmarkId !== "string" || item.sourceBenchmarkId.length > 100 || !item.sourceBenchmarkId
    || typeof item.city !== "string" || !item.city || item.city.length > 240 || !/^[A-Z]{2}$/.test(item.countryCode)
    || typeof item.createdAt !== "string" || item.createdAt.length > 40 || !Number.isFinite(Date.parse(item.createdAt))
    || typeof item.sourceMonth !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.sourceMonth) || typeof item.sourceUrl !== "string" || item.sourceUrl.length > 2000 || !sourceTrusted
    || item.sourceCurrency !== "GBP" || item.model !== "hotel-dinner-transit-v1" || !BUDGET_CURRENCIES.includes(item.displayCurrency) || !item.sourcePrices || !item.estimate) return false;
  const estimate = tripBudget(item.sourcePrices, item.estimate.days, item.estimate.people);
  if (!estimate || Object.entries(estimate).some(([key, number]) => item.estimate[key as keyof typeof estimate] !== number)) return false;
  if (item.displayCurrency === "GBP") return item.exchangeRate === null && item.displayTotal === estimate.total;
  if (item.exchangeRate === null) return item.displayTotal === null;
  const fx = item.exchangeRate;
  return !!fx && Number.isFinite(fx.rate) && fx.rate > 0 && typeof fx.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fx.date)
    && Number.isFinite(Date.parse(fx.date)) && new Date(fx.date).toISOString().slice(0, 10) === fx.date && fx.provider === "Frankfurter"
    && item.displayTotal === estimate.total * fx.rate;
}

export function createBudgetCockpitIntent(row: CityBenchmark, days: string | number, people: string | number, currency: BudgetCurrency,
  quote: { base: string; quote: string; date: string; rate: number } | null, ownerId: string | null, city = row.city.en, now = Date.now()): BudgetCockpitIntent | null {
  const estimate = tripBudget(row, days, people);
  if (!estimate) return null;
  const rate = usableBudgetRate(quote, currency, now);
  return {
    kind: "city-budget", ownerId, sourceBenchmarkId: row.id, city, countryCode: row.code, createdAt: new Date(now).toISOString(),
    sourceMonth: CITY_PRICE_MONTH, sourceUrl: CITY_PRICE_SOURCE, sourceCurrency: "GBP", sourcePrices: { hotel: row.hotel, meal: row.meal, travel: row.travel }, estimate,
    displayCurrency: currency, displayTotal: rate === null ? null : estimate.total * rate,
    exchangeRate: currency !== "GBP" && rate !== null && quote ? { rate, date: quote.date, provider: "Frankfurter" } : null, model: "hotel-dinner-transit-v1",
  };
}
