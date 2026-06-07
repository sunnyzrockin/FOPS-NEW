/**
 * POST /api/notifications/mark-all-read
 *
 * Mark every unread notification belonging to the authed user as read.
 * Returns the number of rows updated so the UI can confirm.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .is('read_at', null)
      .select('id');

    if (error) throw error;

    return NextResponse.json(
      { ok: true, updated: (data || []).length },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[notifications mark-all-read POST]', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications read', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
