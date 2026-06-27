import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth', request.url));
  }

  // Preserve search params (like ?code=...) so client-side supabase-js can handle the PKCE exchange
  return NextResponse.redirect(new URL(`/profil${requestUrl.search}`, request.url));
}
