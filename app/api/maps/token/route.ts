import { allowedMapKitOrigin, createMapKitToken, MapKitTokenError } from '@/lib/maps/mapkit-token';

export const runtime = 'nodejs';
export const maxDuration = 5;

function headers(origin?: string) {
  return { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
}
function failure(error: unknown, origin?: string) {
  const known = error instanceof MapKitTokenError ? error : new MapKitTokenError(503);
  return Response.json({ code: known.code, error: known.message }, { status: known.status, headers: headers(origin) });
}

export function POST(request: Request) {
  let origin: string | undefined;
  try {
    origin = allowedMapKitOrigin(request.headers.get('origin'));
    // No caller body, Host, Referer or forwarding header controls signed claims.
    return Response.json(createMapKitToken(origin), { headers: headers(origin) });
  } catch (error) { return failure(error, origin); }
}

export function OPTIONS(request: Request) {
  let origin: string | undefined;
  try {
    origin = allowedMapKitOrigin(request.headers.get('origin'));
    const requested = request.headers.get('access-control-request-headers');
    if (request.headers.get('access-control-request-method') !== 'POST'
      || requested && requested.split(',').some(value => value.trim().toLowerCase() !== 'content-type')) throw new MapKitTokenError(403);
    return new Response(null, { status: 204, headers: { ...headers(origin), 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '300' } });
  } catch (error) { return failure(error, origin); }
}
