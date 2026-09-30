import { COUNTRY_LIST } from "../data/countries";
import { profileIdToAlpha3 } from "../data/countryCodes";
import type { FavoriteDestination } from "../types";

const byCode = new Map(COUNTRY_LIST.map(country => [country.alpha3, country]));

export function profileDestinations(ids: string[]): FavoriteDestination[] {
  const seen = new Set<string>();
  return ids.flatMap(id => {
    const code = profileIdToAlpha3(id);
    const country = code ? byCode.get(code) : null;
    if (!country || seen.has(country.alpha3)) return [];
    seen.add(country.alpha3);
    return [{ ...country, createdAt: new Date(0).toISOString() }];
  });
}

/** Cached remote data is not a new edit. Only an explicitly queued guest import
 * may overlay a fresh account read; its existing sync queue owns the write. */
export function reconcileProfileCountries(ids: string[], cached: FavoriteDestination[], pendingImport: boolean) {
  const remote = profileDestinations(ids);
  if (!pendingImport) return remote;
  const seen = new Set(remote.map(country => country.alpha3));
  return [...remote, ...cached.filter(country => {
    if (seen.has(country.alpha3)) return false;
    seen.add(country.alpha3);
    return true;
  })];
}
