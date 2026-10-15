import { boundedJson } from '@/lib/travel-assistant/http';
import { getJourneyWalkingRoute, journeyStops } from '@/lib/travel-assistant/journey-routing';
export const runtime = 'nodejs';
export const maxDuration = 20;
export async function POST(request: Request) {
  let body: unknown;
  try { body = await boundedJson(request, 4096); }
  catch (error) { return Response.json({ error: 'Invalid request' }, { status: error instanceof Error && error.message === 'too-large' ? 413 : 400 }); }
  const stops = journeyStops(body && typeof body === 'object' && 'stops' in body ? body.stops : null);
  if (!stops) return Response.json({ error: 'Use 2 to 20 distinct nearby stops' }, { status: 400 });
  try { return Response.json(await getJourneyWalkingRoute(stops), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ code: 'routing_unavailable', error: 'Walking directions are temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }); }
}
