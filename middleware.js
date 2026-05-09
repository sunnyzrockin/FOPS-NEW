import { NextResponse } from 'next/server';

export async function middleware(req) {
  const url = req.nextUrl;
  const { pathname } = url;
  const host = req.headers.get('host') || '';

  // ============================================================
  // SAFETY NET: redirect www.fopsapp.com → fopsapp.com (apex)
  // ============================================================
  // We set the apex as the canonical domain. If users land on the
  // www subdomain (browser autocomplete, old bookmarks), redirect
  // them BEFORE any fetch fires, so all subsequent /api calls
  // happen on the same origin and don't lose POST bodies on a 307.
  //
  // Set CANONICAL_HOST in env to override (e.g. for staging).
  if (process.env.NODE_ENV === 'production') {
    const canonical = (process.env.CANONICAL_HOST || 'fopsapp.com').toLowerCase();
    const lowerHost = host.toLowerCase();
    if (lowerHost === `www.${canonical}`) {
      const redirectUrl = new URL(url);
      redirectUrl.host = canonical;
      return NextResponse.redirect(redirectUrl, 308);
    }
  }

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
