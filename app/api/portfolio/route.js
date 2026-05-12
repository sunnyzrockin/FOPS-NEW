import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase, supabaseStatus } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

// Force Node runtime + dynamic so Vercel always invokes fresh.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ============================================================================
// Helpers
// ============================================================================

// Return YYYY-MM-DD for a Date (UTC).
function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// Return the YYYY-MM-DD for the previous day of an isoDate (YYYY-MM-DD).
function previousDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return ymd(d);
}

// Build a zero-valued stats object.
function emptyStats() {
  return {
    total_sales: 0,
    fuel_sales: 0,
    shop_sales: 0,
    total_litres: 0,
    eftpos: 0,
    motorpass: 0,
    cash: 0,
    accounts: 0,
    report_count: 0,
    shifts_covered: [],
    latest_report_at: null,
    latest_report_id: null,
  };
}

// Round to 2 decimals.
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Aggregate a list of shift_reports rows into a single stats object.
function aggregateReports(rows) {
  if (!rows || !rows.length) return emptyStats();
  const out = emptyStats();
  const shifts = new Set();
  let latest = null;
  for (const r of rows) {
    out.total_sales += Number(r.total_sales) || 0;
    out.fuel_sales += Number(r.fuel_sales) || 0;
    out.shop_sales += Number(r.shop_sales) || 0;
    out.total_litres += Number(r.total_litres) || 0;
    out.eftpos += Number(r.eftpos) || 0;
    out.motorpass += Number(r.motorpass) || 0;
    out.cash += Number(r.cash) || 0;
    out.accounts += Number(r.accounts) || 0;
    if (r.shift_type) shifts.add(r.shift_type);
    const t = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
    if (!latest || t > latest.t) latest = { t, id: r.id, at: r.submitted_at };
  }
  out.total_sales = r2(out.total_sales);
  out.fuel_sales = r2(out.fuel_sales);
  out.shop_sales = r2(out.shop_sales);
  out.total_litres = r2(out.total_litres);
  out.eftpos = r2(out.eftpos);
  out.motorpass = r2(out.motorpass);
  out.cash = r2(out.cash);
  out.accounts = r2(out.accounts);
  out.report_count = rows.length;
  out.shifts_covered = Array.from(shifts);
  out.latest_report_at = latest?.at || null;
  out.latest_report_id = latest?.id || null;
  return out;
}

// Compute a site health status indicator based on today vs yesterday.
//   critical = no reports submitted today
//   warning  = reports submitted but sales dropped >20% vs yesterday
//   good     = reports submitted and sales within normal range
function computeStatus(todayStats, yesterdayStats) {
  if (todayStats.report_count === 0) return 'critical';
  const y = yesterdayStats.total_sales;
  const t = todayStats.total_sales;
  if (y > 0 && t < y * 0.8) return 'warning';
  return 'good';
}

// Percent change today vs yesterday. Returns null if yesterday is 0.
function pctChange(today, yesterday) {
  if (!yesterday) return null;
  return r2(((today - yesterday) / yesterday) * 100);
}

// Reduce a flat list of price entries into the most-recent entry per fuel_type.
function latestPerFuelType(entries) {
  const map = new Map();
  for (const e of entries || []) {
    const key = e.fuel_type;
    const t = e.entered_at ? new Date(e.entered_at).getTime() : 0;
    const cur = map.get(key);
    if (!cur || t > cur._t) {
      map.set(key, { ...e, _t: t });
    }
  }
  return Array.from(map.values())
    .map(({ _t, ...rest }) => rest)
    .sort((a, b) => (a.fuel_type || '').localeCompare(b.fuel_type || ''));
}

// ============================================================================
// GET /api/portfolio
//
// Auth: REQUIRED — `Authorization: Bearer <supabase-jwt>`
//
// Query params:
//   date   (optional) — YYYY-MM-DD, defaults to today (UTC)
//
// Role rules:
//   owner    → all sites where sites.owner_id = me
//   operator → sites in operator_site_assignments for me
//   staff    → sites in staff_site_assignments for me
//
// Response shape (abbreviated):
// {
//   user: { id, name, role },
//   date: "YYYY-MM-DD",
//   summary: {
//     total_sites, total_sales_today, total_sales_yesterday, sales_change_pct,
//     total_litres_today, total_litres_yesterday, litres_change_pct,
//     total_reports_today, sites_with_reports_today
//   },
//   sites: [{
//     id, name, owner_id, status: 'good'|'warning'|'critical',
//     todayStats: { total_sales, fuel_sales, shop_sales, total_litres,
//                   eftpos, motorpass, cash, accounts, report_count,
//                   shifts_covered, latest_report_at, latest_report_id },
//     yesterdayStats: { ...same... },
//     fuelPrices: [{ fuel_type, price, date, entered_at }],          // latest per fuel_type
//     competitorPrices: [{ competitor_name, distance_km, fuel_type, price, entered_at }]
//   }]
// }
// ============================================================================
export async function GET(request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    // --- 1) AUTH (Bearer required) -----------------------------------------
    const authResult = await verifyAuth(request);
    if (!authResult.ok) {
      // verifyAuth returns NextResponse already; just add CORS headers.
      const r = authResult.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = authResult.user;

    const db = supabaseAdmin || supabase;
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const isoDate = dateParam || ymd(new Date());
    const yesterday = previousDate(isoDate);

    // --- 2) Resolve sites visible to this user -----------------------------
    let sites = [];
    if (me.role === 'owner') {
      const { data, error } = await db
        .from('sites')
        .select('id, name, owner_id, status, created_at')
        .eq('owner_id', me.id);
      if (error) throw error;
      sites = data || [];
    } else if (me.role === 'operator') {
      const { data: assignments, error: aErr } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', me.id);
      if (aErr) throw aErr;
      const siteIds = (assignments || []).map((a) => a.site_id);
      if (siteIds.length) {
        const { data, error } = await db
          .from('sites')
          .select('id, name, owner_id, status, created_at')
          .in('id', siteIds);
        if (error) throw error;
        sites = data || [];
      }
    } else if (me.role === 'staff') {
      const { data: assignments, error: aErr } = await db
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', me.id);
      if (aErr) throw aErr;
      const siteIds = (assignments || []).map((a) => a.site_id);
      if (siteIds.length) {
        const { data, error } = await db
          .from('sites')
          .select('id, name, owner_id, status, created_at')
          .in('id', siteIds);
        if (error) throw error;
        sites = data || [];
      }
    } else {
      return NextResponse.json(
        { error: 'Unknown role', role: me.role },
        { status: 400, headers: corsHeaders }
      );
    }

    const siteIds = sites.map((s) => s.id);

    // --- 3) Bulk-fetch reports for today + yesterday across all sites ------
    let reportRows = [];
    if (siteIds.length) {
      const { data, error } = await db
        .from('shift_reports')
        .select(
          'id, site_id, date, shift_type, total_sales, fuel_sales, shop_sales, total_litres, eftpos, motorpass, cash, accounts, submitted_at, status'
        )
        .in('site_id', siteIds)
        .in('date', [isoDate, yesterday]);
      if (error) throw error;
      reportRows = data || [];
    }

    // --- 4) Bulk-fetch latest fuel prices & competitor prices for sites ----
    let fuelPriceRows = [];
    let competitorPriceRows = [];
    let competitors = [];
    if (siteIds.length) {
      // Limit to recent 30 days to keep payload small; latestPerFuelType
      // picks the most recent per fuel_type.
      const cutoff = ymd(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      const [fp, cp, comps] = await Promise.all([
        db
          .from('fuel_price_entries')
          .select('id, site_id, fuel_type, price, date, entered_at')
          .in('site_id', siteIds)
          .gte('date', cutoff),
        db
          .from('competitor_fuel_prices')
          .select(
            'id, site_id, competitor_id, fuel_type, price, date, entered_at'
          )
          .in('site_id', siteIds)
          .gte('date', cutoff),
        db
          .from('site_competitors')
          .select('id, site_id, competitor_name, distance_km')
          .in('site_id', siteIds),
      ]);
      if (fp.error) throw fp.error;
      if (cp.error) throw cp.error;
      if (comps.error) throw comps.error;
      fuelPriceRows = fp.data || [];
      competitorPriceRows = cp.data || [];
      competitors = comps.data || [];
    }

    // Build a quick lookup for competitor metadata.
    const competitorById = new Map(competitors.map((c) => [c.id, c]));

    // --- 5) Build per-site response objects --------------------------------
    const sitesOut = sites.map((site) => {
      const todayRows = reportRows.filter(
        (r) => r.site_id === site.id && r.date === isoDate
      );
      const yesterdayRows = reportRows.filter(
        (r) => r.site_id === site.id && r.date === yesterday
      );
      const todayStats = aggregateReports(todayRows);
      const yesterdayStats = aggregateReports(yesterdayRows);

      // Site fuel prices — most-recent entry per fuel_type for this site.
      const sitePrices = latestPerFuelType(
        fuelPriceRows.filter((r) => r.site_id === site.id)
      );

      // Competitor prices — most-recent per (competitor_id, fuel_type).
      const siteCompPriceRows = competitorPriceRows.filter(
        (r) => r.site_id === site.id
      );
      const compPriceMap = new Map();
      for (const e of siteCompPriceRows) {
        const key = `${e.competitor_id}::${e.fuel_type}`;
        const t = e.entered_at ? new Date(e.entered_at).getTime() : 0;
        const cur = compPriceMap.get(key);
        if (!cur || t > cur._t) compPriceMap.set(key, { ...e, _t: t });
      }
      const competitorPrices = Array.from(compPriceMap.values())
        .map(({ _t, ...rest }) => {
          const comp = competitorById.get(rest.competitor_id) || {};
          return {
            competitor_id: rest.competitor_id,
            competitor_name: comp.competitor_name || null,
            distance_km: comp.distance_km ?? null,
            fuel_type: rest.fuel_type,
            price: rest.price,
            date: rest.date,
            entered_at: rest.entered_at,
          };
        })
        .sort((a, b) => {
          if ((a.fuel_type || '') !== (b.fuel_type || '')) {
            return (a.fuel_type || '').localeCompare(b.fuel_type || '');
          }
          return (a.competitor_name || '').localeCompare(b.competitor_name || '');
        });

      return {
        id: site.id,
        name: site.name,
        owner_id: site.owner_id,
        status: computeStatus(todayStats, yesterdayStats),
        todayStats,
        yesterdayStats,
        fuelPrices: sitePrices.map((p) => ({
          fuel_type: p.fuel_type,
          price: p.price,
          date: p.date,
          entered_at: p.entered_at,
        })),
        competitorPrices,
      };
    });

    // --- 6) Aggregate summary across all sites -----------------------------
    const sumToday = sitesOut.reduce(
      (acc, s) => {
        acc.sales += s.todayStats.total_sales;
        acc.litres += s.todayStats.total_litres;
        acc.reports += s.todayStats.report_count;
        if (s.todayStats.report_count > 0) acc.sitesWithReports += 1;
        return acc;
      },
      { sales: 0, litres: 0, reports: 0, sitesWithReports: 0 }
    );
    const sumYesterday = sitesOut.reduce(
      (acc, s) => {
        acc.sales += s.yesterdayStats.total_sales;
        acc.litres += s.yesterdayStats.total_litres;
        return acc;
      },
      { sales: 0, litres: 0 }
    );

    const summary = {
      total_sites: sitesOut.length,
      total_sales_today: r2(sumToday.sales),
      total_sales_yesterday: r2(sumYesterday.sales),
      sales_change_pct: pctChange(sumToday.sales, sumYesterday.sales),
      total_litres_today: r2(sumToday.litres),
      total_litres_yesterday: r2(sumYesterday.litres),
      litres_change_pct: pctChange(sumToday.litres, sumYesterday.litres),
      total_reports_today: sumToday.reports,
      sites_with_reports_today: sumToday.sitesWithReports,
    };

    return NextResponse.json(
      {
        user: { id: me.id, name: me.name, role: me.role },
        date: isoDate,
        summary,
        sites: sitesOut,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('GET /api/portfolio error:', error);
    return NextResponse.json(
      { error: 'Failed to load portfolio', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
