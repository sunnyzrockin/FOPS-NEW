/**
 * /api/notifications  —  single REST surface for the bell.
 *
 * Implements the canonical Section E contract:
 *
 *   GET  /api/notifications?limit=50&unread=1
 *     200 → { notifications: Notification[], unreadCount: number }
 *
 *   PATCH /api/notifications   body { id: string }
 *     Marks ONE notification read (read_at = now()) for the authed user.
 *     200 → updated row
 *     404 → not the caller's row
 *
 *   POST /api/notifications   (no body)
 *     Marks every unread notification read for the authed user.
 *     200 → { ok: true }
 *
 * Auth: required on all methods (verifyAuth). All queries are scoped to
 * auth.user.id so a user can NEVER see or mutate another user's rows.
 * The `notifications` table uses `read_at timestamptz` (NULL = unread).
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

function adminOr500() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Server misconfigured', status: supabaseStatus() },
      { status: 500, headers: corsHeaders }
    );
  }
  return null;
}

// ============================ GET ============================
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const adminErr = adminOr500();
    if (adminErr) return adminErr;

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === '1';
    const limit = Math.max(
      1,
      Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10) || 50)
    );

    let listQ = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) listQ = listQ.is('read_at', null);

    const { data: notifications, error } = await listQ;
    if (error) throw error;

    // unreadCount is the TOTAL unread for the user — independent of the
    // limit/filter applied to the listing above.
    const { count: unreadCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .is('read_at', null);

    return NextResponse.json(
      {
        notifications: notifications || [],
        unreadCount: unreadCount || 0,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[notifications GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================ PATCH ============================
//   body { id: string }  → mark one read
export async function PATCH(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const adminErr = adminOr500();
    if (adminErr) return adminErr;

    const body = await request.json().catch(() => ({}));
    const id = body?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'id is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      // Either no such row, or it doesn't belong to this user. 404 either
      // way so we don't leak existence of foreign rows.
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('[notifications PATCH]', error);
    return NextResponse.json(
      { error: 'Failed to update notification', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================ POST ============================
//   mark all unread → read for the authed user
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const adminErr = adminOr500();
    if (adminErr) return adminErr;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .is('read_at', null);

    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('[notifications POST mark-all]', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications read', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
