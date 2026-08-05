import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function safeInternalPath(value: string | null, requestUrl: URL) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/profil';
  }

  try {
    const target = new URL(value, requestUrl.origin);
    if (target.origin !== requestUrl.origin) return '/profil';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/profil';
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/auth/login?error=oauth', request.url));
  }

  const safeNext = safeInternalPath(requestUrl.searchParams.get('next'), requestUrl);
  requestUrl.searchParams.delete('next');

  // PKCE parametrelerini hedef sayfaya taşı; tarayıcıdaki Supabase istemcisi oturumu tamamlar.
  const target = new URL(safeNext, request.url);
  for (const [key, value] of requestUrl.searchParams) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}
