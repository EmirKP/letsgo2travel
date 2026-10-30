import { CATEGORY_LABELS, coordinates, validJourneyPlaceSource } from '../travel-assistant/places';
import type { Coordinates, PointCategory } from '../travel-assistant/types';

export type MapSearchResult = Coordinates & { id: string; source: 'openstreetmap' | 'apple'; name: string; address: string | null; sourceUrl: string; kind: 'area' | 'place'; category?: PointCategory; osmId?: string };
const safeText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);

/** Area coordinates identify a search result, never a saveable provider POI. */
export function normalizeMapAreaResult(value: unknown): MapSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>, point = coordinates(row);
  if (!point || !safeText(row.name, 160) || !row.name.trim() || row.address !== null && !safeText(row.address, 500) || !['area', 'place'].includes(String(row.kind))) return null;
  const source = row.source ?? 'openstreetmap', id = row.id ?? row.osmId;
  if (typeof id !== 'string' || typeof row.sourceUrl !== 'string') return null;
  if (source === 'apple') {
    if (row.osmId !== undefined) return null;
    if (row.kind === 'area') {
      if (id !== `apple-area/${point.latitude},${point.longitude}` || row.sourceUrl !== `https://maps.apple.com/place?coordinate=${point.latitude},${point.longitude}`) return null;
    } else if (!id.startsWith('apple/') || !validJourneyPlaceSource(id, row.sourceUrl)) return null;
  } else if (source !== 'openstreetmap' || !/^(node|way|relation)\//.test(id) || !validJourneyPlaceSource(id, row.sourceUrl) || row.osmId !== undefined && row.osmId !== id) return null;
  if (row.category !== undefined && (row.kind !== 'place' || typeof row.category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, row.category))) return null;
  return { ...point, id, source, name: row.name, address: row.address as string | null, sourceUrl: row.sourceUrl, kind: row.kind as 'area' | 'place', ...(source === 'openstreetmap' ? { osmId: id } : {}), ...(row.category ? { category: row.category as PointCategory } : {}) };
}
