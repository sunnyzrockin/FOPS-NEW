/**
 * Auth helpers for API routes.
 *
 * Usage in any /api/(...)/route.js:
 *
 *   import { verifyAuth, requireRole } from '@/lib/auth-helpers';
 *
 *   export async function POST(request) {
 *     const authResult = await verifyAuth(request);
 *     if (!authResult.ok) return authResult.response;
 *     const user = authResult.user;  // { id, role, email, ... }
 *
 *     // Or, gate by role:
 *     const auth = await requireRole(request, ['owner', 'operator']);
 *     if (!auth.ok) return auth.response;
 *     // ... handler logic ...
 *   }
 *
 * The token is read from the `Authorization: Bearer <jwt>` header.
 * Falls back to checking `x-user-id` cookie for legacy compatibility
 * during the migration period (will be removed once frontend always
 * sends the JWT).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from './supabase';
import { corsHeadersFor } from './api/cors';

// Anon client used ONLY for token validation (auth.getUser).
const _supabaseAnonForAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Verify the request is authenticated.
 * Returns: { ok: true, user, token } on success, or
 *          { ok: false, response: NextResponse } on failure.
 */
export async function verifyAuth(request, { allowAnon = false } = {}) {
  const headers = corsHeadersFor(request);
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    if (allowAnon) return { ok: true, user: null, token: null };
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing Authorization header' },
        { status: 401, headers }
      ),
    };
  }

  // Validate the token against Supabase Auth
  let authUser = null;
  try {
    const { data, error } = await _supabaseAnonForAuth.auth.getUser(token);
    if (error || !data?.user) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Invalid or expired token', detail: error?.message },
          { status: 401, headers }
        ),
      };
    }
    authUser = data.user;
  } catch (e) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Token verification failed', detail: e.message },
        { status: 401, headers }
      ),
    };
  }

  // Look up our internal user record for role/permissions
  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server misconfigured (admin client missing)' },
        { status: 500, headers }
      ),
    };
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single();

  if (userError || !userRow) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'User not found in database' },
        { status: 404, headers }
      ),
    };
  }

  if (userRow.status !== 'active') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Account is disabled' },
        { status: 403, headers }
      ),
    };
  }

  // Demo tenant write-rejection: enforced server-side regardless of UI.
  // Any user with users.is_demo = true gets every mutating HTTP method
  // (POST/PUT/PATCH/DELETE) rejected with 403. Read-only by force.
  const method = (request.method || '').toUpperCase();
  const MUTATING = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (userRow.is_demo && MUTATING) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Demo mode is read-only',
          code: 'demo_readonly',
          hint: 'Sign up to create your own tenant and make changes.',
        },
        { status: 403, headers }
      ),
    };
  }

  // Tag Sentry events with the opaque user id + role so authenticated
  // errors are correlated with the right tenant. Email/JWT are NEVER
  // attached — they would be scrubbed by sentry-scrub.js anyway, but
  // we don't even include them here.
  try {
    Sentry.setUser({ id: userRow.id });
    Sentry.setTag('user.role', userRow.role);
  } catch {
    /* Sentry might not be initialized in some edge contexts; ignore. */
  }

  return {
    ok: true,
    user: userRow,
    token,
    authUser,
  };
}

/**
 * Verify auth AND require one of the given roles.
 * Returns the same shape as verifyAuth, plus a 403 response if role mismatch.
 */
export async function requireRole(request, allowedRoles) {
  const result = await verifyAuth(request);
  if (!result.ok) return result;

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(result.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Insufficient permissions',
          required: roles,
          current: result.user.role,
        },
        { status: 403 }
      ),
    };
  }
  return result;
}

// ========== Simple in-memory rate limiter ==========
//
// ⚠️ SERVERLESS GAP — primary defence is the Supabase platform rate
// limiter (Auth → Rate Limits in the Supabase Dashboard, Part A3 of
// memory/EMERGENT_auth_hardening.md). This in-memory limiter is
// best-effort defence-in-depth ON TOP of that. Two known limitations:
//   1. Per-instance — each Vercel/serverless cold-start gets its own
//      Map, so an attacker fanning out across instances bypasses it.
//   2. Lost on deploy/restart — counts reset to zero.
// We accept these because the *real* lockout happens at Supabase's
// edge (configured via dashboard), which IS shared and durable.
// For a future shared-store limiter, plug Upstash Redis / Vercel KV
// into this same function signature — callers don't need to change.
// See memory/auth-hardening-followups.md "B2 strategy decision".

const _rateLimitBuckets = new Map();

/**
 * Returns { ok: true } if under limit, or { ok: false, response } if over.
 *
 *   const rl = rateLimit({ key: `signup:${ip}`, limit: 5, windowMs: 60_000 });
 *   if (!rl.ok) return rl.response;
 */
export function rateLimit({ key, limit = 30, windowMs = 60_000 }, request = null) {
  const headers = request ? corsHeadersFor(request) : undefined;
  const now = Date.now();
  const bucket = _rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    _rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many requests', retryAfter: retryAfterSec },
        {
          status: 429,
          headers: { ...(headers || {}), 'Retry-After': String(retryAfterSec) },
        }
      ),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count };
}

/**
 * Pull a stable IP/identifier from the request for rate-limit keying.
 */
export function clientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Periodic cleanup so the in-memory map doesn't grow forever.
// (Cheap; runs on each call after a 5-min interval.)
let _lastSweep = Date.now();
function _maybeSweep() {
  const now = Date.now();
  if (now - _lastSweep < 5 * 60_000) return;
  _lastSweep = now;
  for (const [k, v] of _rateLimitBuckets) {
    if (v.resetAt < now) _rateLimitBuckets.delete(k);
  }
}
// hook into module evaluation
setInterval(_maybeSweep, 60_000).unref?.();
