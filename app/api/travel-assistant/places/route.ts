import { NextRequest, NextResponse } from 'next/server';
import { coordinates } from '@/lib/travel-assistant/places';
import { getPlaces } from '@/lib/travel-assistant/server';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 1024) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const decoder = new TextDecoder(); let text = ''; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 1024) { await reader.cancel(); return NextResponse.json({ error: 'Request too large' }, { status: 413 }); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const center = coordinates(body);
  if (!center || !['needs','explore'].includes(body.mode)) return NextResponse.json({ error: 'Invalid location or mode' }, { status: 400 });
  try {
    return NextResponse.json(await getPlaces(center, body.mode), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Nearby places are temporarily unavailable. Emergency numbers remain available offline.' },
      { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
}
