import { getMapPlaceSearch, MapSearchError, parseMapSearchInput } from '@/lib/maps/map-place-search';

export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };

/** Invoked only by an explicit search submission; never call this from autocomplete. */
export async function GET(request: Request) {
  const input = parseMapSearchInput(new URL(request.url).searchParams);
  if (!input) return Response.json({ code: 'invalid' }, { status: 400, headers });
  try { return Response.json({ data: await getMapPlaceSearch(input) }, { headers }); }
  catch (error) {
    const known = error instanceof MapSearchError ? error : new MapSearchError('search-unavailable');
    return Response.json({ code: known.code }, { status: known.status, headers: { ...headers, ...(known.retryAfter ? { 'Retry-After': String(known.retryAfter) } : {}) } });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
}
