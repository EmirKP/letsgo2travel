import { translateTuple, isAppLocale } from "../lib/locale";
import { CATEGORY_LABELS } from '../../../lib/travel-assistant/places';
import type { PointCategory } from '../../../lib/travel-assistant/types';

// One fixed icon vocabulary for web SVGs and iOS SF Symbols. No provider text
// becomes SVG markup, a URL or a system-symbol name.
const icons = {
  place: ['mappin', 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  museum: ['building.columns.fill', 'm3 8 9-5 9 5H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18'],
  historic: ['building.2.fill', 'M4 21V6h4V3h8v3h4v15M8 21v-6h8v6M8 9h1m6 0h1M8 12h1m6 0h1'],
  restaurant: ['fork.knife', 'M4 3v6m3-6v6m3-6v6M4 9c0 4 6 4 6 0M7 12v9M20 3c-4 3-5 8 0 8V3Zm0 8v10'],
  cafe: ['cup.and.saucer.fill', 'M3 7h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7Zm13 1h2a3 3 0 0 1 0 6h-2M2 22h18M6 2v2m5-2v2'],
  shopping: ['bag.fill', 'M4 7h16l1 14H3L4 7Zm4 1V5a4 4 0 0 1 8 0v3'],
  nature: ['leaf.fill', 'M20 3C8 2 2 7 5 14s15 2 15-11ZM4 21 16 7M9 15l-2-5m6 1 5 1'],
  beach: ['umbrella.fill', 'M3 12a9 9 0 0 1 18 0H3Zm9-9c-4 3-4 6-4 9m4-9c4 3 4 6 4 9m-4 0v7a2 2 0 0 0 4 0M12 1v2'],
  viewpoint: ['binoculars.fill', 'M4 6h5l1 13H2L4 6Zm11 0h5l2 13h-8l1-13ZM10 11h4M5 3h3m8 0h3'],
  medical: ['cross.case.fill', 'M4 6h16v15H4V6Zm4 0V3h8v3M12 10v7m-3-3.5h6'],
  pharmacy: ['pills.fill', 'm5 12 7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7Zm4-4 7 7'],
  police: ['shield.fill', 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-5'],
  money: ['banknote.fill', 'M2 5h20v14H2V5Zm10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M5 9v6m14-6v6'],
  bank: ['building.columns', 'm3 8 9-5 9 5H3ZM4 11v9m16-9v9M2 22h20M14 12h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-10v12'],
  transit: ['tram.fill', 'M6 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 9h16M9 3v9m6-9v9M7 16h1m8 0h1M8 19l-3 3m11-3 3 3M9 1h6'],
  toilets: ['figure.stand', 'M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4M7 10l5-2 5 2m-5-2v7m0 0-4 7m4-7 4 7'],
  wifi: ['wifi', 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01'],
} as const;
type Icon = keyof typeof icons;
const categoryIcons: Record<PointCategory, Icon> = {
  hospital: 'medical', pharmacy: 'pharmacy', police: 'police', atm: 'money', bank: 'bank', transit: 'transit', exchange: 'money', toilets: 'toilets', wifi: 'wifi', embassy: 'bank',
  museum: 'museum', statue: 'historic', monument: 'historic', historic: 'historic', stadium: 'place', palace: 'historic', square: 'place', viewpoint: 'viewpoint', attraction: 'place',
  cafe: 'cafe', bakery: 'cafe', restaurant: 'restaurant', sweets: 'cafe', boutique: 'shopping', craft: 'shopping', gift: 'shopping', market: 'shopping', store: 'shopping',
  park: 'nature', garden: 'nature', beach: 'beach', hiking: 'nature',
};
export function journeyMapCategory(value: unknown, locale = 'en') {
  const category = typeof value === 'string' && Object.prototype.hasOwnProperty.call(categoryIcons, value) ? value as PointCategory : null;
  const [symbol, path] = icons[category ? categoryIcons[category] : 'place'];
  return { symbol, path, label: translateTuple(isAppLocale(locale) ? locale : 'en', category ? CATEGORY_LABELS[category] : ['Mekân', 'Place', 'Vend']) };
}
