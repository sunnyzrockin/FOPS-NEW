/**
 * lib/api/handlers/tank-reconciliation.js — Wet-stock Tier 1 read API.
 *
 * GET  /api/tank-reconciliation?siteId=&date=YYYY-MM-DD
 *   Returns the per-tank reconciliation rows for the given site on the
 *   given date PLUS the tank metadata (grade, capacity, tolerance_pct).
 *   Tanks that have no row yet are surfaced as `no_data`.
 *
 * GET  /api/tank-reconciliation/red-today?siteIds=
 *   Returns { count } — number of tanks with status='red' for TODAY.
 *   Used by the health-strip variance-alerts chip.
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { jsonWithCors } from '@/lib/api/cors';
import { summariseSiteDay } from '@/lib/wetstock-tier1';

const db = () => supabaseAdmin || supabase;

async function resolveAccessibleSiteIds(currentUser) {
  const admin = db();
  if (currentUser.role === 'owner') {
    // Demo bridge (Defect 5): demo owners read the canonical seeded
    // tenant's tank reconciliation data.
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
  if (currentUser.role === 'staff') {
    const { data } = await admin
      .from('staff_site_assignments')
      .select('site_id')
      .eq('staff_user_id', currentUser.id);
    return (data || []).map((r) => r.site_id);
  }
  return [];
}

export async function handleGetTankReconciliation(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    // Tier 1 dashboard is operator/owner only (per spec).
    if (currentUser.role !== 'owner' && currentUser.role !== 'operator') {
      return jsonWithCors({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    if (!siteId) return jsonWithCors({ error: 'siteId is required' }, { status: 400 });

    const accessible = await resolveAccessibleSiteIds(currentUser);
    if (!accessible.includes(siteId)) return jsonWithCors({ error: 'Site not accessible' }, { status: 403 });

    const admin = db();
    const [{ data: tanks }, { data: rows }] = await Promise.all([
      admin.from('tanks').select('*').eq('site_id', siteId).eq('active', true).order('grade'),
      admin.from('tank_reconciliation').select('*').eq('site_id', siteId).eq('date', date),
    ]);

    const rowByTank = new Map((rows || []).map((r) => [r.tank_id, r]));
    const merged = (tanks || []).map((t) => {
      const r = rowByTank.get(t.id);
      if (r) {
        return {
          ...r,
          tank: { id: t.id, grade: t.grade, capacity_litres: Number(t.capacity_litres), tolerance_pct: Number(t.tolerance_pct) },
        };
      }
      // No reconciliation row yet — surface as no_data.
      return {
        tank_id: t.id,
        site_id: t.site_id,
        date,
        opening_litres: 0,
        delivery_litres: 0,
        sales_litres: 0,
        actual_closing: null,
        expected_closing: 0,
        variance_litres: null,
        variance_pct: null,
        status: 'no_data',
        chain_broken: false,
        notes: null,
        tank: { id: t.id, grade: t.grade, capacity_litres: Number(t.capacity_litres), tolerance_pct: Number(t.tolerance_pct) },
      };
    });

    return jsonWithCors({
      site_id: siteId,
      date,
      rows: merged,
      summary: summariseSiteDay(merged),
    });
  } catch (e) {
    console.error('[tank-reconciliation] GET', e);
    return jsonWithCors({ error: 'Failed to load reconciliation', message: e?.message }, { status: 500 });
  }
}

export async function handleGetRedTanksToday(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('siteIds') || '';
    const siteIds = raw.split(',').map((s) => s.trim()).filter(Boolean);

    const accessible = await resolveAccessibleSiteIds(currentUser);
    const scope = siteIds.length > 0
      ? siteIds.filter((s) => accessible.includes(s))
      : accessible;
    if (scope.length === 0) return jsonWithCors({ count: 0 });

    const today = new Date().toISOString().slice(0, 10);
    const { count, error } = await db()
      .from('tank_reconciliation')
      .select('id', { count: 'exact', head: true })
      .in('site_id', scope)
      .eq('date', today)
      .eq('status', 'red');
    if (error) throw error;
    return jsonWithCors({ count: count || 0, date: today });
  } catch (e) {
    console.error('[tank-reconciliation] red-today', e);
    return jsonWithCors({ count: 0, error: e?.message });
  }
}
