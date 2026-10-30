import { boundedJson } from '@/lib/travel-assistant/http';
import { getTravelMapDirections, parseTravelMapRouteInput, TravelMapServiceError } from '@/lib/maps/travel-map-services';

export const runtime = 'nodejs';
export const maxDuration = 25;
const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
export async function POST(request: Request) {
  let input;
  try { input = parseTravelMapRouteInput(await boundedJson(request, 2048)); } catch { /* Invalid or oversized input never reaches a provider. */ }
  if (!input) return Response.json({ code: 'invalid' }, { status: 400, headers });
  try { return Response.json({ data: await getTravelMapDirections(input) }, { headers }); }
  catch (error) { const known = error instanceof TravelMapServiceError ? error : new TravelMapServiceError('route-unavailable'); return Response.json({ code: known.code }, { status: known.status, headers: { ...headers, ...(known.retryAfter ? { 'Retry-After': String(known.retryAfter) } : {}) } }); }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } }); }
