/**
 * Founder / Support handlers — cross-tenant administrative views.
 *
 * Auth model:
 *   • Caller must have role='support' (verified via verifyAuth + role check).
 *   • Service-role client used for reads so we bypass RLS.
 *
 * Endpoints:
 *   GET  /api/founder/audit-log?from=&to=&action=&table=&actor=&limit=&offset=
 *   GET  /api/founder/stats
 *   GET  /api/founder/users
 *   GET  /api/founder/sites
 *   POST /api/founder/setup   (one-time: creates the support account)
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/lib/auth-helpers';
import { jsonWithCors } from '@/lib/api/cors';
import { logAudit } from '@/lib/api/audit';
import { v4 as uuidv4 } from 'uuid';

const db = () => supabaseAdmin || supabase;

async function requireSupport(request) {
  const auth = await verifyAuth(request);
  if (!auth.ok) return { error: auth.response };
  if (auth.user.role !== 'support') {
    return { error: jsonWithCors({ error: 'Support role required', current: auth.user.role }, { status: 403 }) };
  }
  return { user: auth.user };
}

// ---------- Audit log timeline ----------
export async function handleGetAuditLog(request) {
  const guard = await requireSupport(request);
  if (guard.error) return guard.error;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const action = url.searchParams.get('action');
    const table = url.searchParams.get('table');
    const actor = url.searchParams.get('actor');
    const siteId = url.searchParams.get('siteId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    let q = db().from('audit_log').select('*', { count: 'exact' });
    if (from) q = q.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) q = q.lte('created_at', `${to}T23:59:59.999Z`);
    if (action) q = q.eq('action', action);
    if (table) q = q.eq('table_name', table);
    if (actor) q = q.or(`actor_email.ilike.%${actor}%,actor_user_id.eq.${actor}`);
    if (siteId) q = q.eq('site_id', siteId);
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    return jsonWithCors({
      rows: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (e) {
    return jsonWithCors({ error: 'Failed to fetch audit log', message: e?.message }, { status: 500 });
  }
}

// ---------- System stats ----------
export async function handleGetFounderStats(request) {
  const guard = await requireSupport(request);
  if (guard.error) return guard.error;

  try {
    const tables = ['users', 'sites', 'shift_reports', 'dip_readings', 'site_field_configs', 'site_banking_formulas', 'audit_log', 'operator_site_assignments', 'staff_site_assignments'];
    const counts = {};
    for (const t of tables) {
      const { count } = await db().from(t).select('*', { head: true, count: 'exact' });
      counts[t] = count || 0;
    }
    // Recent activity counts (last 24h, last 7d)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [last24, last7d, byActionRes] = await Promise.all([
      db().from('audit_log').select('*', { head: true, count: 'exact' }).gte('created_at', oneDayAgo),
      db().from('audit_log').select('*', { head: true, count: 'exact' }).gte('created_at', sevenDaysAgo),
      db().from('audit_log').select('action').gte('created_at', sevenDaysAgo),
    ]);

    const byAction = {};
    for (const r of byActionRes.data || []) {
      byAction[r.action] = (byAction[r.action] || 0) + 1;
    }

    // Role breakdown
    const { data: usersByRole } = await db().from('users').select('role');
    const roleBreakdown = {};
    for (const u of usersByRole || []) {
      roleBreakdown[u.role] = (roleBreakdown[u.role] || 0) + 1;
    }

    return jsonWithCors({
      counts,
      roleBreakdown,
      auditActivity: {
        last24h: last24.count || 0,
        last7d: last7d.count || 0,
        byActionLast7d: byAction,
      },
    });
  } catch (e) {
    return jsonWithCors({ error: 'Failed to fetch stats', message: e?.message }, { status: 500 });
  }
}

// ---------- Cross-tenant user list ----------
export async function handleGetFounderUsers(request) {
  const guard = await requireSupport(request);
  if (guard.error) return guard.error;

  try {
    const { data, error } = await db()
      .from('users')
      .select('id, email, name, role, status, auth_user_id, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return jsonWithCors({ users: data || [] });
  } catch (e) {
    return jsonWithCors({ error: 'Failed to fetch users', message: e?.message }, { status: 500 });
  }
}

// ---------- Cross-tenant site list ----------
export async function handleGetFounderSites(request) {
  const guard = await requireSupport(request);
  if (guard.error) return guard.error;

  try {
    const { data, error } = await db()
      .from('sites')
      .select('id, name, code, owner_id, address, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return jsonWithCors({ sites: data || [] });
  } catch (e) {
    return jsonWithCors({ error: 'Failed to fetch sites', message: e?.message }, { status: 500 });
  }
}

// ---------- One-time founder setup ----------
// Bootstraps the support/founder account if one doesn't already exist.
// Gated by FOUNDER_SETUP_SECRET env var (set in /app/.env) — not the user's
// Supabase password. The setup secret is rotated post-bootstrap.
export async function handleFounderSetup(request) {
  try {
    const body = await request.json();
    const { secret, email, password, name } = body || {};

    const expected = process.env.FOUNDER_SETUP_SECRET;
    if (!expected) {
      return jsonWithCors({ error: 'Setup disabled — FOUNDER_SETUP_SECRET env var not configured' }, { status: 503 });
    }
    if (secret !== expected) {
      return jsonWithCors({ error: 'Invalid setup secret' }, { status: 403 });
    }
    if (!email || !password) {
      return jsonWithCors({ error: 'email and password are required' }, { status: 400 });
    }

    // Check if a support user already exists
    const { data: existing } = await db().from('users').select('id, email').eq('role', 'support').maybeSingle();
    if (existing) {
      return jsonWithCors({
        error: 'Support account already exists',
        existingEmail: existing.email,
      }, { status: 409 });
    }

    if (!supabaseAdmin) {
      return jsonWithCors({ error: 'Server not configured (missing service role key)' }, { status: 500 });
    }

    // Create the auth user (email_confirm=true so they can log in immediately)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'support', name: name || 'FOPS Support' },
    });
    if (authErr) {
      return jsonWithCors({ error: 'Failed to create auth user', detail: authErr.message }, { status: 500 });
    }

    // Insert the FOPS users row
    const userRow = {
      id: uuidv4(),
      email,
      name: name || 'FOPS Support',
      role: 'support',
      status: 'active',
      auth_user_id: authData.user.id,
      created_at: new Date().toISOString(),
    };
    const { error: insErr } = await db().from('users').insert(userRow);
    if (insErr) {
      // Rollback the auth user
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      return jsonWithCors({ error: 'Failed to create users row', detail: insErr.message }, { status: 500 });
    }

    await logAudit({
      request,
      action: 'support_account_created',
      tableName: 'users',
      recordId: userRow.id,
      after: { email, role: 'support', name: userRow.name },
      actorEmailOverride: email,
      actorRoleOverride: 'support',
      actorUserIdOverride: userRow.id,
      metadata: { bootstrapped_via: 'founder_setup' },
    });

    return jsonWithCors({
      ok: true,
      message: 'Support account created. You can now sign in at /founder.',
      email,
    });
  } catch (e) {
    return jsonWithCors({ error: 'Setup failed', message: e?.message }, { status: 500 });
  }
}
