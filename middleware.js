import { NextResponse } from 'next/server';

export async function middleware(req) {
  const url = req.nextUrl;
  const { pathname } = url;

  // ============================================================
  // NOTE: apex (fopsapp.com) → www (www.fopsapp.com) redirection
  // is handled by VERCEL at the edge (308 Permanent). We do NOT
  // re-do it here — running the redirect in middleware ALSO would
  // create an infinite loop with Vercel's redirect. The apex/www
  // problem is resolved as long as users land on www.
  // ============================================================

  // Skip middleware for API routes, static files
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow /dev-login for debugging
  if (pathname === '/dev-login') {
    return NextResponse.next();
  }

  // Allow public accept-invite pages (no auth required)
  if (pathname.startsWith('/accept-invite')) {
    return NextResponse.next();
  }

  // Protected route: /app
  // Check happens client-side in AuthProvider - middleware just adds headers
  if (pathname.startsWith('/app')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('x-protected-route', 'true');
    return response;
  }

  // All other routes
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
