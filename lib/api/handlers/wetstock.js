/**
 * Wet-stock reconciliation handler — P2a.
 *
 * GET /api/wetstock/reconciliation?siteIds=&startDate=&endDate=
 *
 * For each (site, grade) pair in the requested range, computes:
 *
 *   book_movement   = opening_level - closing_level + sum(deliveries)
 *   metered_sales   = sum of per-grade litres sold from shift_reports.custom_values
 *   variance_litres = metered_sales - book_movement
 *   variance_pct    = variance_litres / metered_sales        (negative = LOSS)
 *   status          = ok | watch | alert | no_metered_sales | no_dips
 *
 * Tolerance comes from sites.wetstock_tolerance_pct (default 0.5%). Variance
 * between 1x and 3x the tolerance is 'watch'; above 3x is 'alert'.
 *
 * Auth: owner OR operator. Operators are scoped to their assigned sites via
 * getAllowedSiteIds (same intersection convention as every other dashboard).
 */

import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { corsHeaders } from '@/lib/api/cors';
import { findGradeLitreFields } from '@/lib/financials';

export const DEFAULT_WETSTOCK_TOLERANCE_PCT = 0.005; // 0.5%

const FIXED_GRADES = [
  { key: 'ulp',     label: 'ULP 91',  levelCol: 'ulp_litres',     deliveryCol: 'deliveries_ulp_litres',     match: /(?:^|[_\s-])(?:ulp|u91|unleaded)(?:[_\s-]|$)/i },
  { key: 'diesel',  label: 'Diesel',  levelCol: 'diesel_litres',  deliveryCol: 'deliveries_diesel_litres',  match: /(?:^|[_\s-])(?:diesel|dsl)(?:[_\s-]|$)/i },
  { key: 'premium', label: 'Premium', levelCol: 'premium_litres', deliveryCol: 'deliveries_premium_litres', match: /(?:^|[_\s-])(?:premium|u95|p95|u98|p98)(?:[_\s-]|$)/i },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

/** Classify variance against a per-site tolerance. */
function classify(variancePct, tolerancePct) {
  const abs = Math.abs(variancePct);
  if (abs <= tolerancePct) return 'ok';
  if (abs <= tolerancePct * 3) return 'watch';
  return 'alert';
}

/** Pull all dip rows for a site in a date range, in chronological order. */
async function fetchDips(db, siteIds, startISO, endISO) {
  let q = db
    .from('dip_readings')
    .select('site_id, reading_time, reading_label, ulp_litres, diesel_litres, premium_litres, deliveries_ulp_litres, deliveries_diesel_litres, deliveries_premium_litres, custom_values')
    .in('site_id', siteIds)
    .order('reading_time', { ascending: true });
  if (startISO) q = q.gte('reading_time', startISO);
  if (endISO) q = q.lte('reading_time', endISO);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Pull all shift reports for a site in a date range. */
async function fetchReports(db, siteIds, startDate, endDate) {
  let q = db
    .from('shift_reports')
    .select('site_id, date, total_litres, custom_values')
    .in('site_id', siteIds);
  if (startDate) q = q.gte('date', startDate);
  if (endDate) q = q.lte('date', endDate);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Sum litres sold for a given grade match-regex from a list of reports.
 * Falls back to null if no per-grade litres are found (so the UI can
 * distinguish "zero sold" from "no per-grade data recorded").
 */
function sumMeteredSalesForGrade(reports, matchRegex) {
  let total = 0;
  let found = 0;
  for (const r of reports) {
    const cv = r?.custom_values || {};
    for (const [k, v] of Object.entries(cv)) {
      if (!matchRegex.test(k)) continue;
      // Only litre-shaped keys (volume/L)
      if (!/(?:litre|liter|volume|^l$|_l$|\bL\b)/i.test(k)) continue;
      const n = num(v);
      if (n > 0) { total += n; found += 1; }
    }
  }
  return { litres: r2(total), count: found };
}

/** Compute a per-grade reconciliation for a single site. */
function reconcileGradeFromDips(grade, siteDips, siteReports, tolerancePct) {
  // Need at least 2 readings with a level for this grade to define a movement window.
  const withLevel = siteDips.filter((d) => d[grade.levelCol] != null);
  if (withLevel.length < 2) {
    return {
      grade: grade.label,
      grade_key: grade.key,
      status: 'no_dips',
      reason: 'Need at least 2 dip readings for this grade in the period to compute book movement.',
      opening_level: withLevel[0]?.[grade.levelCol] ?? null,
      closing_level: withLevel[withLevel.length - 1]?.[grade.levelCol] ?? null,
      deliveries: r2(siteDips.reduce((a, d) => a + num(d[grade.deliveryCol]), 0)),
      book_movement: null,
      metered_sales: null,
      variance_litres: null,
      variance_pct: null,
      reading_count: withLevel.length,
    };
  }

  const opening = num(withLevel[0][grade.levelCol]);
  const closing = num(withLevel[withLevel.length - 1][grade.levelCol]);
  const deliveries = r2(siteDips.reduce((a, d) => a + num(d[grade.deliveryCol]), 0));
  const bookMovement = r2(opening - closing + deliveries);

  const { litres: meteredSales, count: meteredCount } =
    sumMeteredSalesForGrade(siteReports, grade.match);

  if (meteredCount === 0 || meteredSales <= 0) {
    return {
      grade: grade.label,
      grade_key: grade.key,
      status: 'no_metered_sales',
      reason:
        'No per-grade pump sales recorded for this grade. Add a per-grade litres field on the shift report (e.g. "ulp_litres") so reconciliation can run.',
      opening_level: opening,
      closing_level: closing,
      deliveries,
      book_movement: bookMovement,
      metered_sales: null,
      variance_litres: null,
      variance_pct: null,
      reading_count: withLevel.length,
    };
  }

  const variance = r2(meteredSales - bookMovement);
  const variancePct = meteredSales > 0 ? variance / meteredSales : 0;
  const status = classify(variancePct, tolerancePct);

  return {
    grade: grade.label,
    grade_key: grade.key,
    status,
    reason: null,
    opening_level: opening,
    closing_level: closing,
    deliveries,
    book_movement: bookMovement,
    metered_sales: meteredSales,
    variance_litres: variance,
    variance_pct: Math.round(variancePct * 10000) / 10000, // 4 decimal places
    reading_count: withLevel.length,
    tolerance_pct: tolerancePct,
  };
}

export async function handleWetstockReconciliation(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    if (!['owner', 'operator'].includes(auth.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions', current: auth.user.role, required: ['owner', 'operator'] },
        { status: 403, headers: corsHeaders }
      );
    }

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
        { summary: { sites: 0, ok: 0, watch: 0, alert: 0, no_data: 0 }, sites: [] },
        { headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;

    // For dips we use reading_time (TIMESTAMPTZ), so widen the boundaries to
    // include the whole day in the user-supplied date strings.
    const startISO = startDate ? `${startDate}T00:00:00Z` : null;
    const endISO = endDate ? `${endDate}T23:59:59Z` : null;

    const [sitesRows, tolRows, dipsAll, reportsAll, fieldConfigsRows] = await Promise.all([
      db.from('sites').select('id, name, code').in('id', siteIds),
      // Per-site tolerance override lives in a column added by the additive P2a
      // migration. If the column doesn't exist yet (pre-migration), we
      // silently fall back to the default tolerance for every site.
      db.from('sites').select('id, wetstock_tolerance_pct').in('id', siteIds).then(
        (r) => r,
        () => ({ data: [], error: null })
      ),
      fetchDips(db, siteIds, startISO, endISO),
      fetchReports(db, siteIds, startDate, endDate),
      // Bug #4: load each site's configured dip fields so we know whether
      // the site uses the legacy fixed grades (ULP/Diesel/Premium) or has
      // its own custom grade dictionary. We must NOT emit fixed-grade
      // rows for sites that use custom grades (would render 3 noise
      // 'no_dips' rows above the real grades — KINGSTHORPE showed 7).
      db.from('site_field_configs')
        .select('site_id, key, category')
        .in('site_id', siteIds)
        .eq('category', 'dip')
        .then((r) => r, () => ({ data: [], error: null })),
    ]);
    if (sitesRows.error) throw sitesRows.error;
    const sites = sitesRows.data || [];
    const toleranceMap = new Map();
    for (const row of (tolRows?.data || [])) {
      const t = Number(row.wetstock_tolerance_pct);
      if (Number.isFinite(t) && t > 0) toleranceMap.set(row.id, t);
    }

    // Bug #4: build a per-site map of "has custom dip fields configured?".
    // When true, skip the fixed-grade triplet entirely.
    const customDipSitesSet = new Set(
      (fieldConfigsRows?.data || []).map((r) => r.site_id)
    );

    const siteOut = [];
    const summary = { sites: 0, ok: 0, watch: 0, alert: 0, no_data: 0 };

    for (const site of sites) {
      const tol = toleranceMap.get(site.id);
      const tolerancePct =
        Number.isFinite(tol) && tol > 0 ? tol : DEFAULT_WETSTOCK_TOLERANCE_PCT;

      const siteDips = dipsAll.filter((d) => d.site_id === site.id);
      const siteReports = reportsAll.filter((r) => r.site_id === site.id);

      // Bug #4: when the site has configured custom dip fields, the
      // legacy fixed grades (ULP/Diesel/Premium) are never populated for
      // it and would only produce 3 noise 'no_dips' rows. Skip them.
      const hasCustomDipFields = customDipSitesSet.has(site.id);
      const grades = hasCustomDipFields
        ? []
        : FIXED_GRADES.map((g) =>
            reconcileGradeFromDips(g, siteDips, siteReports, tolerancePct)
          );

      // Custom grades from dip_readings.custom_values (e.g. e10, lpg_autogas)
      const customGradeKeys = new Set();
      for (const d of siteDips) {
        const cv = d?.custom_values || {};
        for (const k of Object.keys(cv)) {
          const entry = cv[k];
          if (entry && entry.level != null) customGradeKeys.add(k);
        }
      }
      for (const ck of customGradeKeys) {
        const withLevel = siteDips
          .map((d) => ({ d, lvl: num(d?.custom_values?.[ck]?.level) }))
          .filter((x) => x.lvl > 0);
        if (withLevel.length < 2) {
          grades.push({
            grade: ck.replace(/_/g, ' ').toUpperCase(),
            grade_key: ck,
            status: 'no_dips',
            reason: 'Need at least 2 dip readings for this grade in the period.',
            opening_level: withLevel[0]?.lvl ?? null,
            closing_level: withLevel[withLevel.length - 1]?.lvl ?? null,
            deliveries: r2(siteDips.reduce((a, d) => a + num(d?.custom_values?.[ck]?.delivery), 0)),
            book_movement: null,
            metered_sales: null,
            variance_litres: null,
            variance_pct: null,
            reading_count: withLevel.length,
          });
          continue;
        }
        const opening = withLevel[0].lvl;
        const closing = withLevel[withLevel.length - 1].lvl;
        const deliveries = r2(
          siteDips.reduce((a, d) => a + num(d?.custom_values?.[ck]?.delivery), 0)
        );
        const bookMovement = r2(opening - closing + deliveries);
        // Match metered sales by the custom grade key itself (e.g. "e10")
        const matchRegex = new RegExp(`(?:^|[_\\s-])${ck.replace(/[_-]/g, '[_\\s-]?')}(?:[_\\s-]|$)`, 'i');
        const { litres: meteredSales, count: meteredCount } =
          sumMeteredSalesForGrade(siteReports, matchRegex);

        if (meteredCount === 0 || meteredSales <= 0) {
          grades.push({
            grade: ck.replace(/_/g, ' ').toUpperCase(),
            grade_key: ck,
            status: 'no_metered_sales',
            reason: 'No per-grade pump sales recorded for this grade.',
            opening_level: opening,
            closing_level: closing,
            deliveries,
            book_movement: bookMovement,
            metered_sales: null,
            variance_litres: null,
            variance_pct: null,
            reading_count: withLevel.length,
          });
          continue;
        }

        const variance = r2(meteredSales - bookMovement);
        const variancePct = meteredSales > 0 ? variance / meteredSales : 0;
        const status = classify(variancePct, tolerancePct);
        grades.push({
          grade: ck.replace(/_/g, ' ').toUpperCase(),
          grade_key: ck,
          status,
          reason: null,
          opening_level: opening,
          closing_level: closing,
          deliveries,
          book_movement: bookMovement,
          metered_sales: meteredSales,
          variance_litres: variance,
          variance_pct: Math.round(variancePct * 10000) / 10000,
          reading_count: withLevel.length,
          tolerance_pct: tolerancePct,
        });
      }

      // Per-site summary
      const siteSummary = { ok: 0, watch: 0, alert: 0, no_data: 0 };
      for (const g of grades) {
        if (g.status === 'ok') siteSummary.ok += 1;
        else if (g.status === 'watch') siteSummary.watch += 1;
        else if (g.status === 'alert') siteSummary.alert += 1;
        else siteSummary.no_data += 1;
      }
      // Aggregate to the overall summary
      summary.sites += 1;
      summary.ok += siteSummary.ok;
      summary.watch += siteSummary.watch;
      summary.alert += siteSummary.alert;
      summary.no_data += siteSummary.no_data;

      siteOut.push({
        site_id: site.id,
        site_name: site.name,
        site_code: site.code || null,
        tolerance_pct: tolerancePct,
        startDate: startDate || null,
        endDate: endDate || null,
        reading_count: siteDips.length,
        report_count: siteReports.length,
        grades,
        site_summary: siteSummary,
      });
    }

    return NextResponse.json(
      { summary, sites: siteOut },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[wetstock] failed:', err);
    return NextResponse.json(
      { error: 'Failed to compute wet-stock reconciliation', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
