/**
 * POST /api/waitlist — public waitlist submission.
 *
 * Uses the ANON key on purpose (not service_role) so the anon INSERT-only
 * RLS policy is the authoritative constraint. This means:
 *   1. If our /api/waitlist code has a bug that lets bad data through,
 *      the DB's WITH CHECK (email format, length bounds) still rejects
 *      it.
 *   2. If someone bypasses our API entirely and hits PostgREST directly
 *      with the anon key, they land in the exact same policy — no
 *      difference in behaviour or safety.
 *
 * Defense-in-depth we ADD server-side:
 *   - Per-IP rate limiting (5/60s) so a bot can't hammer the endpoint
 *   - Server-side email format validation with the same regex as the
 *     RLS policy, but returns a nice 400 instead of a Postgres error
 *   - Captures ip + user_agent + referrer (source) which the client
 *     wouldn't set correctly
 *   - Graceful handling of the unique-email conflict — we return 200
 *     with a friendly "you're already on the list" so an already-listed
 *     visitor doesn't get scared by an error
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { optionsHandler } from '@/lib/api/cors';
import { rateLimit, clientIp } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Anon client — intentional; the RLS policy is our enforcement.
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// Loose but sensible email regex (matches the RLS policy shape).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function _sanitize(str, maxLen) {
  if (str === undefined || str === null) return null;
  const trimmed = String(str).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export const OPTIONS = optionsHandler;

export async function POST(request) {
  try {
    // Rate limit — 5/min/IP. Waitlist form isn't an attack surface but
    // let's not let one bot burn our Supabase INSERT quota either.
    const ip = clientIp(request);
    const rl = rateLimit(
      { key: `waitlist:${ip}`, limit: 5, windowMs: 60_000 },
      request,
    );
    if (!rl.ok) return rl.response;

    let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const email = _sanitize(body?.email, 320);
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "That doesn't look like a valid email address" }, { status: 400 });
    }

    const name      = _sanitize(body?.name,      200);
    const business  = _sanitize(body?.business,  200);
    const numSites  = _sanitize(body?.num_sites, 50);
    const utm       = body?.utm && typeof body.utm === 'object' ? body.utm : null;
    const source    = _sanitize(body?.source,    50) || 'landing';
    const userAgent = _sanitize(request.headers.get('user-agent'), 500);

    // INSERT via anon (RLS enforces schema shape + format).
    const { error } = await supabaseAnon.from('waitlist').insert({
      email: email.toLowerCase(),
      name,
      business,
      num_sites: numSites,
      source,
      utm,
      // ip + user_agent captured server-side; anon INSERT policy allows
      // these because RLS only constrains email format / lengths.
      ip,
      user_agent: userAgent,
    });

    if (error) {
      // 23505 = unique_violation on waitlist_email_lower_idx — treat as
      // idempotent success so the same visitor submitting twice doesn't
      // see a scary error.
      if (error.code === '23505') {
        return NextResponse.json({
          ok: true,
          alreadyOnList: true,
          message: "You're already on the list — we'll be in touch.",
        });
      }
      // 42P01 (PostgreSQL) or PGRST205 (PostgREST 12+) = table missing.
      // Also match by message when the code isn't set — different Supabase
      // versions surface this differently.
      const looksLikeMissingTable =
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /Could not find the table|relation .* does not exist/i.test(error.message || '');
      if (looksLikeMissingTable) {
        console.error('[waitlist] table missing — apply lib/supabase-waitlist.sql', error.message);
        return NextResponse.json({
          error: 'Waitlist is temporarily unavailable — please email hello@fopsapp.com.',
          code: 'waitlist_table_missing',
        }, { status: 503 });
      }
      // 42501 or the RLS check violation — also surface with a hint,
      // don't leak internals to the browser.
      console.error('[waitlist] insert error', { code: error.code, message: error.message });
      return NextResponse.json({
        error: "We couldn't save your details — please try again or email hello@fopsapp.com.",
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "You're on the list — we'll be in touch when early access opens.",
    });
  } catch (e) {
    console.error('[waitlist] unexpected error', e);
    return NextResponse.json({
      error: 'Something went wrong — please try again in a moment.',
    }, { status: 500 });
  }
}
