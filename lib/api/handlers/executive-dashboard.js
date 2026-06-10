/**
 * Executive Dashboard handlers — power the Owner's high-level KPI view.
 *
 * Endpoints:
 *   GET /api/dashboard/12-month-trend?siteIds=...
 *   GET /api/dashboard/variance?siteIds=...&period=month|year
 *   GET /api/dashboard/top-performers?siteIds=...&startDate=...&endDate=...&metric=revenue|fuel|shop|volume&limit=5
 *   GET /api/dashboard/volume-by-grade?siteIds=...&startDate=...&endDate=...
 *
 * All endpoints require the caller to be authenticated; site IDs must be
 * a subset of what the caller can see (we trust the upstream JWT-derived
 * sites list, but defensively intersect).
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { jsonWithCors } from '@/lib/api/cors';
import { computeTotals } from '@/lib/financials';

const db = () => supabaseAdmin || supabase;
const r2 = (n) => Math.round(Number(n) * 100) / 100;

function parseSiteIds(url) {
  const raw = url.searchParams.get('siteIds') || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function scopeSiteIds(request, requested) {
  const auth = await verifyAuth(request);
  if (!auth.ok) return { error: auth.response };
  const allowed = await getAllowedSiteIds(auth.user);
  const allowedSet = new Set(allowed);
  const finalIds = requested.length
    ? requested.filter((id) => allowedSet.has(id))
    : allowed;
  return { user: auth.user, siteIds: finalIds };
}

// ---------- 12-month trend ----------
export async function handleTwelveMonthTrend(request) {
  try {
    const url = new URL(request.url);
    const requested = parseSiteIds(url);
    const scope = await scopeSiteIds(request, requested);
    if (scope.error) return scope.error;
    if (!scope.siteIds.length) return jsonWithCors([]);

    // Compute 12 month buckets ending current month.
    const today = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      buckets.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-AU', { month: 'short', year: '2-digit' }),
        startIso: start.toISOString().slice(0, 10),
        endIso: end.toISOString().slice(0, 10),
        revenue: 0, fuelSales: 0, shopSales: 0, totalLitres: 0, reportCount: 0,
      });
    }
    const windowStart = buckets[0].startIso;
    const windowEnd = buckets[buckets.length - 1].endIso;

    const { data: reports, error } = await db()
      .from('shift_reports')
      .select('date, site_id, total_sales, total_revenue, fuel_sales, shop_sales, total_litres, custom_values')
      .in('site_id', scope.siteIds)
      .gte('date', windowStart)
      .lte('date', windowEnd);
    if (error) throw error;

    for (const r of reports || []) {
      const ym = String(r.date).slice(0, 7);
      const b = buckets.find((x) => x.month === ym);
      if (!b) continue;
      // P1: route through canonical financials so this agrees with KPI tiles.
      const c = computeTotals(r);
      b.revenue += c.total_revenue;
      b.fuelSales += c.fuel_sales;
      b.shopSales += c.shop_sales;
      b.totalLitres += c.total_litres;
      b.reportCount += 1;
    }

    return jsonWithCors(buckets.map((b) => ({
      month: b.month,
      label: b.label,
      revenue: r2(b.revenue),
      fuelSales: r2(b.fuelSales),
      shopSales: r2(b.shopSales),
      totalLitres: r2(b.totalLitres),
      reportCount: b.reportCount,
    })));
  } catch (err) {
    console.error('12-month-trend error:', err);
    return jsonWithCors({ error: 'Failed to fetch 12-month trend', message: err?.message }, { status: 500 });
  }
}

// ---------- Period variance (MoM, YoY) ----------
export async function handleVariance(request) {
  try {
    const url = new URL(request.url);
    const requested = parseSiteIds(url);
    const scope = await scopeSiteIds(request, requested);
    if (scope.error) return scope.error;
    if (!scope.siteIds.length) return jsonWithCors({ mom: null, yoy: null });

    const today = new Date();

    // Current month range
    const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const curMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // Current year range vs previous year range
    const curYearStart = new Date(today.getFullYear(), 0, 1);
    const curYearEnd = today;
    const prevYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const prevYearEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    async function sumRange(from, to) {
      const { data, error } = await db()
        .from('shift_reports')
        .select('total_sales, total_revenue, fuel_sales, shop_sales, total_litres, custom_values, eftpos, motorpass, cash, accounts')
        .in('site_id', scope.siteIds)
        .gte('date', from.toISOString().slice(0, 10))
        .lte('date', to.toISOString().slice(0, 10));
      if (error) throw error;
      const acc = { revenue: 0, fuelSales: 0, shopSales: 0, totalLitres: 0, reports: 0 };
      for (const r of data || []) {
        const c = computeTotals(r);
        acc.revenue += c.total_revenue;
        acc.fuelSales += c.fuel_sales;
        acc.shopSales += c.shop_sales;
        acc.totalLitres += c.total_litres;
        acc.reports += 1;
      }
      return acc;
    }

    const [curMonth, prevMonth, curYear, prevYear] = await Promise.all([
      sumRange(curMonthStart, curMonthEnd),
      sumRange(prevMonthStart, prevMonthEnd),
      sumRange(curYearStart, curYearEnd),
      sumRange(prevYearStart, prevYearEnd),
    ]);

    const pct = (cur, prev) => {
      if (!prev) return cur ? 100 : 0;
      return r2(((cur - prev) / prev) * 100);
    };

    const build = (cur, prev) => ({
      current: { revenue: r2(cur.revenue), fuelSales: r2(cur.fuelSales), shopSales: r2(cur.shopSales), totalLitres: r2(cur.totalLitres), reports: cur.reports },
      previous: { revenue: r2(prev.revenue), fuelSales: r2(prev.fuelSales), shopSales: r2(prev.shopSales), totalLitres: r2(prev.totalLitres), reports: prev.reports },
      variancePct: {
        revenue: pct(cur.revenue, prev.revenue),
        fuelSales: pct(cur.fuelSales, prev.fuelSales),
        shopSales: pct(cur.shopSales, prev.shopSales),
        totalLitres: pct(cur.totalLitres, prev.totalLitres),
      },
    });

    return jsonWithCors({
      mom: build(curMonth, prevMonth),
      yoy: build(curYear, prevYear),
    });
  } catch (err) {
    console.error('variance error:', err);
    return jsonWithCors({ error: 'Failed to fetch variance', message: err?.message }, { status: 500 });
  }
}

// ---------- Top / bottom performers ----------
export async function handleTopPerformers(request) {
  try {
    const url = new URL(request.url);
    const requested = parseSiteIds(url);
    const scope = await scopeSiteIds(request, requested);
    if (scope.error) return scope.error;
    if (!scope.siteIds.length) return jsonWithCors({ top: [], bottom: [], metric: 'revenue' });

    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const metric = (url.searchParams.get('metric') || 'revenue').toLowerCase();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10), 1), 20);

    let q = db()
      .from('shift_reports')
      .select('site_id, total_sales, total_revenue, fuel_sales, shop_sales, total_litres, custom_values')
      .in('site_id', scope.siteIds);
    if (startDate) q = q.gte('date', startDate);
    if (endDate) q = q.lte('date', endDate);
    const [{ data: reports, error }, { data: sites }] = await Promise.all([
      q,
      db().from('sites').select('id, name, code').in('id', scope.siteIds),
    ]);
    if (error) throw error;

    const agg = new Map();
    for (const r of reports || []) {
      const s = agg.get(r.site_id) || { revenue: 0, fuelSales: 0, shopSales: 0, totalLitres: 0, reportCount: 0 };
      const c = computeTotals(r);
      s.revenue += c.total_revenue;
      s.fuelSales += c.fuel_sales;
      s.shopSales += c.shop_sales;
      s.totalLitres += c.total_litres;
      s.reportCount += 1;
      agg.set(r.site_id, s);
    }

    const rows = (sites || []).map((site) => {
      const a = agg.get(site.id) || { revenue: 0, fuelSales: 0, shopSales: 0, totalLitres: 0, reportCount: 0 };
      return {
        siteId: site.id, siteName: site.name, siteCode: site.code || site.name?.slice(0, 12) || site.id.slice(0, 8),
        revenue: r2(a.revenue), fuelSales: r2(a.fuelSales), shopSales: r2(a.shopSales),
        totalLitres: r2(a.totalLitres), reportCount: a.reportCount,
      };
    });

    const metricKey = ({ revenue: 'revenue', fuel: 'fuelSales', shop: 'shopSales', volume: 'totalLitres' }[metric]) || 'revenue';
    const sorted = [...rows].sort((x, y) => (y[metricKey] || 0) - (x[metricKey] || 0));
    return jsonWithCors({
      metric: metricKey,
      top: sorted.slice(0, limit),
      bottom: sorted.slice(-limit).reverse(),
    });
  } catch (err) {
    console.error('top-performers error:', err);
    return jsonWithCors({ error: 'Failed to fetch top performers', message: err?.message }, { status: 500 });
  }
}

// ---------- Volume sold by fuel grade ----------
// Aggregates total_litres from shift_reports and any custom_values numeric keys
// that match common fuel grade hints (e10, ulp, u95, u98, premium, diesel, lpg).
export async function handleVolumeByGrade(request) {
  try {
    const url = new URL(request.url);
    const requested = parseSiteIds(url);
    const scope = await scopeSiteIds(request, requested);
    if (scope.error) return scope.error;
    if (!scope.siteIds.length) return jsonWithCors({ grades: [], totalLitres: 0 });

    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    let q = db()
      .from('shift_reports')
      .select('site_id, total_litres, custom_values')
      .in('site_id', scope.siteIds);
    if (startDate) q = q.gte('date', startDate);
    if (endDate) q = q.lte('date', endDate);
    const { data: reports, error } = await q;
    if (error) throw error;

    // Heuristics: any custom_values key containing 'litre' OR 'volume' OR known fuel code substrings.
    const gradeMatchers = [
      { key: 'ULP 91', test: (k) => /(^|[^a-z])ulp91|ulp_91|ulp 91|unleaded.?91|u91/i.test(k) },
      { key: 'E10', test: (k) => /(^|[^a-z])e10/i.test(k) },
      { key: 'U95 / Premium 95', test: (k) => /(^|[^a-z])u95|p95|premium.?95/i.test(k) },
      { key: 'U98 / Premium 98', test: (k) => /(^|[^a-z])u98|p98|premium.?98/i.test(k) },
      { key: 'Diesel', test: (k) => /diesel|dsl/i.test(k) },
      { key: 'LPG', test: (k) => /(^|[^a-z])lpg|autogas/i.test(k) },
    ];

    const grades = new Map();
    let totalLitres = 0;

    for (const r of reports || []) {
      totalLitres += Number(r.total_litres) || 0;
      const cv = r.custom_values || {};
      for (const [k, v] of Object.entries(cv)) {
        const numeric = Number(v);
        if (!Number.isFinite(numeric)) continue;
        if (!/litre|volume/i.test(k)) continue;
        const matched = gradeMatchers.find((m) => m.test(k));
        const bucket = matched ? matched.key : 'Other';
        grades.set(bucket, (grades.get(bucket) || 0) + numeric);
      }
    }

    // If no custom volume fields exist, surface total_litres as 'Combined'.
    if (grades.size === 0 && totalLitres > 0) {
      grades.set('Combined (all grades)', totalLitres);
    }

    const result = Array.from(grades.entries()).map(([grade, litres]) => ({ grade, litres: r2(litres) }))
      .sort((a, b) => b.litres - a.litres);

    return jsonWithCors({
      grades: result,
      totalLitres: r2(totalLitres),
    });
  } catch (err) {
    console.error('volume-by-grade error:', err);
    return jsonWithCors({ error: 'Failed to fetch volume by grade', message: err?.message }, { status: 500 });
  }
}
