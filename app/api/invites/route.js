import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { sendInviteEmail } from '@/lib/mailer';
import { verifyAuth, rateLimit, clientIp } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Strip the `token` field from invite rows before returning them to a list
// caller — only the inviter who just created it should ever see the raw
// token (we return it on POST). Listing should never leak active tokens.
function sanitizeInvite(row) {
  if (!row) return row;
  const { token: _omit, ...safe } = row;
  void _omit;
  return safe;
}

// ---------------------- GET /api/invites ----------------------
//   ?status=pending       filter by status
//   ?invitedBy=<userId>   (support only) filter by inviter
//
// Security (Sprint Part 2):
//   - Bearer required.
//   - Owner/Operator: invited_by_user_id is FORCED to JWT user.id;
//     ?invitedBy is ignored.
//   - Staff: 403.
//   - Support: ?invitedBy is honoured; no filter = all invites.
//   - `token` is stripped from every row.
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const currentUser = auth.user;
    if (currentUser.role === 'staff') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);
    const invitedByParam = url.searchParams.get('invitedBy');
    const status = url.searchParams.get('status');

    let q = (supabaseAdmin || supabase)
      .from('user_invites')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentUser.role === 'support') {
      if (invitedByParam) q = q.eq('invited_by_user_id', invitedByParam);
    } else {
      // owner / operator: always scoped to their own invites
      q = q.eq('invited_by_user_id', currentUser.id);
    }
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json((data || []).map(sanitizeInvite), { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch invites', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ---------------------- POST /api/invites ----------------------
// Body: { email, role, site_ids?: string[] }
//
// Security (Sprint Part 2):
//   - Bearer required (no allowAnon).
//   - Role gates:
//       owner    → may invite operator | staff
//       operator → may invite staff
//       support  → may invite anyone
//       staff    → 403
//   - For every requested site_id, caller MUST have site access via
//     getAllowedSiteIds — otherwise 403 with foreign_site_ids: [...].
//   - invited_by_user_id is FORCED to JWT user.id (no body spoofing).
export async function POST(request) {
  // Light rate-limit so spam invites can't be fired off in a loop.
  const ip = clientIp(request);
  const rl = rateLimit({ key: `invites:create:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const inviterUser = auth.user;

    const body = await request.json();
    const { email, role, site_ids = [] } = body || {};

    if (!email || !role) {
      return NextResponse.json(
        { error: 'email and role are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Role-based permission
    const allowedTransitions = {
      owner: ['operator', 'staff'],
      operator: ['staff'],
      support: ['owner', 'operator', 'staff'],
    };
    const allowed = allowedTransitions[inviterUser.role] || [];
    if (!allowed.includes(role)) {
      return NextResponse.json(
        {
          error: `Your role (${inviterUser.role}) cannot invite users with role "${role}"`,
          allowed,
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Site-ownership intersection: every requested site_id must be in
    // caller's allowed sites (support bypasses this check).
    const cleanSiteIds = Array.isArray(site_ids)
      ? site_ids.filter((id) => typeof id === 'string' && id)
      : [];
    if (inviterUser.role !== 'support' && cleanSiteIds.length) {
      const callerAllowed = await getAllowedSiteIds(inviterUser);
      const allowedSet = new Set(callerAllowed);
      const foreign = cleanSiteIds.filter((id) => !allowedSet.has(id));
      if (foreign.length) {
        return NextResponse.json(
          {
            error: 'You do not have access to one or more requested sites',
            foreign_site_ids: foreign,
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // Generate token (UUID)
    const token = uuidv4();

    const newInvite = {
      id: uuidv4(),
      email: String(email).toLowerCase().trim(),
      role,
      // FORCE invited_by_user_id to caller's JWT — never trust body
      invited_by_user_id: inviterUser.id,
      site_id: cleanSiteIds[0] || null, // primary site (legacy single-site column)
      site_ids: cleanSiteIds.length ? cleanSiteIds : null,
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
