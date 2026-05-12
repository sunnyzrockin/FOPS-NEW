import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase, supabaseStatus } from '@/lib/supabase';

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
// GET /api/portfolio
// Returns a role-aware dashboard summary: list of sites the user has access
// to, plus today's KPIs (sales, litres, reports) per-site and aggregated.
//
// Query params:
//   userId   (required) — the FOPS users.id of the requesting user
//   date     (optional) — YYYY-MM-DD, defaults to today (UTC)
//
// Role rules:
//   - owner     → all sites where sites.owner_id = user.id
//   - operator  → sites in operator_site_assignments for this user
//   - staff     → sites in staff_site_assignments for this user
// ============================================================================
export async function GET(request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const dateParam = url.searchParams.get('date');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query parameter is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Default to today (UTC) in YYYY-MM-DD format
    const today = new Date();
    const isoDate = dateParam || today.toISOString().slice(0, 10);

    // 1) Look up the user
    const { data: user, error: userErr } = await db
      .from('users')
      .select('id, name, email, role, status')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { error: 'User not found', userId },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2) Resolve which sites this user can see (role-based)
    let sites = [];
    if (user.role === 'owner') {
      const { data, error } = await db
        .from('sites')
        .select('id, name, owner_id, status, created_at')
        .eq('owner_id', user.id);
      if (error) throw error;
      sites = data || [];
    } else if (user.role === 'operator') {
      const { data: assignments, error: aErr } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', user.id);
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
    } else if (user.role === 'staff') {
      const { data: assignments, error: aErr } = await db
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', user.id);
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
        { error: 'Unknown role', role: user.role },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3) Pull today's reports for these sites in a single query
    let reportsByDate = [];
    if (sites.length) {
      const siteIds = sites.map((s) => s.id);
      const { data: reports, error: rErr } = await db
        .from('shift_reports')
        .select(
          'id, site_id, date, shift_type, total_sales, total_litres, submitted_by_user_id, submitted_at, status'
        )
        .in('site_id', siteIds)
        .eq('date', isoDate);
      if (rErr) throw rErr;
      reportsByDate = reports || [];
    }

    // 4) Group reports by site and compute per-site KPIs
    const sitesWithKpis = sites.map((site) => {
      const siteReports = reportsByDate.filter((r) => r.site_id === site.id);
      const totalSales = siteReports.reduce(
        (acc, r) => acc + (Number(r.total_sales) || 0),
        0
      );
      const totalLitres = siteReports.reduce(
        (acc, r) => acc + (Number(r.total_litres) || 0),
        0
      );
      const shiftsCovered = Array.from(
        new Set(siteReports.map((r) => r.shift_type).filter(Boolean))
      );
      const latestReport = siteReports
        .slice()
        .sort(
          (a, b) =>
            new Date(b.submitted_at || 0).getTime() -
            new Date(a.submitted_at || 0).getTime()
        )[0];

      return {
        id: site.id,
        name: site.name,
        owner_id: site.owner_id,
        status: site.status,
        today: {
          total_sales: Math.round(totalSales * 100) / 100,
          total_litres: Math.round(totalLitres * 100) / 100,
          report_count: siteReports.length,
          shifts_covered: shiftsCovered,
          latest_report_at: latestReport?.submitted_at || null,
          latest_report_id: latestReport?.id || null,
        },
      };
    });

    // 5) Aggregate summary
    const summary = {
      total_sites: sitesWithKpis.length,
      total_sales_today:
        Math.round(
          sitesWithKpis.reduce((acc, s) => acc + s.today.total_sales, 0) * 100
        ) / 100,
      total_litres_today:
        Math.round(
          sitesWithKpis.reduce((acc, s) => acc + s.today.total_litres, 0) * 100
        ) / 100,
      total_reports_today: sitesWithKpis.reduce(
        (acc, s) => acc + s.today.report_count,
        0
      ),
      sites_with_reports_today: sitesWithKpis.filter(
        (s) => s.today.report_count > 0
      ).length,
    };

    return NextResponse.json(
      {
        user: { id: user.id, name: user.name, role: user.role },
        date: isoDate,
        summary,
        sites: sitesWithKpis,
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
