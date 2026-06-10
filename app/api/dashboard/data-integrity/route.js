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
import { isPriceOutlier, PRICE_DOLLAR_HEURISTIC_THRESHOLD } from '@/lib/margin';

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

    // ----- P2b cross-checks -------------------------------------------------
    // 1) Fuel price outliers (decision 3): rows in fuel_price_entries where
    //    price < 10 (likely stored as dollars instead of cents).
    // 2) Dip-recorded deliveries with NO matching fuel_deliveries cost row
    //    within ±2 days (decision 7).
    const fuelPriceOutliers = [];
    const orphanDipDeliveries = [];
    try {
      const [{ data: priceRows }, { data: dipRows }, { data: deliveryRows }] = await Promise.all([
        db.from('fuel_price_entries').select('id, site_id, date, fuel_type, price').in('site_id', siteIds),
        db.from('dip_readings').select('id, site_id, reading_time, deliveries_ulp_litres, deliveries_diesel_litres, deliveries_premium_litres, custom_values').in('site_id', siteIds),
        db.from('fuel_deliveries').select('site_id, grade, delivered_at, litres').in('site_id', siteIds).then(
          (r) => r,
          () => ({ data: [], error: null })
        ),
      ]);

      for (const p of priceRows || []) {
        if (isPriceOutlier(p.price)) {
          fuelPriceOutliers.push({
            id: p.id,
            site_id: p.site_id,
            site_name: siteMap.get(p.site_id)?.name || p.site_id,
            date: p.date,
            fuel_type: p.fuel_type,
            stored_price: Number(p.price),
            interpreted_cpl: Number(p.price) * 100,
            reason: `Stored as ${p.price} (looks like $/L). Normalised on read to ${(Number(p.price) * 100).toFixed(2)} cpl. Recommend editing the source row to use cents-per-litre.`,
          });
        }
      }

      // Dip delivery → fuel_deliveries cross-check
      const deliveryIndex = new Map(); // key: site_id|grade → [{delivered_at, litres}]
      for (const fd of deliveryRows || []) {
        const k = `${fd.site_id}|${fd.grade}`;
        const arr = deliveryIndex.get(k) || [];
        arr.push({ delivered_at: fd.delivered_at, litres: Number(fd.litres) });
        deliveryIndex.set(k, arr);
      }
      const GRADE_COLS = [
        { col: 'deliveries_ulp_litres', grade: 'ULP' },
        { col: 'deliveries_diesel_litres', grade: 'Diesel' },
        { col: 'deliveries_premium_litres', grade: 'Premium' },
      ];
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      for (const d of dipRows || []) {
        const dipDate = d.reading_time ? d.reading_time.slice(0, 10) : null;
        if (!dipDate) continue;
        for (const { col, grade } of GRADE_COLS) {
          const litres = Number(d[col]) || 0;
          if (litres <= 0) continue;
          const candidates = deliveryIndex.get(`${d.site_id}|${grade}`) || [];
          const matched = candidates.some((c) => {
            const diff = Math.abs(Date.parse(c.delivered_at) - Date.parse(dipDate));
            return diff <= TWO_DAYS_MS && Math.abs(c.litres - litres) / litres < 0.1; // ±10% litre match
          });
          if (!matched) {
            orphanDipDeliveries.push({
              dip_id: d.id,
              site_id: d.site_id,
              site_name: siteMap.get(d.site_id)?.name || d.site_id,
              dip_date: dipDate,
              grade,
              litres,
              reason: `Dip on ${dipDate} recorded a ${litres} L delivery of ${grade} but no fuel_deliveries cost row was found within ±2 days. Margin will be incomplete \u2014 record a delivery on the Fuel Inventory tab.`,
            });
          }
        }
        // Custom grades from dip_readings.custom_values
        const cv = d.custom_values || {};
        for (const [gradeKey, val] of Object.entries(cv)) {
          const litres = Number(val?.delivery) || 0;
          if (litres <= 0) continue;
          const candidates = deliveryIndex.get(`${d.site_id}|${gradeKey}`) || [];
          const matched = candidates.some((c) => {
            const diff = Math.abs(Date.parse(c.delivered_at) - Date.parse(dipDate));
            return diff <= TWO_DAYS_MS && Math.abs(c.litres - litres) / litres < 0.1;
          });
          if (!matched) {
            orphanDipDeliveries.push({
              dip_id: d.id,
              site_id: d.site_id,
              site_name: siteMap.get(d.site_id)?.name || d.site_id,
              dip_date: dipDate,
              grade: gradeKey,
              litres,
              reason: `Dip on ${dipDate} recorded a ${litres} L delivery of ${gradeKey} but no fuel_deliveries cost row was found within ±2 days.`,
            });
          }
        }
      }
    } catch (e) {
      // Cross-check is best-effort; do not fail the whole request.
      console.warn('[data-integrity] P2b cross-check skipped:', e.message);
    }

    return NextResponse.json(
      {
        summary: {
          total: (reports || []).length,
          flagged,
          reconciles,
          unchanged,
          dollarsAdjusted: Math.round(dollarsAdjusted * 100) / 100,
          fuelPriceOutliers: fuelPriceOutliers.length,
          orphanDipDeliveries: orphanDipDeliveries.length,
        },
        rows,
        fuelPriceOutliers,
        orphanDipDeliveries,
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
