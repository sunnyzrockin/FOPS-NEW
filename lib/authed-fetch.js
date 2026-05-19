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
 * That's why the earlier version was returning a synthetic 401 on every
 * call — it was looking in the wrong place. This rewrite reads the
 * custom key directly, with a Supabase client fallback for completeness.
 *
 * Behaviour:
 *  - Reads the token from `localStorage["supabase-session"]` first.
 *  - Falls back to sb.auth.getSession() / refreshSession() for robustness.
 *  - On a real 401 from the backend, refreshes via Supabase once and retries.
 *  - Synthetic 401 { code: 'no_session' } only when we genuinely cannot find
 *    a token at all.
 */

function _readTokenFromCustomStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('supabase-session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token || parsed?.session?.access_token || null;
    if (!token) return null;
    // Best-effort expiry check (session payload includes expires_at unix s).
    const expiresAt = parsed?.expires_at || parsed?.session?.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt + 5) {
      // Token expired — let the caller fall back to refresh.
      return { token, expired: true };
    }
    return { token, expired: false };
  } catch (e) {
    console.warn('authedFetch: could not parse supabase-session', e);
    return null;
  }
}

async function _readTokenFromSupabaseClient({ allowRefresh } = { allowRefresh: false }) {
  try {
    const { createBrowserClient } = await import('@/lib/supabase');
    const sb = createBrowserClient();
    const { data } = await sb.auth.getSession();
    let token = data?.session?.access_token || null;
    if (!token && allowRefresh) {
      const r = await sb.auth.refreshSession();
      token = r?.data?.session?.access_token || null;
    }
    return { sb, token };
  } catch (e) {
    console.warn('authedFetch: supabase client read failed', e);
    return { sb: null, token: null };
  }
}

export async function authedFetch(input, init = {}) {
  // Primary path: pull from the custom localStorage key the login page
  // writes. Synchronous, no Supabase client roundtrip.
  let custom = _readTokenFromCustomStorage();
  let token = custom?.token && !custom.expired ? custom.token : null;

  // Fallback: use the Supabase client (with refresh) — covers the edge case
  // where someone signs in via the SDK directly instead of via /api/auth/login.
  let sb = null;
  if (!token) {
    const r = await _readTokenFromSupabaseClient({ allowRefresh: true });
    sb = r.sb;
    token = r.token;
  }

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

  // If the backend rejected the token (real 401), try ONE forced refresh
  // via the Supabase client. Skip silently if the client isn't reachable.
  if (res.status === 401) {
    try {
      if (!sb) {
        const r = await _readTokenFromSupabaseClient({ allowRefresh: false });
        sb = r.sb;
      }
      if (sb) {
        const r = await sb.auth.refreshSession();
        const fresh = r?.data?.session?.access_token || null;
        if (fresh && fresh !== token) {
          // Persist the refreshed token to our custom key so subsequent
          // calls in the same tab don't have to refresh again.
          try {
            window.localStorage.setItem(
              'supabase-session',
              JSON.stringify(r.data.session)
            );
          } catch {}
          res = await buildRequest(fresh);
        }
      }
    } catch (e) {
      console.warn('authedFetch: refresh after 401 failed', e);
    }
  }

  return res;
}
