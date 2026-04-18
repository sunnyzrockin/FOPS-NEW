import { NextResponse } from 'next/server';

// MIDDLEWARE TEMPORARILY DISABLED FOR DEBUGGING
export async function middleware(req) {
  // Allow all requests through - no auth checks
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('x-debug-middleware', 'disabled');
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
