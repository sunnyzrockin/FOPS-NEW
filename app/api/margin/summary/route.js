/**
 * GET /api/margin/summary?siteIds=&startDate=&endDate=
 *
 * Per (site, grade), returns:
 *   { cost_cpl, sell_cpl, margin_cpl, litres_sold, gross_profit_dollars, status }
 *
 * + portfolio-level rollup (weighted by litres_sold).
 *
 * Auth: owner OR operator. Gated to Growth+ via requirePlan('growth').
 */
import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { corsHeaders } from '@/lib/api/cors';
import { requirePlan } from '@/lib/billing';
import {
  computeGradeMargin, classifyMargin,
  DEFAULT_HEALTHY_CPL, DEFAULT_AMBER_CPL,
} from '@/lib/margin';
import { findGradeLitreFields } from '@/lib/financials';

export const dynamic = 'force-dynamic';

const FUEL_TYPE_MATCH = {
  ULP:     /(?:^|[_\s-])(?:ulp|u91|unleaded)(?:[_\s-]|$)/i,
  E10:     /(?:^|[_\s-])(?:e10)(?:[_\s-]|$)/i,
  Premium: /(?:^|[_\s-])(?:premium|u95|p95|u98|p98)(?:[_\s-]|$)/i,
  Diesel:  /(?:^|[_\s-])(?:diesel|dsl)(?:[_\s-]|$)/i,
  LPG:     /(?:^|[_\s-])(?:lpg|autogas)(?:[_\s-]|$)/i,
};

/**
 * Sum litres sold for a grade across shift_reports.custom_values.
 * Re-uses the same heuristic as wetstock; if no match, returns 0.
 */
function sumLitresSold(reports, grade) {
  const regex = FUEL_TYPE_MATCH[grade] || new RegExp(grade, 'i');
  let total = 0;
  for (const r of reports || []) {
    const cv = r?.custom_values || {};
    for (const [k, v] of Object.entries(cv)) {
      if (!regex.test(k)) continue;
      if (!/(?:litre|liter|volume|^l$|_l$|\bL\b)/i.test(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) total += n;
    }
  }
  return Math.round(total * 100) / 100;
}

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    if (!['owner', 'operator'].includes(auth.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: corsHeaders }
      );
    }
    const gate = await requirePlan(auth.user, 'growth');
    if (gate) return gate;

    const url = new URL(request.url);
    const siteIdsRaw = url.searchParams.get('siteIds') || '';
    const startDate = url.searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = url.searchParams.get('endDate');

    const requested = siteIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = await getAllowedSiteIds(auth.user);
    const siteIds = requested.length
      ? requested.filter((id) => allowed.includes(id))
      : allowed;
    if (!siteIds.length) {
      return NextResponse.json(
        {
          rollup: { total_litres_sold: 0, total_gross_profit_dollars: 0, weighted_margin_cpl: null },
          sites: [],
        },
        { headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;

    const [sitesRows, thresholdsRows, deliveriesAll, priceEntriesAll, reportsAll, gradesRows] = await Promise.all([
      db.from('sites').select('id, name, code').in('id', siteIds),
      // Per-site thresholds (graceful fallback if columns don't exist yet)
      db.from('sites').select('id, margin_healthy_cpl, margin_amber_cpl').in('id', siteIds).then(
        (r) => r,
        () => ({ data: [], error: null })
      ),
      buildDeliveryQuery(db, siteIds, endDate), // up to endDate (cost basis cumulative)
      buildPriceEntryQuery(db, siteIds, startDate, endDate),
      buildReportQuery(db, siteIds, startDate, endDate),
      db.from('fuel_grades').select('code, label, sort_order').eq('active', true).order('sort_order'),
    ]);
    if (sitesRows.error) throw sitesRows.error;

    const sites = sitesRows.data || [];
    const thresholdMap = new Map();
    for (const t of thresholdsRows?.data || []) {
      thresholdMap.set(t.id, {
        healthy_cpl: Number(t.margin_healthy_cpl) > 0 ? Number(t.margin_healthy_cpl) : DEFAULT_HEALTHY_CPL,
        amber_cpl:   Number(t.margin_amber_cpl)   > 0 ? Number(t.margin_amber_cpl)   : DEFAULT_AMBER_CPL,
      });
    }
    const deliveries = deliveriesAll.data || [];
    const priceEntries = priceEntriesAll.data || [];
    const reports = reportsAll.data || [];
    const grades = (gradesRows?.data || []).map((g) => g.code);

    const outSites = [];
    let totalLitres = 0;
    let totalGrossProfit = 0;
    let weightedMarginNumerator = 0; // margin_cpl × litres_sold

    for (const site of sites) {
      const siteDeliveries = deliveries.filter((d) => d.site_id === site.id);
      const sitePrices = priceEntries.filter((p) => p.site_id === site.id);
      const siteReports = reports.filter((r) => r.site_id === site.id);
      const thresholds = thresholdMap.get(site.id) || {
        healthy_cpl: DEFAULT_HEALTHY_CPL, amber_cpl: DEFAULT_AMBER_CPL,
      };

      const gradeResults = [];
      for (const grade of grades) {
        const litresSold = sumLitresSold(siteReports, grade);
        const result = computeGradeMargin({
          deliveries: siteDeliveries.filter((d) => d.grade === grade),
          priceEntries: sitePrices.filter((p) => p.fuel_type === grade),
          litresSold,
          startDate, endDate,
          thresholds,
        });
        gradeResults.push({ grade, ...result });

        if (result.gross_profit_dollars != null && result.litres_sold > 0) {
          totalLitres += result.litres_sold;
          totalGrossProfit += result.gross_profit_dollars;
          weightedMarginNumerator += result.margin_cpl * result.litres_sold;
        }
      }

      outSites.push({
        site_id: site.id,
        site_name: site.name,
        site_code: site.code || null,
        thresholds,
        grades: gradeResults,
        delivery_count: siteDeliveries.length,
        price_entry_count: sitePrices.length,
        report_count: siteReports.length,
      });
    }

    const weightedMarginCpl = totalLitres > 0
      ? Math.round((weightedMarginNumerator / totalLitres) * 10000) / 10000
      : null;

    return NextResponse.json({
      rollup: {
        total_litres_sold: Math.round(totalLitres * 100) / 100,
        total_gross_profit_dollars: Math.round(totalGrossProfit * 100) / 100,
        weighted_margin_cpl: weightedMarginCpl,
        weighted_margin_status: classifyMargin(weightedMarginCpl),
      },
      sites: outSites,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error('[margin/summary] failed:', err);
    return NextResponse.json(
      { error: 'Failed to compute margin', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

function buildDeliveryQuery(db, siteIds, endDate) {
  let q = db
    .from('fuel_deliveries')
    .select('site_id, grade, delivered_at, litres, unit_cost_cpl, total_cost_dollars')
    .in('site_id', siteIds)
    .order('delivered_at', { ascending: true });
  if (endDate) q = q.lte('delivered_at', endDate);
  return q;
}

function buildPriceEntryQuery(db, siteIds, startDate, endDate) {
  let q = db
    .from('fuel_price_entries')
    .select('site_id, date, fuel_type, price')
    .in('site_id', siteIds);
  // Include one entry BEFORE the period so the time-weighted average has a
  // baseline at startDate. We do this by widening the lower bound by 60 days.
  if (startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - 60);
    q = q.gte('date', d.toISOString().slice(0, 10));
  }
  if (endDate) q = q.lte('date', endDate);
  return q;
}

function buildReportQuery(db, siteIds, startDate, endDate) {
  let q = db
    .from('shift_reports')
    .select('site_id, date, total_litres, custom_values')
    .in('site_id', siteIds);
  if (startDate) q = q.gte('date', startDate);
  if (endDate) q = q.lte('date', endDate);
  return q;
}
