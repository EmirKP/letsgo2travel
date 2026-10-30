import { ISO_3166 } from '../data/countries';
import { appRegionName } from './localeFormatting';
import { normalizeSearchText } from './searchText';
import type { AppLocale } from './locale';

export type DestinationCountryMatch = { alpha2: string; alpha3: string; name: string };
const languages: AppLocale[] = ['tr', 'en', 'sq'];
const index = ISO_3166.map(country => ({ ...country, names: [country.name, ...languages.map(locale => appRegionName(country.alpha2, locale, country.name))].map(normalizeSearchText) }));

/** Local ISO matches remain available offline in every supported language.
 * Country records have no invented city coordinates or ready-made itinerary. */
export function destinationCountryMatches(query: string, locale: AppLocale): DestinationCountryMatch[] {
  const term = normalizeSearchText(query.slice(0, 120));
  if (term.length < 2) return [];
  const words = term.split(' ');
  return index.filter(country => country.alpha2.toLowerCase() === term || country.alpha3.toLowerCase() === term || country.names.some(name => words.every(word => name.includes(word))))
    .sort((a, b) => Number(!a.names.some(name => name === term)) - Number(!b.names.some(name => name === term)) || Number(!a.names.some(name => name.startsWith(term))) - Number(!b.names.some(name => name.startsWith(term))) || appRegionName(a.alpha2, locale, a.name).localeCompare(appRegionName(b.alpha2, locale, b.name), locale))
    .slice(0, 8).map(country => ({ alpha2: country.alpha2, alpha3: country.alpha3, name: appRegionName(country.alpha2, locale, country.name) }));
}

export function canSearchDestinationPlaces(query: string, hasReadyResult = false) {
  const value = query.trim();
  return !hasReadyResult && value.length >= 3 && value.length <= 120 && !/[<>]/.test(value) && ![...value].some(character => character.charCodeAt(0) < 32);
}
