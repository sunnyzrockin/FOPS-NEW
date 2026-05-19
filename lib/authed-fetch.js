'use client';

/**
 * authedFetch — wraps fetch with the current Supabase JWT in the Authorization
 * header. Use for any backend endpoint that requires verifyAuth.
 *
 * IMPORTANT — this app stores the session in a CUSTOM localStorage key:
 *   localStorage.setItem('supabase-session', JSON.stringify(session))
 * (done by /app/app/login/page.js after POST /api/auth/login). It does NOT
 * use Supabase's default `sb-<project>-auth-token` key, so calling
 * sb.auth.getSession() returns null even when the user is logged in.
 *
 * Flow:
 *   1. Read access_token + refresh_token from `localStorage["supabase-session"]`.
 *   2. If access_token is fresh → use it.
 *   3. If access_token is expired but refresh_token is present → hydrate a
 *      Supabase browser client with setSession({access_token, refresh_token})
 *      so the SDK knows about our session, then call refreshSession() to
 *      mint a new pair. Persist the new session back to localStorage.
 *   4. Fall back to sb.auth.getSession() for SDK-only login flows.
 *   5. On a real 401 from the backend, refresh ONCE and retry the request.
 *   6. Synthetic 401 with { code: 'no_session', debug } only when we
 *      genuinely cannot produce a token.
 *
 * Set window.__AUTHED_FETCH_DEBUG = true (or localStorage["authed-fetch-debug"]="1")
 * in DevTools to enable verbose console logging of each step — handy when
 * production browsers misbehave.
 */

const STORAGE_KEY = 'supabase-session';

function _debug(...args) {
  if (typeof window === 'undefined') return;
  const on =
    window.__AUTHED_FETCH_DEBUG === true ||
    window.localStorage?.getItem?.('authed-fetch-debug') === '1';
  if (on) console.debug('[authedFetch]', ...args);
}

/**
 * Reads and parses our custom session blob. Returns null if nothing usable
 * is stored. The Supabase session object is at the root of the JSON, but
 * very old builds wrapped it under `.session` — we tolerate both.
 */
function _readStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      _debug('storage: no value for', STORAGE_KEY);
      return null;
    }
    const parsed = JSON.parse(raw);
    const session = parsed?.access_token ? parsed : parsed?.session || null;
    if (!session?.access_token) {
      _debug('storage: parsed but no access_token', { keys: Object.keys(parsed || {}) });
      return null;
    }
    const expires_at = session.expires_at || null; // unix seconds
    const skewSeconds = 30; // refresh a touch before expiry
    const expired = expires_at
      ? Date.now() / 1000 > expires_at - skewSeconds
      : false;
    _debug('storage: read', {
      hasAccess: !!session.access_token,
      hasRefresh: !!session.refresh_token,
      expires_at,
      expired,
    });
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token || null,
      expires_at,
      expired,
      raw: session,
    };
  } catch (e) {
    console.warn('[authedFetch] could not parse stored session', e);
    return null;
  }
}

function _persistSession(session) {
  if (typeof window === 'undefined' || !session) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    _debug('storage: persisted refreshed session', {
      expires_at: session.expires_at,
    });
  } catch (e) {
    console.warn('[authedFetch] failed to persist refreshed session', e);
  }
}

async function _getBrowserClient() {
  try {
    const { createBrowserClient } = await import('@/lib/supabase');
    return createBrowserClient();
  } catch (e) {
    console.warn('[authedFetch] supabase browser client unavailable', e);
    return null;
  }
}

/**
 * If we have a refresh_token (from localStorage), hydrate the Supabase
 * client with it and refresh. This is the key fix — without setSession(),
 * the SDK has no idea we're logged in and refreshSession() returns null.
 */
async function _refreshUsingStoredRefreshToken(stored) {
  if (!stored?.refresh_token) {
    _debug('refresh: no refresh_token in stored session');
    return null;
  }
  const sb = await _getBrowserClient();
  if (!sb) return null;
  try {
    // Seed the SDK's in-memory session so refreshSession() works.
    await sb.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    const r = await sb.auth.refreshSession();
    const newSession = r?.data?.session;
    if (newSession?.access_token) {
      _persistSession(newSession);
      _debug('refresh: ok via stored refresh_token');
      return newSession.access_token;
    }
    _debug('refresh: SDK returned no session', { error: r?.error?.message });
    return null;
  } catch (e) {
    console.warn('[authedFetch] refresh via stored refresh_token failed', e);
    return null;
  }
}

/**
 * Last-resort: ask the SDK if it has a session in its own storage.
 * Only useful when someone logged in via the SDK directly (not via
 * our /api/auth/login route).
 */
async function _readTokenFromSdk() {
  const sb = await _getBrowserClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    let token = data?.session?.access_token || null;
    if (!token) {
      const r = await sb.auth.refreshSession();
      token = r?.data?.session?.access_token || null;
    }
    return token;
  } catch (e) {
    _debug('sdk: getSession failed', e?.message);
    return null;
  }
}

export async function authedFetch(input, init = {}) {
  if (typeof window === 'undefined') {
    // Never run on the server; bail out loudly.
    return new Response(
      JSON.stringify({ error: 'authedFetch called on server', code: 'server_context' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let stored = _readStoredSession();
  let token = stored && !stored.expired ? stored.access_token : null;

  // If we have an expired access_token but a refresh_token, refresh now.
  if (!token && stored?.refresh_token) {
    token = await _refreshUsingStoredRefreshToken(stored);
  }

  // Edge case: someone signed in via the SDK directly. Check SDK storage.
  if (!token) {
    token = await _readTokenFromSdk();
    _debug('fallback: sdk token?', !!token);
  }

  if (!token) {
    const debug = {
      hadStoredBlob: !!stored,
      hadAccessToken: !!stored?.access_token,
      hadRefreshToken: !!stored?.refresh_token,
      expired: !!stored?.expired,
      now: Math.floor(Date.now() / 1000),
      expires_at: stored?.expires_at || null,
    };
    _debug('giving up — synthetic 401', debug);
    return new Response(
      JSON.stringify({
        error: 'No active session',
        code: 'no_session',
        debug,
      }),
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

  // On a real 401, try one forced refresh via the stored refresh_token,
  // then retry the original request once.
  if (res.status === 401) {
    _debug('backend returned 401 — attempting refresh once');
    const fresh = stored?.refresh_token
      ? await _refreshUsingStoredRefreshToken(stored)
      : await _readTokenFromSdk();
    if (fresh && fresh !== token) {
      res = await buildRequest(fresh);
    }
  }

  return res;
}
