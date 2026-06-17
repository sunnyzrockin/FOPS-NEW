/**
 * lib/api/handlers/tanks.js — Wet-stock Tier 1 tank registry.
 *
 * Operator/owner-managed CRUD over the `tanks` table. Permissions follow
 * the same pattern as sites/field-configs: owner sees their own sites'
 * tanks, operators see assigned sites' tanks, staff is denied.
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { jsonWithCors } from '@/lib/api/cors';

const db = () => supabaseAdmin || supabase;

async function resolveAccessibleSiteIds(currentUser) {
  const admin = db();
  if (currentUser.role === 'owner') {
    // Demo bridge (Defect 5): demo owners read the canonical seeded
    // tenant's sites so the dashboard isn't empty.
    const ownerId = currentUser.is_demo
      ? (process.env.BILLING_DEMO_SOURCE_OWNER_ID || 'owner-001')
      : currentUser.id;
    const { data } = await admin.from('sites').select('id').eq('owner_id', ownerId);
    return (data || []).map((s) => s.id);
  }
  if (currentUser.role === 'operator') {
    const { data } = await admin
      .from('operator_site_assignments')
      .select('site_id')
      .eq('operator_user_id', currentUser.id);
    return (data || []).map((r) => r.site_id);
  }
  return [];
}

function roleAllowsWrite(role) {
  return role === 'owner' || role === 'operator';
}

export async function handleGetTanks(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    // Permission gate: tank registry is an operator/owner surface. Mirror
    // the 403 returned by /api/tank-reconciliation so both wet-stock
    // endpoints behave identically for staff (instead of silently
    // returning an empty array).
    if (currentUser.role !== 'owner' && currentUser.role !== 'operator') {
      return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const siteIdFilter = searchParams.get('siteId');

    const accessible = await resolveAccessibleSiteIds(currentUser);
    if (accessible.length === 0) return jsonWithCors([]);

    let q = db().from('tanks').select('*').in('site_id', accessible).eq('active', true);
    if (siteIdFilter) {
      if (!accessible.includes(siteIdFilter)) return jsonWithCors({ error: 'Site not accessible' }, { status: 403 });
      q = q.eq('site_id', siteIdFilter);
    }
    const { data, error } = await q.order('grade', { ascending: true });
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (e) {
    console.error('[tanks] GET', e);
    return jsonWithCors({ error: 'Failed to fetch tanks', message: e?.message }, { status: 500 });
  }
}

export async function handleCreateTank(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    if (!roleAllowsWrite(currentUser.role)) {
      return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { site_id, grade, capacity_litres, tolerance_pct = 0.5 } = body || {};
    if (!site_id || !grade || !capacity_litres) {
      return jsonWithCors({ error: 'site_id, grade and capacity_litres are required' }, { status: 400 });
    }
    const accessible = await resolveAccessibleSiteIds(currentUser);
    if (!accessible.includes(site_id)) return jsonWithCors({ error: 'Site not accessible' }, { status: 403 });

    const { data, error } = await db().from('tanks').insert({
      site_id,
      grade: String(grade).trim(),
      capacity_litres: Number(capacity_litres),
      tolerance_pct: Number(tolerance_pct),
      active: true,
    }).select('*').single();
    if (error) throw error;
    return jsonWithCors(data, { status: 201 });
  } catch (e) {
    console.error('[tanks] POST', e);
    return jsonWithCors({ error: 'Failed to create tank', message: e?.message }, { status: 500 });
  }
}

export async function handleUpdateTank(request, id) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    if (!roleAllowsWrite(currentUser.role)) {
      return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    }
    const accessible = await resolveAccessibleSiteIds(currentUser);
    const { data: existing, error: fErr } = await db().from('tanks').select('*').eq('id', id).single();
    if (fErr || !existing) return jsonWithCors({ error: 'Tank not found' }, { status: 404 });
    if (!accessible.includes(existing.site_id)) return jsonWithCors({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const patch = {};
    if (body.grade !== undefined) patch.grade = String(body.grade).trim();
    if (body.capacity_litres !== undefined) patch.capacity_litres = Number(body.capacity_litres);
    if (body.tolerance_pct !== undefined) patch.tolerance_pct = Number(body.tolerance_pct);
    if (body.active !== undefined) patch.active = !!body.active;

    const { data, error } = await db().from('tanks').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return jsonWithCors(data);
  } catch (e) {
    console.error('[tanks] PUT', e);
    return jsonWithCors({ error: 'Failed to update tank', message: e?.message }, { status: 500 });
  }
}

export async function handleDeleteTank(request, id) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    if (!roleAllowsWrite(currentUser.role)) {
      return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    }
    const accessible = await resolveAccessibleSiteIds(currentUser);
    const { data: existing } = await db().from('tanks').select('site_id').eq('id', id).single();
    if (!existing) return jsonWithCors({ error: 'Tank not found' }, { status: 404 });
    if (!accessible.includes(existing.site_id)) return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    // Soft-delete (set active=false) — keeps reconciliation history intact.
    const { error } = await db().from('tanks').update({ active: false }).eq('id', id);
    if (error) throw error;
    return jsonWithCors({ ok: true });
  } catch (e) {
    console.error('[tanks] DELETE', e);
    return jsonWithCors({ error: 'Failed to delete tank', message: e?.message }, { status: 500 });
  }
}
