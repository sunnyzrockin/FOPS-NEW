import { NextResponse } from 'next/server';

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Protected routes - require authentication
  if (pathname.startsWith('/app')) {
    // Check for Supabase session cookie
    const hasSession = req.cookies.has('sb-access-token') || req.cookies.has('sb-xjpelthxnnetecfympmv-auth-token');
    
    if (!hasSession) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('redirectedFrom', pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Redirect authenticated users away from auth pages
  if (pathname === '/login' || pathname === '/signup') {
    const hasSession = req.cookies.has('sb-access-token') || req.cookies.has('sb-xjpelthxnnetecfympmv-auth-token');
    
    if (hasSession) {
      return NextResponse.redirect(new URL('/app', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
};
