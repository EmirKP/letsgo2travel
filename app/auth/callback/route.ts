import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth', request.url));
  }

  const requestedNext = requestUrl.searchParams.get('next');
  const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/profil';
  requestUrl.searchParams.delete('next');

  // PKCE parametrelerini hedef sayfaya taşı; tarayıcıdaki Supabase istemcisi oturumu tamamlar.
  const target = new URL(safeNext, request.url);
  target.search = requestUrl.searchParams.toString();
  return NextResponse.redirect(target);
}
