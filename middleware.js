import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * FOPS middleware.
 *
 * Responsibilities:
 *   1. Skip API / static / image / dev paths.
 *   2. For `/app/*` routes — verify that the request has a valid Supabase
 *      session (server-side cookie). If not, redirect to /login. This is
 *      in ADDITION to the client-side <AuthProvider /> guard; defence in
 *      depth.
 *   3. Set cache-control: no-store on every HTML response (Supabase auth
 *      relies on fresh cookie reads).
 *
 * Notes:
 *   - apex (fopsapp.com) → www redirection is handled at the Vercel edge,
 *     NOT here. Doing it here too would create a redirect loop.
 *   - `/dev-login` and `/accept-invite/*` are intentionally public.
 *   - `/founder/*` is gated separately by its own server-side check inside
 *     the page (founder login lives at /founder, the dashboard at
 *     /founder/dashboard). We don't want to redirect /founder to /login.
 */
export async function middleware(req) {
  const url = req.nextUrl;
  const { pathname } = url;

  // ----- Skip non-page routes -------------------------------------------
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // ----- Public pages ---------------------------------------------------
  if (
    pathname === '/dev-login' ||
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/accept-invite') ||
    pathname.startsWith('/founder') // founder has its own gate
  ) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  }

  // ----- Protected: /app/* ---------------------------------------------
  if (pathname.startsWith('/app')) {
    // Build a response we can mutate (Supabase may write refreshed cookies).
    let response = NextResponse.next({ request: { headers: req.headers } });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // If env not configured, fail open (don't break local dev). Production
    // builds always have these set.
    if (!supabaseUrl || !supabaseAnonKey) {
      response.headers.set('Cache-Control', 'no-store, max-age=0');
      response.headers.set('x-protected-route', 'true');
      response.headers.set('x-auth-check', 'skipped-no-env');
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            req.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // getUser() forces a token-validation round-trip against Supabase Auth,
    // which is what we want here (not the local-cookie-only getSession()).
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user || null;
    } catch (e) {
      console.error('[middleware] auth check failed:', e?.message);
      user = null;
    }

    if (!user) {
      // No valid session → redirect to /login with `next` param so we can
      // bounce them back here after a successful login.
      const loginUrl = new URL('/login', req.url);
      if (pathname !== '/app') loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('x-protected-route', 'true');
    response.headers.set('x-auth-check', 'passed');
    return response;
  }

  // ----- Everything else -----------------------------------------------
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
