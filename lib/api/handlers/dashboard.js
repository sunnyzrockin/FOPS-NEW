/**
 * Dashboard module — aggregations and rollups for Owner/Operator dashboards.
 *
 * Phase 2 final extraction from catch-all route.js.
 *
 * Endpoints:
 *   GET /api/daily-rollups
 *   GET /api/dashboard/stats
 *   GET /api/dashboard/site-stats
 *   GET /api/dashboard/revenue-chart
 *
 * (Executive endpoints — 12-month-trend, variance, top-performers,
 * volume-by-grade — are already in /app/lib/api/handlers/executive-dashboard.js)
 */

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { computeTotals, revenueFor } from '@/lib/financials';

// -------------------------------------------------------------------------
// Security hardening (Fix 4): intersect the caller's requested ?siteIds=
// with the set of sites they're actually allowed to see. Empty intersection
// returns an empty rollup/stats payload rather than 403 \u2014 a logged-in user
// with no assignments is a legitimate state, just one that produces no data.
// -------------------------------------------------------------------------
async function scopeRequestedSites(user, rawSiteIds) {
  const requested = (rawSiteIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!requested.length) return [];
  const allowed = await getAllowedSiteIds(user);
  const allowedSet = new Set(allowed);
  return requested.filter((id) => allowedSet.has(id));
}

// Local helper used by handleGetDailyRollups to evaluate stored banking
// formulas against an aggregated daily-rollup row.
function calculateFormula(formula_json, shift_data) {
  try {
    const operations = JSON.parse(formula_json).operations || [];
    let result = 0;
    let currentOp = '+';
    for (const op of operations) {
      if (op.type === 'field') {
        const value = parseFloat(shift_data[op.value] || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      } else if (op.type === 'operator') {
        currentOp = op.value;
      } else if (op.type === 'number') {
        const value = parseFloat(op.value || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      }
    }
    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error('Formula calculation error:', error);
    return 0;
  }
}

export async function handleGetDailyRollups(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }
    
    const siteIdArray = await scopeRequestedSites(auth.user, siteIds);
    if (siteIdArray.length === 0) {
      // Caller asked for sites they cannot access — return an empty rollup
      // rather than 403 so the dashboard renders cleanly.
      return NextResponse.json([], { headers: corsHeaders });
    }
    
    let query = (supabaseAdmin || supabase)
      .from('shift_reports')
      .select('*')
      .in('site_id', siteIdArray);
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    
    const { data: reports, error } = await query;
    
    if (error) throw error;
    
    // Group reports by site_id and date — P1: route every $/L value through
    // computeTotals so the daily rollups agree with the KPI tiles.
    const rollups = {};
    const rollupSubmitted = {}; // track audit "submitted" totals for tooltip

    (reports || []).forEach(report => {
      const key = `${report.site_id}_${report.date}`;
      const c = computeTotals(report);

      if (!rollups[key]) {
        rollups[key] = {
          site_id: report.site_id,
          date: report.date,
          total_sales: 0,
          total_revenue: 0,  // P1: = total_sales
          fuel_sales: 0,
          shop_sales: 0,
          total_litres: 0,
          eftpos: 0,
          motorpass: 0,
          cash: 0,
          accounts: 0,
          beverages: 0,
          hot_food: 0,
          drive_offs: 0,
          dips: 0,
          shift_count: 0,
          flagged_shift_count: 0, // P1: count of shifts that failed reconciliation
        };
        rollupSubmitted[key] = { total_sales: 0, total_revenue: 0, fuel_sales: 0, shop_sales: 0, total_litres: 0 };
      }

      rollups[key].total_sales   += c.total_sales;
      rollups[key].total_revenue += c.total_revenue;
      rollups[key].fuel_sales    += c.fuel_sales;
      rollups[key].shop_sales    += c.shop_sales;
      rollups[key].total_litres  += c.total_litres;
      rollups[key].eftpos        += Number(report.eftpos) || 0;
      rollups[key].motorpass     += Number(report.motorpass) || 0;
      rollups[key].cash          += Number(report.cash) || 0;
      rollups[key].accounts      += Number(report.accounts) || 0;
      rollups[key].beverages     += Number(report.beverages) || 0;
      rollups[key].hot_food      += Number(report.hot_food) || 0;
      rollups[key].drive_offs    += Number(report.drive_offs) || 0;
      rollups[key].dips          += Number(report.dips) || 0;
      rollups[key].shift_count   += 1;
      if (!c.reconciles) {
        rollups[key].flagged_shift_count += 1;
      }

      rollupSubmitted[key].total_sales   += c.submitted.total_sales;
      rollupSubmitted[key].total_revenue += c.submitted.total_revenue;
      rollupSubmitted[key].fuel_sales    += c.submitted.fuel_sales;
      rollupSubmitted[key].shop_sales    += c.submitted.shop_sales;
      rollupSubmitted[key].total_litres  += c.submitted.total_litres;
    });

    // Attach the audit "submitted" rollup so the UI can show "you typed
    // X, we computed Y" when a daily rollup contains flagged shifts.
    for (const key in rollups) {
      rollups[key].submitted_rollup = rollupSubmitted[key];
    }
    
    // Calculate formula rollups for each day
    for (const key in rollups) {
      const rollup = rollups[key];
      const { data: formulas } = await (supabaseAdmin || supabase)
        .from('site_banking_formulas')
        .select('*')
        .eq('site_id', rollup.site_id)
        .eq('is_active', true)
        .eq('visible_in_operator_daily_summary', true);
      
      if (formulas && formulas.length > 0) {
        rollup.formula_results = [];
        
        for (const formula of formulas) {
          const result = calculateFormula(formula.formula_json, rollup);
          rollup.formula_results.push({
            formula_id: formula.id,
            formula_name: formula.name,
            result_label: formula.result_label || formula.name,
            result_value: result
          });
        }
      }
    }
    
    return NextResponse.json(Object.values(rollups), { headers: corsHeaders });
  } catch (error) {
    console.error('Get daily rollups error:', error);
    return NextResponse.json({ error: 'Failed to fetch daily rollups' }, { status: 500, headers: corsHeaders });
  }
}

// ============== DASHBOARD STATS ==============
export async function handleGetDashboardStats(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }

    const siteIdArray = await scopeRequestedSites(auth.user, siteIds);
    if (!siteIdArray.length) {
      // Empty intersection — caller has access to NONE of the requested sites.
      // Return {} (empty object) rather than a zeroed payload so the response
      // is unambiguously distinguishable from "scoped but no data in range".
      // Frontend stat-card components guard with `{stats && ...}` and read
      // missing fields via `formatCurrency(stats?.foo)` → renders zeros.
      return NextResponse.json({}, { headers: corsHeaders });
    }

    const db = supabaseAdmin || supabase;

    // Pull sites + reports in parallel
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres, total_revenue, eftpos, motorpass, cash, accounts, dips, drive_offs, status, custom_values')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);

    const [{ data: sites, error: sitesErr }, { data: reports, error: reportsErr }] = await Promise.all([
      db.from('sites').select('id, name, code').in('id', siteIdArray),
      reportsQuery,
    ]);
    if (sitesErr) throw sitesErr;
    if (reportsErr) throw reportsErr;

    // Aggregate totals — P1 Financial Integrity: every value flows through
    // lib/financials.js so dashboards, exports, and PDFs always agree.
    const totals = {
      totalShopSales: 0,
      totalFuelSales: 0,
      totalRevenue: 0,
      totalSales: 0,
      totalLitres: 0,
      totalDips: 0,
      totalDriveOffs: 0,
      totalBanking: 0,
      totalReports: (reports || []).length,
      pendingReports: 0,
      reviewedReports: 0,
      flaggedReports: 0,
    };
    const perSite = new Map();
    for (const r of reports || []) {
      const c = computeTotals(r); // canonical, single source of truth

      totals.totalShopSales += c.shop_sales;
      totals.totalFuelSales += c.fuel_sales;
      totals.totalRevenue += c.total_revenue;
      totals.totalSales += c.total_sales;
      totals.totalLitres += c.total_litres;
      totals.totalDips += Number(r.dips) || 0;
      totals.totalDriveOffs += Number(r.drive_offs) || 0;
      totals.totalBanking += c.banking;
      if (r.status === 'pending') totals.pendingReports += 1;
      if (r.status === 'reviewed') totals.reviewedReports += 1;
      if (!c.reconciles) totals.flaggedReports += 1;

      if (!perSite.has(r.site_id)) {
        perSite.set(r.site_id, { revenue: 0, totalSales: 0, reportCount: 0 });
      }
      const ps = perSite.get(r.site_id);
      ps.revenue += c.total_revenue;
      ps.totalSales += c.total_sales;
      ps.reportCount += 1;
    }

    // Build top/lowest performing site
    const siteRanking = (sites || []).map((s) => {
      const agg = perSite.get(s.id) || { revenue: 0, totalSales: 0, reportCount: 0 };
      return {
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code || s.name?.slice(0, 12) || s.id.slice(0, 8),
        revenue: Math.round(agg.revenue * 100) / 100,
        totalSales: Math.round(agg.totalSales * 100) / 100,
        reportCount: agg.reportCount,
      };
    });
    const ranked = siteRanking.filter((s) => s.reportCount > 0).sort((a, b) => b.revenue - a.revenue);
    const topPerformingSite = ranked.length ? ranked[0] : null;
    const lowestPerformingSite = ranked.length > 1 ? ranked[ranked.length - 1] : null;

    // -------- Health strip metrics --------
    // Computed independent of the user-selected date range — these are
    // always "today / pending across the lifetime" so the strip stays
    // useful even when the user is browsing a historical date range.
    //
    // FEAT 1 — shifts_per_day awareness: a site with shifts_per_day=3
    // needs THREE submissions today to count as "submitted today",
    // not just one. We sum the expected count across all visible sites
    // and the actual submission count, then expose both via the response
    // (the client renders "X/Y" using these).
    const todayISO = new Date().toISOString().slice(0, 10);
    let submittedToday = 0;
    let totalExpectedToday = siteIdArray.length; // fallback if SQL column missing
    let pendingReview = 0;
    let varianceAlerts = 0;
    try {
      const [todayReports, pendingAll, varianceAll, sitesMeta] = await Promise.all([
        db.from('shift_reports')
          .select('site_id, shift_type')
          .in('site_id', siteIdArray)
          .eq('date', todayISO),
        db.from('shift_reports')
          .select('id', { count: 'exact', head: true })
          .in('site_id', siteIdArray)
          .eq('status', 'pending'),
        db.from('shift_reports')
          .select('id', { count: 'exact', head: true })
          .in('site_id', siteIdArray)
          .gt('drive_offs', 0),
        // shifts_per_day per site — defaults to 2 if column missing (caught
        // by the try/catch around the whole block).
        db.from('sites')
          .select('id, shifts_per_day')
          .in('id', siteIdArray),
      ]);

      // Build expected count: sum(shifts_per_day) across visible sites.
      const spdById = new Map();
      for (const s of sitesMeta.data || []) {
        const n = Number(s.shifts_per_day);
        spdById.set(s.id, Number.isInteger(n) && n >= 1 && n <= 3 ? n : 2);
      }
      totalExpectedToday = siteIdArray.reduce(
        (acc, sid) => acc + (spdById.get(sid) || 2),
        0,
      );

      // Count actual: each distinct (site_id, shift_type) for today.
      // We dedupe so two reports for the same site+shift don't double-count.
      const seen = new Set();
      for (const r of todayReports.data || []) {
        const k = `${r.site_id}__${r.shift_type || ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        submittedToday += 1;
      }
      pendingReview = pendingAll.count || 0;
      varianceAlerts = varianceAll.count || 0;
    } catch (e) {
      console.warn('health-strip metrics failed (non-fatal):', e?.message);
    }

    const r2 = (n) => Math.round(n * 100) / 100;
    const response = {
      // Frontend camelCase fields (what the StatCards read):
      totalShopSales: r2(totals.totalShopSales),
      totalFuelSales: r2(totals.totalFuelSales),
      totalRevenue: r2(totals.totalRevenue),
      totalDips: r2(totals.totalDips),
      totalDriveOffs: r2(totals.totalDriveOffs),
      totalBanking: r2(totals.totalBanking),
      totalSales: r2(totals.totalSales),
      totalLitres: r2(totals.totalLitres),
      totalReports: totals.totalReports,
      pendingReports: totals.pendingReports,
      reviewedReports: totals.reviewedReports,
      flaggedReports: totals.flaggedReports, // P1: reports that failed reconciliation
      topPerformingSite,
      lowestPerformingSite,
      // Health strip (Section 5d):
      submittedToday,
      totalSites: siteIdArray.length,
      // FEAT 1: expected = sum(shifts_per_day) across sites; replaces the
      // naive totalSites for the X/Y "submitted today" display.
      totalExpectedToday,
      pendingReview,
      varianceAlerts,
      // Legacy snake_case (kept so any older callers don't break):
      total_sales: r2(totals.totalSales),
      fuel_sales: r2(totals.totalFuelSales),
      shop_sales: r2(totals.totalShopSales),
      total_litres: r2(totals.totalLitres),
      total_reports: totals.totalReports,
      pending_reports: totals.pendingReports,
      reviewed_reports: totals.reviewedReports,
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// /api/dashboard/site-stats?siteIds=...&startDate=...&endDate=...
// Returns per-site aggregated stats for the Owner BarChart (Site Comparison).
// Shape: [{ siteId, siteCode, siteName, fuelSales, shopSales, totalSales, totalLitres, reportCount }]
export async function handleGetDashboardSiteStats(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }

    const siteIdArray = await scopeRequestedSites(auth.user, siteIds);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    const db = supabaseAdmin || supabase;

    // Fetch sites for code/name labels (used by chart X-axis)
    const { data: sites, error: sitesErr } = await db
      .from('sites')
      .select('id, name, code')
      .in('id', siteIdArray);
    if (sitesErr) throw sitesErr;

    // Fetch reports in date range — pull all columns financials.js needs
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres, total_revenue, eftpos, motorpass, cash, accounts, custom_values')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);
    const { data: reports, error: reportsErr } = await reportsQuery;
    if (reportsErr) throw reportsErr;

    // P1: route per-site sums through the canonical computeTotals.
    const result = (sites || []).map((site) => {
      const siteReports = (reports || []).filter((r) => r.site_id === site.id);
      let fuelSales = 0, shopSales = 0, totalSales = 0, totalLitres = 0;
      for (const r of siteReports) {
        const c = computeTotals(r);
        fuelSales  += c.fuel_sales;
        shopSales  += c.shop_sales;
        totalSales += c.total_sales;
        totalLitres += c.total_litres;
      }
      return {
        siteId: site.id,
        siteCode: site.code || site.name?.slice(0, 12) || site.id.slice(0, 8),
        siteName: site.name,
        fuelSales: Math.round(fuelSales * 100) / 100,
        shopSales: Math.round(shopSales * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        totalLitres: Math.round(totalLitres * 100) / 100,
        reportCount: siteReports.length,
      };
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard site-stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch site stats', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// /api/dashboard/revenue-chart?siteIds=...&days=7
// Returns daily revenue time-series for the Owner LineChart (Revenue Trend).
// Shape: [{ date: 'YYYY-MM-DD', revenue: number }]
export async function handleGetDashboardRevenueChart(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const daysParam = parseInt(url.searchParams.get('days') || '7', 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 7;

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }
    const siteIdArray = await scopeRequestedSites(auth.user, siteIds);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    // Build the window: last `days` days ending today (UTC).
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);

    const db = supabaseAdmin || supabase;
    const { data: reports, error } = await db
      .from('shift_reports')
      .select('date, total_sales, total_revenue, fuel_sales, shop_sales, total_litres, custom_values')
      .in('site_id', siteIdArray)
      .gte('date', startIso)
      .lte('date', endIso);
    if (error) throw error;

    // Bucket by date — P1: revenue MUST flow through computeTotals so the
    // daily chart agrees with the KPI cards (previous bug: this used
    // total_sales only, while every other endpoint used total_revenue
    // || total_sales).
    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of reports || []) {
      const key = r.date;
      if (!buckets.has(key)) continue;
      buckets.set(key, buckets.get(key) + revenueFor(r));
    }
    const result = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard revenue-chart error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue chart', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== FUEL PRICE INTELLIGENCE ==============
