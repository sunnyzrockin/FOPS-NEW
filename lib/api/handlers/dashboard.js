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
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export { corsHeaders };

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
    
    const siteIdArray = siteIds.split(',');
    
    let query = (supabaseAdmin || supabase)
      .from('shift_reports')
      .select('*')
      .in('site_id', siteIdArray);
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    
    const { data: reports, error } = await query;
    
    if (error) throw error;
    
    // Group reports by site_id and date
    const rollups = {};
    
    (reports || []).forEach(report => {
      const key = `${report.site_id}_${report.date}`;
      
      if (!rollups[key]) {
        rollups[key] = {
          site_id: report.site_id,
          date: report.date,
          total_sales: 0,
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
          shift_count: 0
        };
      }
      
      rollups[key].total_sales += report.total_sales || 0;
      rollups[key].fuel_sales += report.fuel_sales || 0;
      rollups[key].shop_sales += report.shop_sales || 0;
      rollups[key].total_litres += report.total_litres || 0;
      rollups[key].eftpos += report.eftpos || 0;
      rollups[key].motorpass += report.motorpass || 0;
      rollups[key].cash += report.cash || 0;
      rollups[key].accounts += report.accounts || 0;
      rollups[key].beverages += report.beverages || 0;
      rollups[key].hot_food += report.hot_food || 0;
      rollups[key].drive_offs += report.drive_offs || 0;
      rollups[key].dips += report.dips || 0;
      rollups[key].shift_count += 1;
    });
    
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

    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) {
      return NextResponse.json({
        totalShopSales: 0, totalFuelSales: 0, totalRevenue: 0,
        totalDips: 0, totalDriveOffs: 0, totalBanking: 0,
        totalReports: 0, pendingReports: 0, reviewedReports: 0,
        topPerformingSite: null, lowestPerformingSite: null,
        // legacy snake_case (kept for backward compatibility):
        total_sales: 0, fuel_sales: 0, shop_sales: 0, total_litres: 0,
        total_reports: 0, pending_reports: 0, reviewed_reports: 0,
      }, { headers: corsHeaders });
    }

    const db = supabaseAdmin || supabase;

    // Pull sites + reports in parallel
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres, total_revenue, eftpos, motorpass, cash, accounts, dips, drive_offs, status')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);

    const [{ data: sites, error: sitesErr }, { data: reports, error: reportsErr }] = await Promise.all([
      db.from('sites').select('id, name, code').in('id', siteIdArray),
      reportsQuery,
    ]);
    if (sitesErr) throw sitesErr;
    if (reportsErr) throw reportsErr;

    // Aggregate totals
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
    };
    const perSite = new Map();
    for (const r of reports || []) {
      const sales = Number(r.total_sales) || 0;
      const fuel = Number(r.fuel_sales) || 0;
      const shop = Number(r.shop_sales) || 0;
      const litres = Number(r.total_litres) || 0;
      const revenue = Number(r.total_revenue) || sales; // fall back to total_sales
      const dips = Number(r.dips) || 0;
      const driveOffs = Number(r.drive_offs) || 0;
      const banking = (Number(r.eftpos) || 0) + (Number(r.motorpass) || 0) + (Number(r.cash) || 0) + (Number(r.accounts) || 0);

      totals.totalShopSales += shop;
      totals.totalFuelSales += fuel;
      totals.totalRevenue += revenue;
      totals.totalSales += sales;
      totals.totalLitres += litres;
      totals.totalDips += dips;
      totals.totalDriveOffs += driveOffs;
      totals.totalBanking += banking;
      if (r.status === 'pending') totals.pendingReports += 1;
      if (r.status === 'reviewed') totals.reviewedReports += 1;

      if (!perSite.has(r.site_id)) {
        perSite.set(r.site_id, { revenue: 0, totalSales: 0, reportCount: 0 });
      }
      const ps = perSite.get(r.site_id);
      ps.revenue += revenue;
      ps.totalSales += sales;
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
      topPerformingSite,
      lowestPerformingSite,
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

    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    const db = supabaseAdmin || supabase;

    // Fetch sites for code/name labels (used by chart X-axis)
    const { data: sites, error: sitesErr } = await db
      .from('sites')
      .select('id, name, code')
      .in('id', siteIdArray);
    if (sitesErr) throw sitesErr;

    // Fetch reports in date range
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);
    const { data: reports, error: reportsErr } = await reportsQuery;
    if (reportsErr) throw reportsErr;

    const result = (sites || []).map((site) => {
      const siteReports = (reports || []).filter((r) => r.site_id === site.id);
      const fuelSales = siteReports.reduce((acc, r) => acc + (Number(r.fuel_sales) || 0), 0);
      const shopSales = siteReports.reduce((acc, r) => acc + (Number(r.shop_sales) || 0), 0);
      const totalSales = siteReports.reduce((acc, r) => acc + (Number(r.total_sales) || 0), 0);
      const totalLitres = siteReports.reduce((acc, r) => acc + (Number(r.total_litres) || 0), 0);
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
    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    // Build the window: last `days` days ending today (UTC).
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);

    const db = supabaseAdmin || supabase;
    const { data: reports, error } = await db
      .from('shift_reports')
      .select('date, total_sales')
      .in('site_id', siteIdArray)
      .gte('date', startIso)
      .lte('date', endIso);
    if (error) throw error;

    // Bucket by date
    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of reports || []) {
      const key = r.date;
      if (!buckets.has(key)) continue;
      buckets.set(key, buckets.get(key) + (Number(r.total_sales) || 0));
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
