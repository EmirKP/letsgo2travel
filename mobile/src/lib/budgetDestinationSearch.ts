import { CITY_BENCHMARKS } from "../../../lib/country-intelligence/city-benchmarks";
import { BUDGET_CITY_LABELS, budgetCityLabel } from "../data/budgetCityLabels";
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
const cityNames = new Map(CITY_BENCHMARKS.map(row => [row.id, [...new Set([row.city.tr, row.city.en, ...Object.values(BUDGET_CITY_LABELS[row.id] || {})])]]));
const citySearch = new Map(CITY_BENCHMARKS.map(row => [row.id, normalizeSearchText([...cityNames.get(row.id)!, ...countryNames.get(row.code)!].join(" "))]));

/** Keep suggestions and estimates on the same researched city catalogue. */
export function matchesBudgetDestination(cityId: string, query: string): boolean {
  return citySearch.get(cityId)?.includes(normalizeSearchText(query)) ?? false;
}

/** A deliberate city handoff must not expand into a partial country match. */
export function exactBudgetCityId(query?: string): string | null {
  const needle = normalizeSearchText(query ?? "");
  if (!needle) return null;
  const matches = CITY_BENCHMARKS.filter(row => cityNames.get(row.id)!.some(name => normalizeSearchText(name) === needle));
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
  const cityLabel = (row: typeof CITY_BENCHMARKS[number]) => budgetCityLabel(row, locale);
  for (const countryCode of countryCodes) {
    const priority = rank(countryNames.get(countryCode)!);
    if (!Number.isFinite(priority)) continue;
    const cities = CITY_BENCHMARKS.filter(row => row.code === countryCode);
    entries.push({ rank: priority, suggestion: {
      id: `country-${countryCode}`, kind: "country", countryCode,
      label: appRegionName(countryCode, locale),
      detail: cities.slice(0, 2).map(cityLabel).join(" · ") + (cities.length > 2 ? ` +${cities.length - 2}` : ""),
    } });
  }
  for (const row of CITY_BENCHMARKS) {
    const priority = rank(cityNames.get(row.id)!);
    if (!Number.isFinite(priority)) continue;
    entries.push({ rank: priority, suggestion: {
      id: `city-${row.id}`, kind: "city", cityId: row.id, countryCode: row.code,
      label: cityLabel(row), detail: appRegionName(row.code, locale),
    } });
  }
  return entries.sort((a, b) => a.rank - b.rank || a.suggestion.label.localeCompare(b.suggestion.label, locale))
    .slice(0, 6).map(entry => entry.suggestion);
}
