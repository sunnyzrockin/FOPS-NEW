import { createClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// IMPORTANT: Do NOT throw at module load. On Vercel, throwing during
// module initialization can cause the entire route to crash with
// an empty response body, making debugging impossible.
// Instead, log a warning and return null clients so consumers can
// surface a clean JSON error.
if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[lib/supabase] Missing Supabase env vars at module init. ' +
      `URL_set=${!!supabaseUrl} ANON_set=${!!supabaseAnonKey}`
  );
}

// Server-side client (for API routes) - uses anon key
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Admin client with service role key (bypasses RLS, for seeding and admin operations)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Diagnostic helper – tells callers exactly which client is missing
export const supabaseStatus = () => ({
  hasUrl: !!supabaseUrl,
  hasAnon: !!supabaseAnonKey,
  hasServiceRole: !!supabaseServiceKey,
  hasClient: !!supabase,
  hasAdmin: !!supabaseAdmin,
});

// Client-side helper (for browser).
//
// IMPORTANT: We use @supabase/ssr's createBrowserClient (not the plain
// @supabase/supabase-js createClient) because the new server-side
// middleware (Section 1 security) authenticates /app/* via the
// sb-<project>-auth-token HTTP cookies. The SSR browser client writes
// those cookies automatically on signIn / setSession. The plain
// @supabase/supabase-js client only writes to localStorage, which the
// middleware (running server-side) cannot read, leading to a redirect
// loop after login. createBrowserClient still keeps localStorage in
// sync, so existing client code that reads `supabase-session` from
// localStorage continues to work.
export const createBrowserClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars on client');
  }
  return createSSRBrowserClient(supabaseUrl, supabaseAnonKey);
};

export default supabase;
