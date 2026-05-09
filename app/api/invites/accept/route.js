import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { rateLimit, clientIp } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ----------- GET /api/invites/accept?token=xxx -----------
// Used by the accept-invite page on initial load to fetch the invite
// metadata (email, role, inviter) so we can pre-fill the form.
// Does NOT consume the invite — that happens on POST.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return NextResponse.json(
        { error: 'Missing token' },
        { status: 400, headers: corsHeaders }
      );
    }

    const client = supabaseAdmin || supabase;
    const { data: invite, error } = await client
      .from('user_invites')
      .select(`
        *,
        invited_by:users!invited_by_user_id(id, name, email)
      `)
      .eq('token', token)
      .single();

    if (error || !invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: `This invite has already been ${invite.status}` },
        { status: 410, headers: corsHeaders }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invite has expired' },
        { status: 410, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        email: invite.email,
        role: invite.role,
        invited_by_name: invite.invited_by?.name || null,
        site_id: invite.site_id,
        site_ids: invite.site_ids,
        expires_at: invite.expires_at,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to validate invite', message: e?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ----------- POST /api/invites/accept -----------
// Body: { token, name, password }
// Creates the auth user + DB user, links any site assignments from the
// invite, and marks the invite as 'accepted'.
export async function POST(request) {
  // Rate limit - prevent token brute-forcing
  const ip = clientIp(request);
  const rl = rateLimit({ key: `invites:accept:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  try {
    const body = await request.json();
    const { token, name, password } = body || {};

    if (!token || !name || !password) {
      return NextResponse.json(
        { error: 'token, name and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Look up the invite
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: `This invite has already been ${invite.status}` },
        { status: 410, headers: corsHeaders }
      );
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      // Auto-mark as expired
      await supabaseAdmin
        .from('user_invites')
        .update({ status: 'expired' })
        .eq('id', invite.id);
      return NextResponse.json(
        { error: 'This invite has expired' },
        { status: 410, headers: corsHeaders }
      );
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { name, role: invite.role },
    });

    if (authError) {
      // If the email already exists in Supabase Auth, abort — let the user
      // login normally instead.
      return NextResponse.json(
        {
          error: authError.message,
          code: authError.code,
          hint: authError.code === 'email_exists'
            ? 'An account with this email already exists. Try logging in instead.'
            : undefined,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create users table row
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email: invite.email,
      role: invite.role,
      status: 'active',
    };
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();

    if (userErr) {
      // Cleanup orphan auth user
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch (_) {}
      return NextResponse.json(
        { error: 'Failed to create user record', message: userErr.message },
        { status: 500, headers: corsHeaders }
      );
    }

    // Apply site assignments based on the invited role
    const siteIds = invite.site_ids || (invite.site_id ? [invite.site_id] : []);
    if (siteIds.length) {
      try {
        if (invite.role === 'staff') {
          const rows = siteIds.map((site_id) => ({
            id: uuidv4(),
            staff_user_id: userRow.id,
            site_id,
            assigned_by_operator_id: invite.invited_by_user_id || null,
          }));
          await supabaseAdmin.from('staff_site_assignments').insert(rows);
        } else if (invite.role === 'operator') {
          const rows = siteIds.map((site_id) => ({
            id: uuidv4(),
            operator_user_id: userRow.id,
            site_id,
            assigned_by_owner_id: invite.invited_by_user_id || null,
          }));
          await supabaseAdmin.from('operator_site_assignments').insert(rows);
        }
      } catch (e) {
        // Non-fatal — user is created, assignments can be done manually
        console.error('Site assignment from invite failed:', e);
      }
    }

    // Mark invite as accepted
    await supabaseAdmin
      .from('user_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: userRow.id,
      })
      .eq('id', invite.id);

    return NextResponse.json(
      { ok: true, user: userRow, message: 'Account created. You can now log in.' },
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error('Accept invite error:', e);
    return NextResponse.json(
      { error: 'Failed to accept invite', message: e?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
