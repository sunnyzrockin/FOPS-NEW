'use client';

/**
 * authedFetch — wraps fetch with the current Supabase JWT in the Authorization
 * header. Use this for any backend endpoint that requires verifyAuth on the
 * server side.
 *
 * Behaviour:
 *  - Reads the session via supabase-js. If null on the first try, attempts a
 *    refreshSession() before giving up (covers a known race where
 *    getSession() momentarily returns null right after a tab switch).
 *  - On a real backend 401 (token rejected), retries once with a refreshed
 *    token. Only after the refreshed token is ALSO rejected do we fall
 *    through with the 401 — at that point the caller should show an error,
 *    NOT hard-redirect the user to /login (that turns a transient hiccup
 *    into a logout). Use a friendly inline error instead.
 *  - If we genuinely cannot acquire a token at all, returns a synthetic 401
 *    with body { code: 'no_session' } so callers can distinguish "you're
 *    not logged in" from "the server rejected your token".
 *
 * Extracted from /app/app/app/page.js into a shared lib so other components
 * (ShiftReportForm, StaffPriceChangeBanner, dashboards, etc.) can use it
 * after the monolith refactor.
 */

async function _readToken(sb, { allowRefresh } = { allowRefresh: false }) {
  try {
    const { data } = await sb.auth.getSession();
    let token = data?.session?.access_token || null;
    if (!token && allowRefresh) {
      // Race: getSession() returns null briefly during fast tab navigation.
      // refreshSession() will return the live token if the user is still
      // authenticated.
      const r = await sb.auth.refreshSession();
      token = r?.data?.session?.access_token || null;
    }
    return token;
  } catch (e) {
    console.warn('authedFetch: could not read Supabase session', e);
    return null;
  }
}

export async function authedFetch(input, init = {}) {
  let sb = null;
  try {
    const { createBrowserClient } = await import('@/lib/supabase');
    sb = createBrowserClient();
  } catch (e) {
    console.warn('authedFetch: could not create Supabase client', e);
    return new Response(
      JSON.stringify({ error: 'No active session', code: 'no_session' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let token = await _readToken(sb, { allowRefresh: true });
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'No active session', code: 'no_session' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const buildRequest = (tok) => {
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${tok}`);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, { ...init, headers });
  };

  let res = await buildRequest(token);

  // If the backend rejected the token, try ONE forced refresh and retry.
  // This handles the case where the cached token is just past expiry but
  // the refresh token is still valid.
  if (res.status === 401) {
    try {
      const r = await sb.auth.refreshSession();
      const fresh = r?.data?.session?.access_token || null;
      if (fresh && fresh !== token) {
        res = await buildRequest(fresh);
      }
    } catch (e) {
      // refresh failed — fall through with the original 401 response.
      console.warn('authedFetch: refreshSession after 401 failed', e);
    }
  }

  return res;
}
