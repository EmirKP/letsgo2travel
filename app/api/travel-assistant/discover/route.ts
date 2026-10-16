import { boundedJson } from '@/lib/travel-assistant/http';
import { coordinates } from '@/lib/travel-assistant/places';
import { DISCOVERY_GROUPS, discoverJourneyPlaces } from '@/lib/travel-assistant/journey-discovery';
import type { JourneyDiscoveryGroup } from '@/lib/travel-assistant/journey-types';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  let body: unknown;
  try { body = await boundedJson(request, 1024); }
  catch (error) { return Response.json({ error: 'Invalid request' }, { status: error instanceof Error && error.message === 'too-large' ? 413 : 400 }); }
  const center = coordinates(body);
  const group = body && typeof body === 'object' && 'category' in body ? body.category : null;
  const categoryVersion = body && typeof body === 'object' && 'placeCategoryVersion' in body ? body.placeCategoryVersion : undefined;
  if (categoryVersion !== undefined && categoryVersion !== 2) return Response.json({ error: 'Invalid category capability' }, { status: 400 });
  if (!center || !DISCOVERY_GROUPS.includes(group as JourneyDiscoveryGroup)) return Response.json({ error: 'Invalid discovery area or category' }, { status: 400 });
  try {
    const result = await discoverJourneyPlaces(center, group as JourneyDiscoveryGroup);
    // Build 72 validates every POI category. Never expose a new category unless
    // the client explicitly opts in; keep the shared provider cache untouched.
    const places = categoryVersion === 2 ? result.places : result.places.filter(place => !['beach', 'hiking'].includes(place.category));
    return Response.json({ ...result, places, limited: result.limited || places.length !== result.places.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  catch { return Response.json({ code: 'discovery_unavailable', error: 'Place discovery is temporarily unavailable' }, { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }); }
}
