import { CITY_BENCHMARKS, CITY_FX_REFERENCE_DATE, CITY_PRICE_MONTH, type CityBenchmark } from "./city-benchmarks";
import { estimateCost } from "./cost-model";
import { tripBudget, usableBudgetRate } from "./trip-budget";
import type { InflationData, Rate } from "./types";
import { normalizePlannerPreferences, type PlannerPreferences } from "../planner-preferences";

export type RouteBudgetAdjustment = { currency: string; inflation: InflationData | null; referenceFx: Rate | null };
export type BudgetQuote = { base: string; quote: string; rate: number; date: string };
function validQuoteDate(quote: BudgetQuote | null) {
  if (!quote || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) return false;
  const timestamp = Date.parse(`${quote.date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === quote.date;
}
// Planning assumptions, not measured prices for accommodation classes.
export const ROUTE_TIER_FACTORS = { economy: { hotel: .75, meals: .8, travel: 1 }, balanced: { hotel: 1, meals: 1, travel: 1 }, plus: { hotel: 1.5, meals: 1.35, travel: 1.3 } };
const cityKey = (value: string) => value.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^\p{L}\p{N}]/gu, "");
const AIRPORT_CITIES: Record<string, string> = { SJJ: "Sarajevo", FCO: "Rome", CIA: "Rome", TIA: "Tirana", BEG: "Belgrade", BUD: "Budapest", IST: "Istanbul", SAW: "Istanbul", CDG: "Paris", ORY: "Paris", LHR: "London", LGW: "London", ATH: "Athens", DUB: "Dublin", VIE: "Vienna", PRG: "Prague", AMS: "Amsterdam", BCN: "Barcelona", MAD: "Madrid", LIS: "Lisbon", OPO: "Porto", BKK: "Bangkok", BJV: "Bodrum", GYD: "Baku", TBS: "Tbilisi", DXB: "Dubai", SKP: "Skopje", RMO: "Chisinau" };
const CITY_ALIASES: Record<string, string> = { tirane: "Tirana", sarajeve: "Sarajevo", londer: "London", stamboll: "Istanbul", arnavutkoyistanbul: "Istanbul", pendikistanbul: "Istanbul", beograd: "Belgrade", vjene: "Vienna", athine: "Athens", bukuresht: "Bucharest", bruksel: "Brussels", kopenhage: "Copenhagen", varshave: "Warsaw", lisbona: "Lisbon", mynih: "Munich" };
const canonicalCityKey = (value: string) => cityKey(CITY_ALIASES[cityKey(value)] || value);
const countryNames = ["tr", "en", "sq"].map(locale => new Intl.DisplayNames([locale], { type: "region" }));
const COUNTRY_ALIASES: Record<string, string[]> = { GB: ["UK", "England", "İngiltere", "Britain"], US: ["USA", "ABD", "United States of America"], TR: ["Turkey", "Türkiye"], AE: ["BAE", "UAE"] };
export function routeCityBenchmark(route: { name: string; cityOrRegion?: string; destinationCode?: string; country?: string }) {
  const lookup = (name: string) => CITY_BENCHMARKS.find(row => canonicalCityKey(name) === cityKey(row.city.en) || canonicalCityKey(name) === cityKey(row.city.tr));
  // An explicit unsupported city is never priced from its title or airport.
  const row = lookup(route.cityOrRegion?.trim() || route.name);
  if (!row) return null;
  if (route.country && ![row.code, ...countryNames.map(names => names.of(row.code) || ""), ...(COUNTRY_ALIASES[row.code] || [])].some(name => cityKey(name) === cityKey(route.country!))) return null;
  const title = lookup(route.name);
  if (title && title.id !== row.id) return null;
  const airportCity = route.destinationCode ? AIRPORT_CITIES[route.destinationCode] : undefined;
  if (airportCity && lookup(airportCity)?.id !== row.id) return null;
  return row;
}

export function routeBudgetDays(input: { dayCount?: number; days: string }, fallback: string) {
  if (Number.isInteger(input.dayCount) && input.dayCount! >= 1 && input.dayCount! <= 14) return input.dayCount!;
  // Older saved sample routes may have a range; use its lower bound and label it in the UI.
  const value = Number((input.days || fallback).match(/^\s*(\d+)/)?.[1]);
  return Number.isInteger(value) && value >= 1 && value <= 30 ? value : null;
}

export function routeInflation(adjustment: RouteBudgetAdjustment | null, now = Date.now()) {
  const reference = adjustment?.referenceFx;
  if (!adjustment || !reference || reference.base !== "GBP" || reference.quote !== adjustment.currency || reference.date !== CITY_FX_REFERENCE_DATE || !Number.isFinite(reference.rate) || reference.rate <= 0) return null;
  if (!adjustment.inflation || !/^\d{4}-(0[1-9]|1[0-2])$/.test(adjustment.inflation.period) || adjustment.inflation.period > new Date(now).toISOString().slice(0, 7)
    || !Number.isFinite(adjustment.inflation.referenceIndex) || (adjustment.inflation.referenceIndex || 0) <= 0 || !Number.isFinite(adjustment.inflation.index) || (adjustment.inflation.index || 0) <= 0) return null;
  const result = estimateCost({ baseline: { code: "", city: { tr: "", en: "" }, currency: adjustment.currency, daily: 1, referenceMonth: CITY_PRICE_MONTH, source: null, quality: "user-quote" }, fx: null, inflation: adjustment.inflation }, "average");
  return result.inflationApplied ? { factor: result.inflationFactor, referenceRate: reference.rate } : null;
}

export function routeBudgetEstimate(row: CityBenchmark, input: PlannerPreferences & { budget: string; who: string }, days: number, adjustment: RouteBudgetAdjustment | null, gbpQuote: BudgetQuote | null, localQuote: BudgetQuote | null, now = Date.now()) {
  const preferences = normalizePlannerPreferences(input);
  const { party, tier, currency } = preferences;
  const base = tripBudget(row, days, party.adults + party.children);
  if (!base) return null;
  const factors = ROUTE_TIER_FACTORS[tier];
  let conversion = usableBudgetRate(validQuoteDate(gbpQuote) ? gbpQuote : null, currency, now);
  let inflationApplied = false;
  const inflation = routeInflation(adjustment, now);
  if (inflation && adjustment) {
    const age = localQuote ? now - Date.parse(`${localQuote.date}T00:00:00Z`) : Infinity;
    const localRate = adjustment.currency === currency ? 1 : validQuoteDate(localQuote) && localQuote?.base === adjustment.currency && localQuote.quote === currency && Number.isFinite(localQuote.rate) && localQuote.rate > 0 && age >= 0 && age <= 7 * 86400000 ? localQuote.rate : null;
    if (localRate !== null) { conversion = inflation.referenceRate * inflation.factor * localRate; inflationApplied = true; }
  }
  const hotel = conversion === null ? null : base.hotel * factors.hotel * conversion;
  const meals = conversion === null ? null : base.meals * factors.meals * conversion;
  const travel = conversion === null ? null : base.travel * factors.travel * conversion;
  const activities = preferences.activityBudgetPerPersonDay === undefined ? null : preferences.activityBudgetPerPersonDay * base.people * days;
  const subtotal = hotel === null || meals === null || travel === null ? null : hotel + meals + travel;
  const total = subtotal === null ? null : subtotal + (activities ?? 0);
  return { ...base, tier, currency, party, hotel, meals, travel, activities, total, partial: activities === null, inflationApplied,
    perPerson: total === null ? null : total / base.people, perPersonDay: total === null ? null : total / base.people / days };
}
