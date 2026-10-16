import { knownJourneyArea, type JourneyArea } from './mapJourneyClient';
import { normalizeSearchText } from './searchText';
import { TRAVEL_CENTRES } from './travelAreas';

const countries: Record<string, [string, string, string]> = {
  'İstanbul': ['Türkiye', 'Türkiye', 'Turqi'], Bodrum: ['Türkiye', 'Türkiye', 'Turqi'], Antalya: ['Türkiye', 'Türkiye', 'Turqi'],
  Tirana: ['Arnavutluk', 'Albania', 'Shqipëri'], Prishtina: ['Kosova', 'Kosovo', 'Kosovë'], Berlin: ['Almanya', 'Germany', 'Gjermani'],
  Paris: ['Fransa', 'France', 'Francë'], Tokyo: ['Japonya', 'Japan', 'Japoni'], Roma: ['İtalya', 'Italy', 'Itali'], London: ['Birleşik Krallık', 'United Kingdom', 'Mbretëri e Bashkuar'],
};
/** Suggestions only: never chooses an area or fabricates coordinates for typed text. */
export function localJourneyAreaSuggestions(query: string, locale: 'tr' | 'en' | 'sq'): JourneyArea[] {
  const search = normalizeSearchText(query.trim());
  if (search.length < 2) return [];
  const exact = knownJourneyArea(query);
  return TRAVEL_CENTRES.filter(item => item === exact || normalizeSearchText(item.name).startsWith(search)).slice(0, 4).map(item => ({ ...item,
    address: `${item.name}, ${countries[item.name]?.[locale === 'tr' ? 0 : locale === 'sq' ? 2 : 1] || item.name}`,
  }));
}
export function mergeJourneyAreaSuggestions(local: JourneyArea[], remote: JourneyArea[]): JourneyArea[] {
  const seen = new Set<string>();
  return [...local, ...remote].filter(item => {
    const id = `${normalizeSearchText(item.name)}:${item.latitude.toFixed(3)}:${item.longitude.toFixed(3)}`;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, 8);
}
