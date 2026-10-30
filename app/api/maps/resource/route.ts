import { allowedOpenMapUrl, OPEN_MAP_RESOURCE_MAX_BYTES } from '@/lib/maps/open-map-resources';

export const runtime = 'nodejs';
export const maxDuration = 25;
const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { ...headers, 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const target = allowedOpenMapUrl(new URL(request.url).searchParams.get('url'));
  if (!target) return failure('invalid_map_resource', 400);
  try {
    const result = await fetch(target, { headers: { 'User-Agent': 'LetsGo2Travel/1.4 (+https://www.letsgo2travel.com.tr)', Accept: '*/*' }, redirect: 'error', signal: AbortSignal.timeout(18_000), cache: 'force-cache', next: { revalidate: 3600 } });
    if (!result.ok || !result.body) { await result.body?.cancel().catch(() => {}); return failure('map_resource_unavailable', result.status === 404 ? 404 : 502); }
    const maximum = OPEN_MAP_RESOURCE_MAX_BYTES;
    if (Number(result.headers.get('content-length')) > maximum) { await result.body.cancel().catch(() => {}); return failure('map_resource_too_large', 502); }
    const reader = result.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximum) throw new Error('too_large'); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); }
    const body = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
    return new Response(body, { headers: { ...headers, 'Content-Type': result.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' } });
  } catch { return failure('map_resource_unavailable', 502); }
}
