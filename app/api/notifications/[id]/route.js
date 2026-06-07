/**
 * PATCH /api/notifications/[id]
 *
 * Mark a single notification as read. The caller MUST own the notification
 * (user_id matches the authed user); otherwise 404 — we deliberately do
 * NOT 403 to avoid leaking existence of other users' notifications.
 *
 * Body shape is optional. If a body is supplied with { read: false } we'll
 * mark it as UNREAD instead (clears read_at), in case the UI ever wants an
 * "undo" affordance.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

export async function PATCH(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    // Default: mark as read. Pass { read: false } to undo.
    const markRead = body?.read === false ? false : true;
    const newReadAt = markRead ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: newReadAt })
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
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
