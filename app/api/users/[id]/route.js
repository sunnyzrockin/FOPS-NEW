import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase, supabaseStatus } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// PUT /api/users/:id  -> update user fields
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const updates = await request.json();
    const client = supabaseAdmin || supabase;
    if (!client) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const { data, error } = await client
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('[users PUT]', error);
    return NextResponse.json(
      { error: 'Failed to update user', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE /api/users/:id  -> delete user (DB row + auth user)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Look up the user to get auth_user_id for cleanup
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('auth_user_id')
      .eq('id', id)
      .single();

    // Delete DB row
    const { error: delErr } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    // Best-effort delete auth user
    if (userRow?.auth_user_id) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userRow.auth_user_id);
      } catch (_) {}
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('[users DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete user', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
