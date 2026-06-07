/**
 * GET /api/notifications
 *
 * Returns the authed user's notifications, newest first.
 *
 *   Query params:
 *     ?unread=1        — only rows where read_at IS NULL
 *     ?limit=50        — cap at 100 (default 50)
 *
 * Response shape:
 *   {
 *     items: Notification[],
 *     unread_count: number       // total unread, irrespective of `limit`
 *   }
 *
 * Auth: required. Users only ever see their own notifications.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === '1';
    const limit = Math.max(
      1,
      Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10) || 50)
    );

    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    // Fetch unread count regardless of the unreadOnly filter — the
    // notification bell needs the count even when showing a filtered list.
    const { count: unread_count } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .is('read_at', null);

    return NextResponse.json(
      { items: items || [], unread_count: unread_count || 0 },
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
