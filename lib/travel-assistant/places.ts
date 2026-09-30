import type { Coordinates, MapMode, Place, PointCategory } from './types';

export const CATEGORY_LABELS: Record<PointCategory, [string, string, string]> = {
  hospital: ['Hastane', 'Hospital', 'Spital'], pharmacy: ['Eczane', 'Pharmacy', 'Farmaci'], police: ['Polis', 'Police', 'Polici'],
  atm: ['ATM', 'ATM', 'Bankomat'], exchange: ['Döviz bürosu', 'Currency exchange', 'Këmbim valutor'], toilets: ['Tuvalet', 'Toilets', 'Tualete'],
  wifi: ['Wi-Fi', 'Wi-Fi', 'Wi-Fi'], embassy: ['Temsilcilik', 'Diplomatic mission', 'Përfaqësi diplomatike'], museum: ['Müze', 'Museum', 'Muze'],
  statue: ['Heykel', 'Statue', 'Statujë'], monument: ['Anıt', 'Monument', 'Monument'], historic: ['Tarihi yapı', 'Historic site', 'Vend historik'],
  stadium: ['Stadyum', 'Stadium', 'Stadium'], palace: ['Saray', 'Palace', 'Pallat'], square: ['Meydan', 'Square', 'Shesh'],
  viewpoint: ['Seyir noktası', 'Viewpoint', 'Pikë panoramike'], attraction: ['Turistik nokta', 'Attraction', 'Atraksion turistik'],
};
export const NEEDS: PointCategory[] = ['hospital', 'pharmacy', 'police', 'atm', 'exchange', 'toilets', 'wifi', 'embassy'];
export const TOURING: PointCategory[] = ['museum', 'statue', 'monument', 'historic', 'stadium', 'palace', 'square', 'viewpoint', 'attraction'];
export function coordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null;
  const { latitude, longitude } = value as Coordinates;
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 85 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function coarseLocation(value: Coordinates): Coordinates {
  return { latitude: Math.round(value.latitude * 100) / 100, longitude: Math.round(value.longitude * 100) / 100 };
}
export function distanceKm(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function safeWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) ? u.href : null;
  } catch { return null; }
}
const clean = (v: unknown, max = 180) => typeof v === 'string' ? v.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) : '';
function category(t: Record<string, string>): PointCategory | null {
  if (t.diplomatic || t.amenity === 'embassy' || t.office === 'diplomatic') return 'embassy';
  if (['hospital','pharmacy','police','atm','toilets'].includes(t.amenity)) return t.amenity as PointCategory;
  if (t.amenity === 'bureau_de_change') return 'exchange';
  if (t.castle_type === 'palace' || t.historic === 'palace') return 'palace';
  if (t.artwork_type === 'statue' || t.memorial === 'statue') return 'statue';
  if (['monument','memorial'].includes(t.historic)) return 'monument';
  if (['castle','ruins','archaeological_site','building'].includes(t.historic)) return 'historic';
  if (t.leisure === 'stadium') return 'stadium';
  if (t.place === 'square') return 'square';
  if (['museum','viewpoint','attraction'].includes(t.tourism)) return t.tourism as PointCategory;
  if (t.internet_access === 'wlan') return 'wifi';
  return null;
}
export function normalizePlaces(raw: unknown, mode: MapMode, fetchedAt: string): Place[] {
  const elements = (raw as { elements?: unknown[] })?.elements;
  if (!Array.isArray(elements)) throw new Error('Invalid places response');
  const seen = new Set<string>();
  return elements.slice(0, 250).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const e = value as { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string,string> };
    const t = e.tags || {};
    const kind = category(t);
    const point = coordinates({ latitude: e.lat ?? e.center?.lat, longitude: e.lon ?? e.center?.lon });
    if (!kind || !(mode === 'needs' ? NEEDS : TOURING).includes(kind) || !point || !['node','way','relation'].includes(e.type) || !Number.isSafeInteger(e.id) || e.id <= 0) return [];
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const fee = kind === 'wifi' ? t['internet_access:fee'] : t.fee;
    return [{ ...point, id, category: kind, name: clean(t.name || t['name:en']), description: clean(t.description, 500) || null,
      hours: clean(t.opening_hours) || null, free: fee === 'no' ? true : fee === 'yes' ? false : null,
      accessible: t.wheelchair === 'yes' ? true : t.wheelchair === 'no' ? false : null,
      website: safeWebsite(t.website || t['contact:website']), representedCountry: typeof t.country === 'string' && /^[A-Za-z]{2}$/.test(t.country) ? t.country.toUpperCase() : null,
      sourceUrl: `https://www.openstreetmap.org/${id}`, fetchedAt }];
  });
}
export function filterPlaces(places: Place[], filters: { category?: string; free?: boolean; accessible?: boolean; alwaysOpen?: boolean; representedCountry?: string }, center: Coordinates) {
  return places.filter(p => (!filters.category || p.category === filters.category)
    && (!filters.free || p.free === true) && (!filters.accessible || p.accessible === true)
    && (!filters.alwaysOpen || p.hours === '24/7')
    && (!filters.representedCountry || p.representedCountry === filters.representedCountry))
    .sort((a,b) => distanceKm(center,a) - distanceKm(center,b));
}
export function overpassQuery(center: Coordinates, mode: MapMode) {
  const valid = coordinates(center);
  if (!valid || !['needs','explore'].includes(mode)) throw new Error('Invalid map query');
  const c = coarseLocation(valid);
  const selectors = mode === 'needs'
    ? ['[amenity~"^(hospital|pharmacy|police|atm|bureau_de_change|toilets|embassy)$"]','[office=diplomatic]','[internet_access=wlan]']
    : ['[tourism~"^(museum|viewpoint|attraction)$"]','[historic~"^(monument|memorial|castle|ruins|archaeological_site|building|palace)$"]','[artwork_type=statue]','[leisure=stadium]','[place=square]'];
  return `[out:json][timeout:12][maxsize:4000000];(${selectors.map(s => `nwr(around:3000,${c.latitude},${c.longitude})${s};`).join('')});out center tags 250;`;
}
