/**
 * /api/users/me
 *
 * Self-service endpoints for the currently authenticated user. Authenticated
 * callers can read or update a small, safe subset of their own user record
 * without needing owner/operator permissions.
 *
 * Methods:
 *   GET   -> return the authed user's row (whoami)
 *   PATCH -> update a whitelisted set of self-editable fields
 *              currently: { first_login }
 *
 * Why a dedicated `/me` route?  Going through `/api/users/[id]` would either
 * require us to expose write access for any-user-to-any-user (bad), or to
 * sprinkle "auth.user.id === params.id" checks at each call site. A focused
 * `/me` endpoint keeps the permission model crystal clear: the caller is
 * always editing themselves, full stop.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { logAuditAsync } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

// Whitelist of fields a user is allowed to update on themselves.
// Keep this VERY small — anything role/permission/identity related belongs
// behind owner/operator-gated endpoints, not here.
const SELF_EDITABLE_FIELDS = new Set(['first_login']);

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(auth.user, { headers: corsHeaders });
}

export async function PATCH(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await request.json().catch(() => ({}));
    const updates = {};

    for (const [key, value] of Object.entries(body || {})) {
      if (SELF_EDITABLE_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: 'No updatable fields provided',
          allowed: Array.from(SELF_EDITABLE_FIELDS),
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Coerce booleans defensively — clients sometimes POST "false" as a string.
    if ('first_login' in updates) {
      updates.first_login = updates.first_login === true || updates.first_login === 'true';
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', auth.user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update profile', message: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

    logAuditAsync({
      request,
      actor: auth.user,
      action: 'update',
      tableName: 'users',
      recordId: auth.user.id,
      before: Object.fromEntries(
        Object.keys(updates).map((k) => [k, auth.user[k]])
      ),
      after: updates,
    });

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('[users/me PATCH]', error);
    return NextResponse.json(
      { error: 'Failed to update profile', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
