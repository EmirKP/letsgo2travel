import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Sadece /admin rotalarını koruyoruz
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // /admin/login sayfasına erişimi serbest bırak
    if (request.nextUrl.pathname === '/admin/login') {
      return NextResponse.next();
    }

    // Basit bir auth kontrolü (cookie tabanlı)
    const isAuthenticated = request.cookies.get('admin_session')?.value === 'true';

    if (!isAuthenticated) {
      // Oturum yoksa login'e yönlendir
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
