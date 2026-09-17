import { NextRequest, NextResponse } from 'next/server';
import { CURRENCIES } from '@/lib/travel-assistant/money';
import { getFx } from '@/lib/travel-assistant/server';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get('base') || '';
  const quote = request.nextUrl.searchParams.get('quote') || '';
  if (!CURRENCIES.includes(base) || !CURRENCIES.includes(quote)) return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 });
  try {
    return NextResponse.json(await getFx(base, quote), { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
  } catch { return NextResponse.json({ error: 'Recent exchange rate unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
