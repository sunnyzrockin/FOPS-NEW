/**
 * Sites module — owner/operator/staff scoped CRUD for service sites.
 *
 * Phase 2 modular extraction from the catch-all
 * /app/app/api/[[...path]]/route.js. The old code in route.js for the
 * matching paths becomes unreachable because Next.js's file-based router
 * prefers more-specific routes over catch-alls.
 *
 * Endpoints:
 *   GET    /api/sites          — list (role-scoped via JWT)
 *   GET    /api/sites/:id      — single site
 *   POST   /api/sites          — create (owner)
 *   PUT    /api/sites/:id      — update (owner)
 *   DELETE /api/sites/:id      — delete (owner-only + cleans up dependent tables)
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { jsonWithCors } from '@/lib/api/cors';
import { logAuditAsync } from '@/lib/api/audit';
// Bug #1 prod-recurrence fix: import syncQuantityForOwner statically so
// the bundler proves it's in the serverless function bundle. Dynamic
// `await import('@/lib/billing-sync')` on a serverless cold-start can
// race against module resolution or be quietly tree-shaken in some
// build pipelines (which would silently no-op the sync without
// throwing). A static import is cheaper and bullet-proof.
import { syncQuantityForOwner } from '@/lib/billing-sync';

const db = () => supabaseAdmin || supabase;

export async function handleGetSites(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    const admin = db();

    let query = admin.from('sites').select('*');

    if (currentUser.role === 'owner') {
      // Demo bridge (Defect 5): demo owners see the canonical seeded
      // tenant's sites read-only, so "Explore the demo" lands on a
      // populated dashboard instead of an empty one. Write attempts are
      // still rejected by the verifyAuth demo guard.
      if (currentUser.is_demo) {
        const { getDemoSourceOwnerId } = await import('@/lib/demo-source');
        const demoSourceOwnerId = await getDemoSourceOwnerId();
        if (!demoSourceOwnerId) return jsonWithCors([]);
        query = query.eq('owner_id', demoSourceOwnerId);
      } else {
        query = query.eq('owner_id', currentUser.id);
      }
    } else if (currentUser.role === 'operator') {
      const { data: assignments } = await admin
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', currentUser.id);
      if (!assignments?.length) return jsonWithCors([]);
      query = query.in('id', assignments.map((a) => a.site_id));
    } else if (currentUser.role === 'staff') {
      const { data: assignments } = await admin
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', currentUser.id);
      if (!assignments?.length) return jsonWithCors([]);
      query = query.in('id', assignments.map((a) => a.site_id));
    } else if (currentUser.role === 'support') {
      // Support sees nothing here — they have /api/founder/sites instead.
      return jsonWithCors([]);
    } else {
      return jsonWithCors({ error: `Unknown role: ${currentUser.role}` }, { status: 403 });
    }

    const { data, error } = await query;
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[sites] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch sites', message: error?.message }, { status: 500 });
  }
}

export async function handleGetSiteById(request, siteId) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const { data, error } = await db().from('sites').select('*').eq('id', siteId).single();
    if (error) throw error;
    return jsonWithCors(data);
  } catch (error) {
    console.error('[sites] get one error:', error);
    return jsonWithCors({ error: 'Failed to fetch site', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateSite(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const newSite = { id: uuidv4(), ...body, status: 'active', owner_id: body.owner_id || auth.user.id };
    const { data, error } = await db().from('sites').insert([newSite]).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'insert',
      tableName: 'sites', recordId: data.id, siteId: data.id, after: data,
    });

    // Billing v2: bump the Stripe subscription quantity to match the
    // owner's new active site count. AWAITED so the call actually
    // completes before serverless terminates the function context.
    // Failure is logged but doesn't fail the site creation (the next
    // /api/billing/status poll auto-reconciles drift).
    try {
      const syncResult = await syncQuantityForOwner(auth.user.id);
      console.log('[sites] post-create quantity sync:', JSON.stringify(syncResult));
    } catch (e) {
      console.warn('[sites] post-create quantity sync failed:', e?.message, e?.stack);
    }

    return jsonWithCors(data);
  } catch (error) {
    console.error('[sites] create error:', error);
    return jsonWithCors({ error: 'Failed to create site', message: error?.message }, { status: 500 });
  }
}

export async function handleUpdateSite(request, siteId) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return auth.response;
    const updates = await request.json();
    const admin = db();

    let before = null;
    try { const { data } = await admin.from('sites').select('*').eq('id', siteId).single(); before = data; } catch { /* before snapshot is best-effort */ }

    const { data, error } = await admin.from('sites').update(updates).eq('id', siteId).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'update',
      tableName: 'sites', recordId: siteId, siteId, before, after: data,
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[sites] update error:', error);
    return jsonWithCors({ error: 'Failed to update site', message: error?.message }, { status: 500 });
  }
}

/**
 * PATCH /api/sites/:id — operator-allowed, field-whitelisted site updates.
 *
 * Lets operators tweak site-level operational settings (currently just
 * shifts_per_day, but the whitelist is the obvious extension point for
 * other ops settings later) without giving them owner-level write access
 * to the whole row.
 *
 * Tenant isolation: operators can only update sites they're assigned to;
 * owners can update any site they own. Anything else 403.
 */
export async function handlePatchSite(request, siteId) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const me = auth.user;
    if (me.role !== 'owner' && me.role !== 'operator') {
      return jsonWithCors({ error: 'Forbidden — owners and operators only.' }, { status: 403 });
    }

    const admin = db();
    const { data: site, error: getErr } = await admin
      .from('sites').select('*').eq('id', siteId).maybeSingle();
    if (getErr) throw getErr;
    if (!site) return jsonWithCors({ error: 'Site not found' }, { status: 404 });

    // Tenant check
    if (me.role === 'owner' && site.owner_id !== me.id) {
      return jsonWithCors({ error: 'You do not own this site.' }, { status: 403 });
    }
    if (me.role === 'operator') {
      const { data: asn } = await admin.from('operator_site_assignments')
        .select('site_id').eq('operator_user_id', me.id).eq('site_id', siteId).maybeSingle();
      if (!asn) {
        return jsonWithCors({ error: 'You are not assigned to this site.' }, { status: 403 });
      }
    }

    const body = await request.json();

    // ── Field whitelist ──────────────────────────────────────────────
    // Only these keys may be set via PATCH. Anything else is silently
    // dropped (NOT echoed back as an error so the client doesn't have to
    // re-state the whitelist).
    const ALLOWED = new Set([
      'shifts_per_day',
      'wetstock_tolerance_pct',
      'margin_healthy_cpl',
      'margin_amber_cpl',
    ]);
    const updates = {};
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED.has(k)) continue;
      if (k === 'shifts_per_day') {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 3) {
          return jsonWithCors({ error: 'shifts_per_day must be 1, 2 or 3.' }, { status: 400 });
        }
        updates[k] = n;
      } else {
        updates[k] = v;
      }
    }
    if (Object.keys(updates).length === 0) {
      return jsonWithCors({ error: 'No updatable fields in request.' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('sites').update(updates).eq('id', siteId).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: me, action: 'update',
      tableName: 'sites', recordId: siteId, siteId, before: site, after: data,
      metadata: { via: 'PATCH /api/sites/:id', updated_keys: Object.keys(updates) },
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[sites] patch error:', error);
    return jsonWithCors({ error: 'Failed to update site', message: error?.message }, { status: 500 });
  }
}

export async function handleDeleteSite(request, siteId) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return auth.response;
    const me = auth.user;
    const admin = db();

    const { data: site, error: getErr } = await admin
      .from('sites').select('id, owner_id, name').eq('id', siteId).maybeSingle();
    if (getErr) throw getErr;
    if (!site) return jsonWithCors({ error: 'Site not found' }, { status: 404 });
    if (site.owner_id !== me.id) {
      return jsonWithCors({ error: 'You do not own this site.' }, { status: 403 });
    }

    const cleanupTables = [
      'shift_reports', 'dip_readings', 'fuel_price_changes',
      'site_field_configs', 'site_banking_formulas',
      'operator_site_assignments', 'staff_site_assignments', 'site_competitors',
    ];
    for (const t of cleanupTables) {
      const { error: e } = await admin.from(t).delete().eq('site_id', siteId);
      if (e) console.warn(`[sites] cleanup ${t}:`, e.message);
    }

    const { error: delErr } = await admin.from('sites').delete().eq('id', siteId);
    if (delErr) throw delErr;

    logAuditAsync({
      request, actor: me, action: 'delete',
      tableName: 'sites', recordId: siteId, siteId, before: site,
    });

    // Billing v2: bump the Stripe subscription quantity DOWN (prorated
    // credit to next invoice). AWAITED so the call actually completes
    // before serverless terminates the function context.
    try {
      const syncResult = await syncQuantityForOwner(me.id);
      console.log('[sites] post-delete quantity sync:', JSON.stringify(syncResult));
    } catch (e) {
      console.warn('[sites] post-delete quantity sync failed:', e?.message, e?.stack);
    }

    return jsonWithCors({ ok: true, deleted: siteId });
  } catch (error) {
    console.error('[sites] delete error:', error);
    return jsonWithCors({ error: 'Failed to delete site', message: error?.message }, { status: 500 });
  }
}
