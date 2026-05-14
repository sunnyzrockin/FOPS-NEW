'use client';

/**
 * authedFetch — wraps fetch with the current Supabase JWT in the Authorization
 * header. Use this for any backend endpoint that requires verifyAuth on the
 * server side (e.g. POST /api/reports, GET /api/reports, /api/portfolio,
 * /api/fuel-prices, /api/sites, etc.).
 *
 * If the session is missing or expired, returns a synthetic 401 Response so
 * the caller can handle it the same way as a real backend 401 (e.g. bounce
 * to /login).
 *
 * Extracted from /app/app/app/page.js into a shared lib so other components
 * (ShiftReportForm, StaffPriceChangeBanner, dashboards, etc.) can use it
 * after the monolith refactor.
 */
export async function authedFetch(input, init = {}) {
  let token = null;
  try {
    const { createBrowserClient } = await import('@/lib/supabase');
    const sb = createBrowserClient();
    const { data } = await sb.auth.getSession();
    token = data?.session?.access_token || null;
  } catch (e) {
    console.warn('authedFetch: could not read Supabase session', e);
  }
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'No active session', code: 'no_session' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}
