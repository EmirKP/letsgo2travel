import { boundedJson } from '@/lib/travel-assistant/http';
import { journeySearchQuery, searchJourneyPlaces } from '@/lib/travel-assistant/journey-search';
export const runtime = 'nodejs';
export const maxDuration = 15;
export async function POST(request: Request) {
  let body: unknown;
  try { body = await boundedJson(request, 1024); }
  catch (error) { return Response.json({ error: 'Invalid request' }, { status: error instanceof Error && error.message === 'too-large' ? 413 : 400 }); }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const query = journeySearchQuery(input.query), locale = input.locale ?? 'en';
  if (!query || !['tr', 'en', 'sq'].includes(String(locale))) return Response.json({ error: 'Invalid place search' }, { status: 400 });
  try { return Response.json(await searchJourneyPlaces(query, String(locale)), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ code: 'geocoding_unavailable', error: 'Address search is temporarily unavailable' }, { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }); }
}
