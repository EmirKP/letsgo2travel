import { coordinates } from '@/lib/travel-assistant/places';
import { getTravelMapPlaces, validTravelMapCategory, validTravelMapQuery, TravelMapServiceError } from '@/lib/maps/travel-map-services';

export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  const url = new URL(request.url), lat = url.searchParams.get('lat'), lon = url.searchParams.get('lon'), category = url.searchParams.get('category') || 'all', query = url.searchParams.get('q') || '';
  const decimal = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  const center = lat && lon && decimal.test(lat) && decimal.test(lon) ? coordinates({ latitude: Number(lat), longitude: Number(lon) }) : null;
  if (!center || !validTravelMapCategory(category) || !validTravelMapQuery(query)) return Response.json({ code: 'invalid' }, { status: 400, headers });
  try { return Response.json({ data: await getTravelMapPlaces(center, category, query) }, { headers }); }
  catch (error) { const known = error instanceof TravelMapServiceError ? error : new TravelMapServiceError('map-unavailable'); return Response.json({ code: known.code }, { status: known.status, headers: { ...headers, 'Retry-After': String(known.retryAfter) } }); }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } }); }
