import type { Coordinates } from "../../../lib/travel-assistant/types";
import { distanceKm } from "../../../lib/travel-assistant/places";
import { countryAt } from "./deviceArea";
import { TRAVEL_CENTRES } from "./travelAreas";
import { localIsoDate } from "./dates";
import { normalizeSearchText } from "./searchText";

export type EventSearchContext = {
  countryCode: string;
  cityName?: string;
  startDate: string;
  endDate: string;
};
export type EventSearchFilters = {
  countryCode: string;
  cityPlaceCode: string;
  cityName?: string;
  startDate: string;
  endDate: string;
  category: 'all' | 'concert' | 'festival' | 'sport' | 'culture' | 'food' | 'family';
};

/** Match known local spellings only inside the selected country. */
export function matchesEventCity(source: string, requested: string, countryCode: string): boolean {
  const canonical = (name: string) => {
    const normalized = normalizeSearchText(name);
    if (countryCode === 'IT' && normalized === 'roma') return 'rome';
    if (countryCode === 'XK' && (normalized === 'prishtina' || normalized === 'prishtine')) return 'pristina';
    return normalized;
  };
  return Boolean(requested && canonical(source) === canonical(requested));
}

/** Resolve the already-shared coarse location on-device; never guess a default country. */
export async function nearbyEventContext(center: Coordinates): Promise<EventSearchContext> {
  const countryCode = await countryAt(center);
  const nearest = countryCode ? TRAVEL_CENTRES
    .filter(city => distanceKm(center, city) < 20)
    .sort((a, b) => distanceKm(center, a) - distanceKm(center, b))[0] : undefined;
  const cityName = nearest && await countryAt(nearest) === countryCode ? nearest.name : undefined;
  return { countryCode, cityName, startDate: localIsoDate(0), endDate: localIsoDate(7) };
}
