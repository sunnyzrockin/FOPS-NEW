/**
 * /api/dashboard/timeseries  —  the engine behind the Executive Analytics
 * Explorer (RevenueCat-style metric explorer).
 *
 * Query params:
 *   metric        revenue | fuel_sales | shop_sales | litres | banking | drive_offs   (default revenue)
 *   segmentBy     site | shift_type | fuel_grade                                       (default site)
 *   granularity   daily | weekly | monthly                                             (default daily)
 *   siteIds       comma-separated UUIDs (intersected with caller's allowed sites)
 *   startDate     YYYY-MM-DD
 *   endDate       YYYY-MM-DD
 *   shiftType     optional exact match  (e.g. 'morning')
 *   status        optional CSV  (e.g. 'pending,reviewed')
 *
 * Response:
 *   {
 *     periods: [ "2026-03-01", "2026-03-02", ... ],          // bucket labels
 *     series:  [ { key: "Brisbane Central", values: [12,3..] }, ... ],
 *     totals:  { metric: 12345.67, reportCount: 84 },
 *     metric, segmentBy, granularity, startDate, endDate
 *   }
 *
 * SECURITY (unchanged from the Sprint 1 hardening pattern):
 *   - verifyAuth required → 401 anon
 *   - getAllowedSiteIds(auth.user) intersected with the caller's ?siteIds=
 *     so an operator can never read foreign sites. Empty intersection
 *     returns an empty-but-200 payload (legitimate state).
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { jsonWithCors } from '@/lib/api/cors';
import { computeTotals } from '@/lib/financials';

const db = () => supabaseAdmin || supabase;
const r2 = (n) => Math.round(Number(n) * 100) / 100;

// ----- metric resolvers (per shift_reports row) ----------------------------
// P1: every $/L metric routes through computeTotals so this endpoint
// agrees with the KPI tiles, the executive cards, and the revenue chart.
const METRIC_FNS = {
  revenue:     (r) => computeTotals(r).total_revenue,
  fuel_sales:  (r) => computeTotals(r).fuel_sales,
  shop_sales:  (r) => computeTotals(r).shop_sales,
  litres:      (r) => computeTotals(r).total_litres,
  banking:     (r) => computeTotals(r).banking,
  drive_offs:  (r) => Number(r.drive_offs) || 0,
};

// ----- bucket-label builders by granularity --------------------------------
function bucketLabel(date, granularity) {
  // date is a Date instance
  if (granularity === 'monthly') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'weekly') {
    // ISO week (1-indexed). Cheap implementation good enough for chart labels.
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7; // Sun → 7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  // daily
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ----- fuel-grade label heuristics (reused from volume-by-grade) -----------
// Map a custom_values key to a friendly grade label. Returns null if the
// key doesn't look like a per-grade litre figure.
function gradeForKey(key) {
  if (!/litre|volume/i.test(key)) return null;
  if (/(^|[^a-z])e10/i.test(key)) return 'E10';
  if (/(^|[^a-z])ulp91|ulp_91|ulp 91|unleaded.?91|u91/i.test(key)) return 'ULP 91';
  if (/(^|[^a-z])u95|p95|premium.?95/i.test(key)) return 'U95 / Premium 95';
  if (/(^|[^a-z])u98|p98|premium.?98/i.test(key)) return 'U98 / Premium 98';
  if (/diesel|dsl/i.test(key)) return 'Diesel';
  if (/(^|[^a-z])lpg|autogas/i.test(key)) return 'LPG';
  return 'Other';
}

export async function handleTimeseries(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const metric = (url.searchParams.get('metric') || 'revenue').toLowerCase();
    const segmentBy = (url.searchParams.get('segmentBy') || 'site').toLowerCase();
    const granularity = (url.searchParams.get('granularity') || 'daily').toLowerCase();
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const shiftTypeFilter = url.searchParams.get('shiftType');
    const statusFilterCsv = url.searchParams.get('status');

    if (!METRIC_FNS[metric]) {
      return jsonWithCors({ error: `Unknown metric: ${metric}` }, { status: 400 });
    }
    if (!['site', 'shift_type', 'fuel_grade'].includes(segmentBy)) {
      return jsonWithCors({ error: `Unknown segmentBy: ${segmentBy}` }, { status: 400 });
    }
    if (!['daily', 'weekly', 'monthly'].includes(granularity)) {
      return jsonWithCors({ error: `Unknown granularity: ${granularity}` }, { status: 400 });
    }

    // ----- scope ------------------------------------------------------------
    const requested = (url.searchParams.get('siteIds') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = await getAllowedSiteIds(auth.user);
    const allowedSet = new Set(allowed);
    const siteIds = requested.length
      ? requested.filter((id) => allowedSet.has(id))
      : allowed;

    if (!siteIds.length) {
      return jsonWithCors({
        periods: [], series: [], totals: { metric: 0, reportCount: 0 },
        metric, segmentBy, granularity, startDate, endDate,
      });
    }

    // ----- fetch rows -------------------------------------------------------
    let q = db()
      .from('shift_reports')
      .select('id, site_id, date, shift_type, status, total_sales, total_revenue, fuel_sales, shop_sales, total_litres, eftpos, motorpass, cash, accounts, drive_offs, custom_values')
      .in('site_id', siteIds);

    if (startDate) q = q.gte('date', startDate);
    if (endDate) q = q.lte('date', endDate);
    if (shiftTypeFilter) q = q.eq('shift_type', shiftTypeFilter);
    if (statusFilterCsv) {
      const statuses = statusFilterCsv.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) q = q.in('status', statuses);
    }

    const { data: reports, error } = await q;
    if (error) throw error;

    // ----- site name lookup (only needed when segmenting by site) -----------
    let siteNames = {};
    if (segmentBy === 'site') {
      const { data: sites } = await db()
        .from('sites')
        .select('id, name, code')
        .in('id', siteIds);
      siteNames = Object.fromEntries((sites || []).map((s) => [s.id, s.name || s.code || s.id]));
    }

    const metricFn = METRIC_FNS[metric];

    // ----- aggregate --------------------------------------------------------
    // periodSet preserves insertion order across rows; we sort it at the end.
    const periodSet = new Set();
    // Map<segmentKey, Map<periodLabel, number>>
    const matrix = new Map();
    let totalMetric = 0;
    let reportCount = 0;

    for (const row of reports || []) {
      const d = new Date(row.date);
      if (Number.isNaN(d.getTime())) continue;
      const period = bucketLabel(d, granularity);
      periodSet.add(period);
      reportCount += 1;

      const value = metricFn(row);
      totalMetric += value;

      if (segmentBy === 'fuel_grade') {
        // Walk custom_values; each numeric litre-flavoured key contributes
        // to its grade bucket. If no breakdown exists, we fall through to
        // an 'Other' bucket so the chart isn't empty.
        const cv = row.custom_values || {};
        let foundAny = false;
        for (const [k, v] of Object.entries(cv)) {
          const numeric = Number(v);
          if (!Number.isFinite(numeric)) continue;
          const grade = gradeForKey(k);
          if (!grade) continue;
          foundAny = true;
          // For litres metric we add the per-grade litre directly. For
          // monetary metrics we don't have per-grade revenue, so we
          // pro-rate the row's metric by the litre share.
          let contribution = numeric;
          if (metric !== 'litres') {
            const totalRowLitres = Number(row.total_litres) || 0;
            contribution = totalRowLitres ? (numeric / totalRowLitres) * value : 0;
          }
          if (!matrix.has(grade)) matrix.set(grade, new Map());
          const inner = matrix.get(grade);
          inner.set(period, (inner.get(period) || 0) + contribution);
        }
        if (!foundAny) {
          const key = 'Combined (all grades)';
          if (!matrix.has(key)) matrix.set(key, new Map());
          const inner = matrix.get(key);
          inner.set(period, (inner.get(period) || 0) + value);
        }
      } else {
        const segKey = segmentBy === 'site'
          ? (siteNames[row.site_id] || row.site_id)
          : (row.shift_type || 'Unknown');
        if (!matrix.has(segKey)) matrix.set(segKey, new Map());
        const inner = matrix.get(segKey);
        inner.set(period, (inner.get(period) || 0) + value);
      }
    }

    const periods = Array.from(periodSet).sort();
    // Sort series by their TOTAL (descending) so the largest stack is first.
    const seriesEntries = Array.from(matrix.entries()).map(([key, inner]) => {
      const values = periods.map((p) => r2(inner.get(p) || 0));
      const total = values.reduce((s, v) => s + v, 0);
      return { key, values, total };
    });
    seriesEntries.sort((a, b) => b.total - a.total);

    return jsonWithCors({
      periods,
      series: seriesEntries.map(({ key, values }) => ({ key, values })),
      totals: { metric: r2(totalMetric), reportCount },
      metric, segmentBy, granularity, startDate, endDate,
    });
  } catch (err) {
    console.error('[timeseries] error:', err);
    return jsonWithCors(
      { error: 'Failed to compute timeseries', message: err?.message },
      { status: 500 }
    );
  }
}
