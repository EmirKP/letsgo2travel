import { CITY_BENCHMARKS } from "../../../lib/country-intelligence/city-benchmarks";
import { appRegionName } from "./localeFormatting";
import { normalizeSearchText } from "./searchText";

type BudgetLocale = "tr" | "en" | "sq" | "ro";
export type BudgetDestinationSuggestion = {
  id: string;
  kind: "country" | "city";
  label: string;
  detail: string;
  countryCode: string;
  cityId?: string;
};

const countryCodes = [...new Set(CITY_BENCHMARKS.map(row => row.code))];
const countryNames = new Map(countryCodes.map(code => [code, (["tr", "en", "sq", "ro"] as const).map(locale => appRegionName(code, locale))]));
const citySearch = new Map(CITY_BENCHMARKS.map(row => [row.id, normalizeSearchText([row.city.tr, row.city.en, ...countryNames.get(row.code)!].join(" "))]));

/** Keep suggestions and estimates on the same researched city catalogue. */
export function matchesBudgetDestination(cityId: string, query: string): boolean {
  return citySearch.get(cityId)?.includes(normalizeSearchText(query)) ?? false;
}

/** A deliberate city handoff must not expand into a partial country match. */
export function exactBudgetCityId(query?: string): string | null {
  const needle = normalizeSearchText(query ?? "");
  if (!needle) return null;
  const matches = CITY_BENCHMARKS.filter(row => [row.city.tr, row.city.en].some(name => normalizeSearchText(name) === needle));
  return matches.length === 1 ? matches[0].id : null;
}

export function budgetDestinationSuggestions(query: string, locale: BudgetLocale): BudgetDestinationSuggestion[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const rank = (names: string[]) => Math.min(...names.map(name => {
    const value = normalizeSearchText(name);
    return value === needle ? 0 : value.startsWith(needle) ? 1 : value.includes(needle) ? 2 : Infinity;
  }));
  const entries: { suggestion: BudgetDestinationSuggestion; rank: number }[] = [];
  const textLocale = locale === "tr" ? "tr" : "en";
  for (const countryCode of countryCodes) {
    const priority = rank(countryNames.get(countryCode)!);
    if (!Number.isFinite(priority)) continue;
    const cities = CITY_BENCHMARKS.filter(row => row.code === countryCode);
    entries.push({ rank: priority, suggestion: {
      id: `country-${countryCode}`, kind: "country", countryCode,
      label: appRegionName(countryCode, locale),
      detail: cities.slice(0, 2).map(row => row.city[textLocale]).join(" · ") + (cities.length > 2 ? ` +${cities.length - 2}` : ""),
    } });
  }
  for (const row of CITY_BENCHMARKS) {
    const priority = rank([row.city.tr, row.city.en]);
    if (!Number.isFinite(priority)) continue;
    entries.push({ rank: priority, suggestion: {
      id: `city-${row.id}`, kind: "city", cityId: row.id, countryCode: row.code,
      label: row.city[textLocale], detail: appRegionName(row.code, locale),
    } });
  }
  return entries.sort((a, b) => a.rank - b.rank || a.suggestion.label.localeCompare(b.suggestion.label, locale))
    .slice(0, 6).map(entry => entry.suggestion);
}
