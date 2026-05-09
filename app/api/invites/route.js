import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { sendInviteEmail } from '@/lib/mailer';
import { verifyAuth, rateLimit, clientIp } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ---------------------- GET /api/invites ----------------------
//   ?invitedBy=<userId>   list invites a user has created
//   ?status=pending       filter by status
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const invitedBy = url.searchParams.get('invitedBy');
    const status = url.searchParams.get('status');

    let q = (supabaseAdmin || supabase)
      .from('user_invites')
      .select('*')
      .order('created_at', { ascending: false });
    if (invitedBy) q = q.eq('invited_by_user_id', invitedBy);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch invites', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------------------- POST /api/invites ----------------------
// Body:
//   { email, role, site_ids?: string[], invited_by_user_id }
//   When called by an authenticated user, the JWT is preferred over the
//   invited_by_user_id field.
export async function POST(request) {
  // Light rate-limit so spam invites can't be fired off in a loop.
  const ip = clientIp(request);
  const rl = rateLimit({ key: `invites:create:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  try {
    const body = await request.json();
    const { email, role, site_ids = [] } = body || {};
    let { invited_by_user_id } = body || {};

    if (!email || !role) {
      return NextResponse.json(
        { error: 'email and role are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify caller (optional during migration)
    let inviterUser = null;
    const auth = await verifyAuth(request, { allowAnon: true });
    if (auth.user) {
      inviterUser = auth.user;
      invited_by_user_id = auth.user.id;

      // Role-based permission
      const allowedTransitions = {
        owner: ['operator', 'staff'],
        operator: ['staff'],
      };
      const allowed = allowedTransitions[auth.user.role] || [];
      if (!allowed.includes(role)) {
        return NextResponse.json(
          {
            error: `Your role (${auth.user.role}) cannot invite users with role "${role}"`,
            allowed,
          },
          { status: 403, headers: corsHeaders }
        );
      }
    } else if (invited_by_user_id) {
      // Legacy: look up by id from body
      const { data: inviter } = await (supabaseAdmin || supabase)
        .from('users')
        .select('id, name, email, role')
        .eq('id', invited_by_user_id)
        .single();
      inviterUser = inviter;
    }

    // Generate token (UUID)
    const token = uuidv4();

    const newInvite = {
      id: uuidv4(),
      email: String(email).toLowerCase().trim(),
      role,
      invited_by_user_id: invited_by_user_id || null,
      site_id: site_ids[0] || null, // primary site (legacy single-site column)
      site_ids: site_ids.length ? site_ids : null,
      token,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data: invite, error } = await (supabaseAdmin || supabase)
      .from('user_invites')
      .insert([newInvite])
      .select()
      .single();

    if (error) {
      console.error('Insert invite error:', error);
      return NextResponse.json(
        { error: 'Failed to create invite', message: error.message, code: error.code },
        { status: 500, headers: corsHeaders }
      );
    }

    // Send invite email (gracefully no-ops if RESEND_API_KEY isn't set)
    let mailResult = { ok: false, mocked: true };
    try {
      // Lookup primary site name for the email body, if present
      let siteName = null;
      if (newInvite.site_id) {
        const { data: site } = await (supabaseAdmin || supabase)
          .from('sites')
          .select('name')
          .eq('id', newInvite.site_id)
          .single();
        siteName = site?.name || null;
      }

      mailResult = await sendInviteEmail({
        to: newInvite.email,
        inviterName: inviterUser?.name || 'A FOPS admin',
        role,
        token,
        siteName,
      });
    } catch (e) {
      console.error('Mail send error:', e);
      mailResult = { ok: false, error: e.message };
    }

    return NextResponse.json(
      {
        invite,
        email_sent: mailResult.ok,
        email_mocked: !!mailResult.mocked,
        accept_url: mailResult.acceptUrl,
        warning: !mailResult.ok && !mailResult.mocked
          ? 'Invite created but email failed to send'
          : undefined,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Create invite error:', error);
    return NextResponse.json(
      { error: 'Failed to create invite', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
