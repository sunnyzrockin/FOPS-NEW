import { NextResponse } from 'next/server';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  
  // Skip middleware for API routes, static files, and auth callback
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth/callback') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Protected routes - require authentication
  if (pathname.startsWith('/app')) {
    // Check for user data in localStorage (client-side) - middleware will allow through
    // Real auth check happens client-side in AuthProvider
    const response = NextResponse.next();
    
    // Disable caching to prevent stale redirects
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('x-middleware-cache', 'no-cache');
    
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
