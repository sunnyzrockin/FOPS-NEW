/**
 * Site Field Configs module — dynamic per-site sales/dip field definitions.
 *
 * Phase 2 modular extraction.
 *
 * Endpoints:
 *   GET    /api/field-configs?siteId=&category=  — list
 *   POST   /api/field-configs                     — create
 *   PUT    /api/field-configs/:id                 — update
 *   DELETE /api/field-configs/:id                 — delete (rejects if used by active formula)
 *   POST   /api/field-configs/bulk                — bulk upsert
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { jsonWithCors } from '@/lib/api/cors';
import { logAuditAsync } from '@/lib/api/audit';

const db = () => supabaseAdmin || supabase;

// -------------------------------------------------------------------------
// Security hardening (Fix 4): writes are owner|operator only. Reads remain
// open to all roles because Staff load /api/field-configs to render their
// shift-report form. Every operation must reference a site the caller
// owns/operates/works at.
// -------------------------------------------------------------------------
async function assertSiteAccess(user, siteId) {
  const allowed = await getAllowedSiteIds(user);
  if (!allowed.includes(siteId)) {
    return jsonWithCors(
      { error: 'You are not authorised to access this site.' },
      { status: 403 }
    );
  }
  return null;
}

export async function handleGetFieldConfigs(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId') || url.searchParams.get('site_id');
    const category = url.searchParams.get('category');
    if (!siteId) return jsonWithCors({ error: 'siteId is required' }, { status: 400 });

    const denied = await assertSiteAccess(auth.user, siteId);
    if (denied) return denied;

    let q = db().from('site_field_configs').select('*').eq('site_id', siteId).order('display_order', { ascending: true });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[field-configs] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch field configs', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateFieldConfig(request) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    if (!body?.site_id) return jsonWithCors({ error: 'site_id is required' }, { status: 400 });
    const denied = await assertSiteAccess(auth.user, body.site_id);
    if (denied) return denied;
    const newConfig = { id: uuidv4(), ...body, created_by_user_id: auth.user.id };
    const { data, error } = await db().from('site_field_configs').insert([newConfig]).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'insert',
      tableName: 'site_field_configs', recordId: data.id, siteId: data.site_id, after: data,
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[field-configs] create error:', error);
    return jsonWithCors({
      error: 'Failed to create field config', message: error?.message,
      code: error?.code, details: error?.details, hint: error?.hint,
    }, { status: 500 });
  }
}

export async function handleUpdateFieldConfig(request, configId) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const updates = await request.json();
    const admin = db();

    let before = null;
    try { const { data } = await admin.from('site_field_configs').select('*').eq('id', configId).single(); before = data; } catch (_) { /* not found surfaces below */ }
    if (!before) return jsonWithCors({ error: 'Field config not found' }, { status: 404 });
    const denyOld = await assertSiteAccess(auth.user, before.site_id);
    if (denyOld) return denyOld;
    if (updates?.site_id && updates.site_id !== before.site_id) {
      const denyNew = await assertSiteAccess(auth.user, updates.site_id);
      if (denyNew) return denyNew;
    }

    const { data, error } = await admin.from('site_field_configs').update(updates).eq('id', configId).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'update',
      tableName: 'site_field_configs', recordId: configId, siteId: data.site_id, before, after: data,
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[field-configs] update error:', error);
    return jsonWithCors({ error: 'Failed to update field config', message: error?.message }, { status: 500 });
  }
}

export async function handleDeleteFieldConfig(request, configId) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const admin = db();

    const { data: field, error: getErr } = await admin
      .from('site_field_configs').select('id, site_id, key, label').eq('id', configId).maybeSingle();
    if (getErr) throw getErr;
    if (!field) return jsonWithCors({ error: 'Field not found' }, { status: 404 });

    const denied = await assertSiteAccess(auth.user, field.site_id);
    if (denied) return denied;

    // Reject if referenced by an active banking formula.
    const { data: formulas, error: fErr } = await admin
      .from('site_banking_formulas').select('id, name, formula_json, is_active').eq('site_id', field.site_id);
    if (fErr) throw fErr;

    const referencingFormulas = [];
    for (const f of formulas || []) {
      if (f.is_active === false) continue;
      try {
        const ops = JSON.parse(f.formula_json || '{}').operations || [];
        if (ops.some((op) => op.type === 'field' && op.value === field.key)) {
          referencingFormulas.push(f.name);
        }
      } catch { /* skip malformed */ }
    }
    if (referencingFormulas.length) {
      return jsonWithCors({
        error: 'Field is in use by an active banking formula',
        message: `"${field.label}" cannot be deleted because it is used in: ${referencingFormulas.join(', ')}.`,
        referenced_by: referencingFormulas,
      }, { status: 409 });
    }

    const { error } = await admin.from('site_field_configs').delete().eq('id', configId);
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'delete',
      tableName: 'site_field_configs', recordId: configId, siteId: field.site_id, before: field,
    });

    return jsonWithCors({ message: 'Field config deleted' });
  } catch (error) {
    console.error('[field-configs] delete error:', error);
    return jsonWithCors({ error: 'Failed to delete field config', message: error?.message }, { status: 500 });
  }
}

export async function handleBulkUpdateFieldConfigs(request) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const { configs } = await request.json();

    // Gate: every site_id touched by the batch must be one the caller can
    // access. We collect the unique set and check against allowed sites
    // ONCE rather than per-row for efficiency.
    const touchedSiteIds = Array.from(
      new Set((configs || []).map((c) => c?.site_id).filter(Boolean))
    );
    if (touchedSiteIds.length === 0) {
      return jsonWithCors({ error: 'Every config must include a site_id' }, { status: 400 });
    }
    const allowedSet = new Set(await getAllowedSiteIds(auth.user));
    const foreign = touchedSiteIds.filter((id) => !allowedSet.has(id));
    if (foreign.length) {
      return jsonWithCors(
        { error: 'You are not authorised to write field configs for the requested sites.', foreign_site_ids: foreign },
        { status: 403 }
      );
    }

    // Ensure each config has id and created_by_user_id
    const enrichedConfigs = configs.map(c => ({
      id: c.id || uuidv4(),
      created_by_user_id: c.created_by_user_id || auth.user.id,
      ...c,
    }));
    const { data, error } = await db().from('site_field_configs').upsert(enrichedConfigs).select();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'bulk_upsert',
      tableName: 'site_field_configs',
      metadata: { count: data?.length || 0 },
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[field-configs] bulk error:', error);
    return jsonWithCors({ error: 'Failed to bulk update configs', message: error?.message }, { status: 500 });
  }
}
