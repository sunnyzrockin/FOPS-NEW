/**
 * Site Banking Formulas module — named, ordered formulas evaluated against
 * shift data to produce derived totals (Net Sales, Cash Reconciliation, ...)
 *
 * Phase 2 modular extraction.
 *
 * Endpoints:
 *   GET    /api/banking-formulas?siteId=  — list active formulas
 *   POST   /api/banking-formulas          — create
 *   PUT    /api/banking-formulas/:id      — update
 *   DELETE /api/banking-formulas/:id      — delete
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { jsonWithCors } from '@/lib/api/cors';
import { logAuditAsync } from '@/lib/api/audit';

const db = () => supabaseAdmin || supabase;

// -------------------------------------------------------------------------
// Security hardening (Fix 4): writes are owner|operator only; reads keep
// the existing "any authenticated user" surface (staff currently rely on
// /api/banking-formulas to render their shift form totals \u2014 a deliberate
// trade-off; tighten via visible_to_staff in a follow-up). All operations
// must reference a site the caller owns/operates/works at.
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

export async function handleGetBankingFormulas(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId') || url.searchParams.get('site_id');
    if (!siteId) return jsonWithCors({ error: 'siteId is required' }, { status: 400 });

    const denied = await assertSiteAccess(auth.user, siteId);
    if (denied) return denied;

    const { data, error } = await db()
      .from('site_banking_formulas')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_active', true);
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[banking-formulas] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch banking formulas', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateBankingFormula(request) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const body = await request.json();
    if (!body?.site_id) return jsonWithCors({ error: 'site_id is required' }, { status: 400 });
    const denied = await assertSiteAccess(auth.user, body.site_id);
    if (denied) return denied;

    const newFormula = {
      id: uuidv4(),
      ...body,
      is_active: true,
      visible_to_staff: body.visible_to_staff || false,
      visible_in_operator_daily_summary: body.visible_in_operator_daily_summary !== false,
      created_by_user_id: auth.user.id,
    };
    const { data, error } = await db().from('site_banking_formulas').insert([newFormula]).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'insert',
      tableName: 'site_banking_formulas', recordId: data.id, siteId: data.site_id, after: data,
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[banking-formulas] create error:', error);
    return jsonWithCors({ error: 'Failed to create banking formula', message: error?.message }, { status: 500 });
  }
}

export async function handleUpdateBankingFormula(request, formulaId) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const updates = await request.json();
    const admin = db();

    let before = null;
    try { const { data } = await admin.from('site_banking_formulas').select('*').eq('id', formulaId).single(); before = data; } catch (_) { /* not found surfaces below */ }

    // Site-ownership guard: caller must own/operate the formula's site.
    // Also reject any attempt to MOVE the formula to a foreign site via the
    // request body (writes to site_id are only allowed if both old and new
    // belong to the caller).
    if (!before) return jsonWithCors({ error: 'Formula not found' }, { status: 404 });
    const denyOld = await assertSiteAccess(auth.user, before.site_id);
    if (denyOld) return denyOld;
    if (updates?.site_id && updates.site_id !== before.site_id) {
      const denyNew = await assertSiteAccess(auth.user, updates.site_id);
      if (denyNew) return denyNew;
    }

    const { data, error } = await admin.from('site_banking_formulas').update(updates).eq('id', formulaId).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'update',
      tableName: 'site_banking_formulas', recordId: formulaId, siteId: data.site_id, before, after: data,
    });

    return jsonWithCors(data);
  } catch (error) {
    console.error('[banking-formulas] update error:', error);
    return jsonWithCors({ error: 'Failed to update banking formula', message: error?.message }, { status: 500 });
  }
}

export async function handleDeleteBankingFormula(request, formulaId) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const admin = db();

    let before = null;
    try { const { data } = await admin.from('site_banking_formulas').select('*').eq('id', formulaId).single(); before = data; } catch (_) { /* not found surfaces below */ }

    if (!before) return jsonWithCors({ error: 'Formula not found' }, { status: 404 });
    const denied = await assertSiteAccess(auth.user, before.site_id);
    if (denied) return denied;

    const { error } = await admin.from('site_banking_formulas').delete().eq('id', formulaId);
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'delete',
      tableName: 'site_banking_formulas', recordId: formulaId, siteId: before?.site_id, before,
    });

    return jsonWithCors({ message: 'Banking formula deleted' });
  } catch (error) {
    console.error('[banking-formulas] delete error:', error);
    return jsonWithCors({ error: 'Failed to delete banking formula', message: error?.message }, { status: 500 });
  }
}
