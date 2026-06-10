/**
 * GET /api/dashboard/data-integrity
 *
 * Owner-only. Lists shift reports that failed P1 reconciliation —
 * i.e. where the components (fuel + shop) don't reconcile against the
 * typed total_sales / total_revenue, or where banking is off by more
 * than the per-site tolerance.
 *
 * Computes reconciliation ON THE FLY for every row in range (Decision 4A:
 * "recompute on read, preserve originals"). Does NOT mutate the DB.
 *
 * Query params:
 *   siteIds   CSV of site ids (required). Server intersects with allowed set.
 *   startDate YYYY-MM-DD (optional)
 *   endDate   YYYY-MM-DD (optional)
 *
 * Response:
 *   {
 *     summary: { total, flagged, reconciles, unchanged, dollarsAdjusted },
 *     rows: [{ id, site_id, site_name, date, shift_type, status,
 *              submitted, canonical, delta, reconciles, reason }]
 *   }
 */
import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { computeTotals, DEFAULT_TOLERANCE_PCT } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const siteIdsRaw = url.searchParams.get('siteIds') || '';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    const requested = siteIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = await getAllowedSiteIds(auth.user);
    const siteIds = requested.length
      ? requested.filter((id) => allowed.includes(id))
      : allowed;

    if (!siteIds.length) {
      return NextResponse.json(
        { summary: { total: 0, flagged: 0, reconciles: 0, unchanged: 0, dollarsAdjusted: 0 }, rows: [] },
        { headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;

    // Fetch tolerance overrides per site
    const { data: sitesRows } = await db
      .from('sites')
      .select('id, name, code, reconcile_tolerance_pct')
      .in('id', siteIds);
    const toleranceMap = new Map();
    const siteMap = new Map();
    for (const s of sitesRows || []) {
      const t = Number(s.reconcile_tolerance_pct);
      toleranceMap.set(s.id, Number.isFinite(t) && t >= 0 ? t : DEFAULT_TOLERANCE_PCT);
      siteMap.set(s.id, s);
    }

    let q = db
      .from('shift_reports')
      .select('id, site_id, date, shift_type, status, total_sales, total_revenue, fuel_sales, shop_sales, total_litres, eftpos, motorpass, cash, accounts, custom_values')
      .in('site_id', siteIds)
      .order('date', { ascending: false });
    if (startDate) q = q.gte('date', startDate);
    if (endDate) q = q.lte('date', endDate);

    const { data: reports, error } = await q;
    if (error) throw error;

    const rows = [];
    let flagged = 0;
    let reconciles = 0;
    let unchanged = 0;
    let dollarsAdjusted = 0;

    for (const r of reports || []) {
      const tol = toleranceMap.get(r.site_id) ?? DEFAULT_TOLERANCE_PCT;
      const c = computeTotals(r, { tolerancePct: tol });
      const site = siteMap.get(r.site_id);

      const sub = c.submitted;
      const delta = {
        total_sales: Math.round((c.total_sales - sub.total_sales) * 100) / 100,
        total_revenue: Math.round((c.total_revenue - sub.total_revenue) * 100) / 100,
        fuel_sales: Math.round((c.fuel_sales - sub.fuel_sales) * 100) / 100,
        total_litres: Math.round((c.total_litres - sub.total_litres) * 100) / 100,
      };
      const anyChange =
        Math.abs(delta.total_sales) > 0.01 ||
        Math.abs(delta.total_revenue) > 0.01 ||
        Math.abs(delta.fuel_sales) > 0.01 ||
        Math.abs(delta.total_litres) > 0.01;

      if (c.reconciles) reconciles += 1;
      else flagged += 1;
      if (!anyChange) unchanged += 1;
      dollarsAdjusted += Math.abs(delta.total_sales);

      // Only return rows that have something interesting to show.
      if (!c.reconciles || anyChange) {
        rows.push({
          id: r.id,
          site_id: r.site_id,
          site_name: site?.name || r.site_id,
          site_code: site?.code || null,
          date: r.date,
          shift_type: r.shift_type,
          status: r.status,
          submitted: sub,
          canonical: {
            fuel_sales: c.fuel_sales,
            shop_sales: c.shop_sales,
            total_sales: c.total_sales,
            total_revenue: c.total_revenue,
            total_litres: c.total_litres,
            banking: c.banking,
          },
          delta,
          reconciles: c.reconciles,
          reason: c.reconciliation_reason,
          tolerance_pct: tol,
        });
      }
    }

    return NextResponse.json(
      {
        summary: {
          total: (reports || []).length,
          flagged,
          reconciles,
          unchanged,
          dollarsAdjusted: Math.round(dollarsAdjusted * 100) / 100,
        },
        rows,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[data-integrity] failed:', err);
    return NextResponse.json(
      { error: 'Failed to compute data integrity', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
