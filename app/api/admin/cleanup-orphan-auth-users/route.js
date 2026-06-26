import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';

// Force Node.js runtime — Supabase admin client requires Node APIs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /api/admin/cleanup-orphan-auth-users
 *
 * Finds every row in `auth.users` (Supabase Auth) that has NO matching
 * row in `public.users.auth_user_id`. These are leftover Supabase Auth
 * identities from failed signups / deletions that left the auth row
 * behind. They can't log in (no FOPS user row) but they consume an
 * auth seat and clutter the dashboard.
 *
 * SAFETY
 * ------
 *  - **Support / founder only.** Sends back 401 without a valid Bearer
 *    JWT, or 403 for any non-support role. The previous gate was
 *    `role === 'owner'` which allowed ANY tenant owner to trigger a
 *    platform-wide cleanup (B3 of EMERGENT_auth_hardening.md). Now
 *    strictly `role === 'support'` to match the founder-tier endpoints.
 *  - **Dry-run by default.** Lists the orphans and what would happen.
 *  - To actually delete, pass `?confirm=true` AND a JSON body
 *    `{ acknowledge: 'I understand this is permanent' }` on a POST.
 *
 * USAGE
 * -----
 *   GET  /api/admin/cleanup-orphan-auth-users          → dry-run report
 *   POST /api/admin/cleanup-orphan-auth-users?confirm=true
 *        body: { acknowledge: 'I understand this is permanent' }
 *        → actually deletes the orphans (returns per-id result)
 *
 * Whitelist: certain auth emails (e.g. owner/operator/staff demos) are
 * NEVER deleted, even if they somehow lose their public.users row.
 */

const NEVER_DELETE_EMAILS = new Set([
  'owner@fopsapp.com',
  'operator@fopsapp.com',
  'staff@fopsapp.com',
]);

async function _requireSupport(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Missing Bearer token', status: 401 };

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid token', status: 401 };

  if (!supabaseAdmin) return { error: 'Admin client unavailable', status: 500 };
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, role, email')
    .eq('auth_user_id', data.user.id)
    .single();

  if (!user) return { error: 'No FOPS user mapped to this token', status: 403 };
  // B3: previously `role === 'owner'` which allowed any tenant owner to
  // run a platform-wide cleanup. Now strictly `support` — same gate as
  // /api/founder/* endpoints.
  if (user.role !== 'support') {
    return { error: 'Support role required', status: 403 };
  }
  return { user };
}

/** Walk auth.users (paginated) and return all rows. */
async function _listAllAuthUsers() {
  const all = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    all.push(...users);
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // hard safety stop
  }
  return all;
}

async function _findOrphans() {
  const [authUsers, fopsResult] = await Promise.all([
    _listAllAuthUsers(),
    supabaseAdmin.from('users').select('auth_user_id, email'),
  ]);

  if (fopsResult.error) throw fopsResult.error;
  const mappedAuthIds = new Set(
    (fopsResult.data || [])
      .map((u) => u.auth_user_id)
      .filter(Boolean)
  );

  const orphans = [];
  for (const au of authUsers) {
    if (mappedAuthIds.has(au.id)) continue;
    if (NEVER_DELETE_EMAILS.has((au.email || '').toLowerCase())) continue;
    orphans.push({
      id: au.id,
      email: au.email,
      created_at: au.created_at,
      last_sign_in_at: au.last_sign_in_at,
      provider: au.app_metadata?.provider || null,
    });
  }

  return {
    authUserCount: authUsers.length,
    fopsUserCount: (fopsResult.data || []).length,
    mappedCount: mappedAuthIds.size,
    orphanCount: orphans.length,
    whitelistedEmails: Array.from(NEVER_DELETE_EMAILS),
    orphans,
  };
}

// ── GET: dry-run only ───────────────────────────────────────────────────
export async function GET(request) {
  const status = supabaseStatus();
  const auth = await _requireSupport(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error, supabaseStatus: status }, { status: auth.status });
  }

  try {
    const report = await _findOrphans();
    return NextResponse.json({
      mode: 'dry_run',
      hint:
        'To actually delete the orphans listed below, POST to this endpoint with ?confirm=true and body {"acknowledge":"I understand this is permanent"}.',
      ...report,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'Scan failed', message: e?.message, supabaseStatus: status },
      { status: 500 }
    );
  }
}

// ── POST: actually delete (gated) ───────────────────────────────────────
export async function POST(request) {
  const url = new URL(request.url);
  const confirm = url.searchParams.get('confirm') === 'true';
  const auth = await _requireSupport(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body = {};
  try { body = await request.json(); } catch (_) { /* body is optional — proceed with {} */ }
  const ack = body?.acknowledge === 'I understand this is permanent';

  if (!confirm || !ack) {
    return NextResponse.json(
      {
        error: 'Refusing to delete without confirmation.',
        required: {
          query: '?confirm=true',
          body: { acknowledge: 'I understand this is permanent' },
        },
      },
      { status: 400 }
    );
  }

  try {
    const scan = await _findOrphans();
    const results = [];
    for (const o of scan.orphans) {
      try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(o.id);
        results.push({ id: o.id, email: o.email, deleted: !error, error: error?.message || null });
      } catch (e) {
        results.push({ id: o.id, email: o.email, deleted: false, error: e?.message || 'unknown' });
      }
    }
    const deletedCount = results.filter((r) => r.deleted).length;
    return NextResponse.json({
      mode: 'live_delete',
      scanned: scan.authUserCount,
      orphansFound: scan.orphanCount,
      deletedCount,
      failedCount: results.length - deletedCount,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Cleanup failed', message: e?.message }, { status: 500 });
  }
}
