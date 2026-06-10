/**
 * lib/financials.js — canonical financial model for FOPS shift reports.
 *
 * SINGLE SOURCE OF TRUTH.
 * Every dashboard, export, KPI, and PDF MUST route through `computeTotals()`.
 * No endpoint is allowed to re-implement revenue / fuel / litres aggregation.
 *
 * Decisions (signed off by owner — see /app/memory/P1_FINDINGS_REPORT.md):
 *   1. total_revenue ≡ total_sales (collapsed; column kept for compat but
 *      ignored at read time).
 *   2. Enforcement at entry: WARN + flag (do not hard-block).
 *   3. Per-grade dollar / litre fields in custom_values are FOLDED INTO totals
 *      when the fixed column is 0.
 *   4. Existing rows are NOT backfilled; canonical totals are recomputed on
 *      every read. Original entered values are preserved in
 *      custom_values._submitted_totals for the audit trail.
 *   5. Reconciliation tolerance = 1% of canonical total_sales (per-site
 *      override available via sites.reconcile_tolerance_pct).
 *   6. Only fuel_sales + shop_sales are top-level categories.
 *   7. drive_offs / dips are informational — NOT subtracted from revenue.
 *
 * This module is PURE (no I/O, no env reads, no DB calls). Safe to unit test.
 */

// ---------- helpers ----------------------------------------------------------
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** Default tolerance: 1% of total_sales, with a $0.50 floor to absorb FP noise. */
export const DEFAULT_TOLERANCE_PCT = 0.01;
export const TOLERANCE_FLOOR_DOLLARS = 0.50;

// ---------- per-grade key detection ------------------------------------------
//
// Operators configure dynamic per-grade fields via site_field_configs. The key
// is free-text; the heuristics below recognise the common patterns we've seen
// across our seed data + the existing volume-by-grade chart (executive-
// dashboard.js / timeseries.js).
//
// Examples that match as LITRE fields:
//   ulp_litres, diesel_litres, premium_litres, e10_litres, u91_litres,
//   ulp_volume, diesel_volume, lpg_litres
//
// Examples that match as DOLLAR fields:
//   ulp_sales, diesel_sales, premium_sales, e10_sales, u91_amount,
//   diesel_revenue, premium_dollars

const GRADE_REGEX =
  /(?:^|[_\s-])(?:ulp|u91|e10|u95|p95|u98|p98|premium|diesel|dsl|lpg|autogas|biodiesel|b20)(?:[_\s-]|$)/i;
const LITRE_INDICATOR = /(?:litre|liter|volume|^l$|_l$|\bL\b)/i;
const DOLLAR_INDICATOR = /(?:sales|revenue|amount|amt|dollars?|\$)/i;

function isGradeLitreKey(key) {
  if (typeof key !== 'string') return false;
  return GRADE_REGEX.test(key) && LITRE_INDICATOR.test(key);
}
function isGradeDollarKey(key) {
  if (typeof key !== 'string') return false;
  return GRADE_REGEX.test(key) && DOLLAR_INDICATOR.test(key);
}

/** Returns [{ key, value }] for per-grade litre fields found in custom_values. */
export function findGradeLitreFields(customValues) {
  if (!customValues || typeof customValues !== 'object') return [];
  return Object.entries(customValues)
    .filter(([k]) => isGradeLitreKey(k))
    .map(([k, v]) => ({ key: k, value: num(v) }))
    .filter((x) => x.value > 0);
}

/** Returns [{ key, value }] for per-grade dollar fields found in custom_values. */
export function findGradeDollarFields(customValues) {
  if (!customValues || typeof customValues !== 'object') return [];
  return Object.entries(customValues)
    .filter(([k]) => isGradeDollarKey(k))
    .map(([k, v]) => ({ key: k, value: num(v) }))
    .filter((x) => x.value > 0);
}

// ---------- canonical totals -------------------------------------------------

/**
 * Compute canonical totals for a single shift_reports row.
 *
 * @param {Object} report Raw shift_reports row (including custom_values JSONB).
 * @param {Object} [opts]
 * @param {number} [opts.tolerancePct]   Reconciliation tolerance as a fraction
 *                                       of total_sales. Defaults to
 *                                       DEFAULT_TOLERANCE_PCT (0.01 = 1%).
 *                                       Set this from sites.reconcile_tolerance_pct.
 * @returns Canonical totals + reconciles flag + diagnostics.
 *
 * NB: This is a READ-MODEL function. It does NOT mutate the report. The entry
 * pipeline calls this and writes the result back to the row; the read pipeline
 * calls this and uses the result directly without writing.
 */
export function computeTotals(report, opts = {}) {
  const tolerancePct =
    typeof opts.tolerancePct === 'number' && opts.tolerancePct >= 0
      ? opts.tolerancePct
      : DEFAULT_TOLERANCE_PCT;

  const cv = report?.custom_values || {};

  // ---- Components -----------------------------------------------------------
  const submittedFuel = num(report?.fuel_sales);
  const submittedShop = num(report?.shop_sales);
  const submittedTotalSales = num(report?.total_sales);
  const submittedTotalRevenue = num(report?.total_revenue);
  const submittedTotalLitres = num(report?.total_litres);

  const gradeFuelFields = findGradeDollarFields(cv);
  const gradeLitreFields = findGradeLitreFields(cv);
  const summedGradeFuel = gradeFuelFields.reduce((a, x) => a + x.value, 0);
  const summedGradeLitres = gradeLitreFields.reduce((a, x) => a + x.value, 0);

  // Decision 3: prefer fixed column; if zero, fall back to per-grade sum.
  const canonicalFuel = submittedFuel > 0 ? submittedFuel : summedGradeFuel;
  const canonicalShop = submittedShop; // shop has no per-grade fallback
  const canonicalLitres =
    submittedTotalLitres > 0 ? submittedTotalLitres : summedGradeLitres;

  // Decision 1: total_sales is DERIVED from components.
  // Decision 1: total_revenue ≡ total_sales.
  const canonicalTotal = canonicalFuel + canonicalShop;
  const canonicalRevenue = canonicalTotal;

  // Banking (unchanged convention)
  const banking =
    num(report?.eftpos) +
    num(report?.motorpass) +
    num(report?.cash) +
    num(report?.accounts);

  // ---- Reconciliation -------------------------------------------------------
  // Tolerance = max(1% of canonical, $0.50 floor) — per Decision 5.
  const tolerance = Math.max(
    canonicalTotal * tolerancePct,
    TOLERANCE_FLOOR_DOLLARS
  );

  let reconciles = true;
  const reasons = [];

  // Mismatch: typed total_sales ≠ derived
  if (submittedTotalSales > 0 && Math.abs(submittedTotalSales - canonicalTotal) > tolerance) {
    reconciles = false;
    reasons.push(
      `total_sales_mismatch: typed $${round2(submittedTotalSales)} vs computed $${round2(canonicalTotal)}`
    );
  }
  // Mismatch: typed total_revenue ≠ derived
  if (
    submittedTotalRevenue > 0 &&
    Math.abs(submittedTotalRevenue - canonicalTotal) > tolerance
  ) {
    reconciles = false;
    reasons.push(
      `total_revenue_mismatch: typed $${round2(submittedTotalRevenue)} vs computed $${round2(canonicalTotal)}`
    );
  }
  // Mismatch: banking ≠ derived (only meaningful when both are populated)
  if (canonicalTotal > 0 && banking > 0 && Math.abs(banking - canonicalTotal) > tolerance) {
    reconciles = false;
    reasons.push(
      `banking_mismatch: banking $${round2(banking)} vs total $${round2(canonicalTotal)}`
    );
  }
  // Sanity: components are zero but a total was typed
  if (canonicalTotal === 0 && (submittedTotalSales > 0 || submittedTotalRevenue > 0)) {
    reconciles = false;
    reasons.push('total_typed_without_components');
  }

  return {
    // Canonical values — USE THESE for every aggregation
    fuel_sales: round2(canonicalFuel),
    shop_sales: round2(canonicalShop),
    total_sales: round2(canonicalTotal),
    total_revenue: round2(canonicalRevenue), // === total_sales
    total_litres: round2(canonicalLitres),
    banking: round2(banking),

    // Reconciliation
    reconciles,
    reconciliation_reason: reasons.length ? reasons.join('; ') : null,

    // Audit trail — the user's instruction was "preserve the original entered
    // values" so dashboards can show "you typed X, we computed Y".
    submitted: {
      fuel_sales: round2(submittedFuel),
      shop_sales: round2(submittedShop),
      total_sales: round2(submittedTotalSales),
      total_revenue: round2(submittedTotalRevenue),
      total_litres: round2(submittedTotalLitres),
    },

    // Diagnostics (debugging only)
    _diagnostics: {
      summed_grade_fuel: round2(summedGradeFuel),
      summed_grade_litres: round2(summedGradeLitres),
      grade_fuel_keys: gradeFuelFields.map((x) => x.key),
      grade_litre_keys: gradeLitreFields.map((x) => x.key),
      tolerance_dollars: round2(tolerance),
      tolerance_pct: tolerancePct,
    },
  };
}

// ---------- aggregation helpers ----------------------------------------------

/**
 * Sum canonical totals across many reports. Used by every dashboard endpoint
 * so the SAME inputs always yield the SAME totals. No re-implementation.
 *
 * @param {Array} reports         Raw shift_reports rows.
 * @param {Map|Object} [siteToleranceMap] Optional `siteId → tolerancePct` so
 *        each report uses its site's configured tolerance.
 */
export function sumCanonical(reports, siteToleranceMap = null) {
  const acc = {
    fuel_sales: 0,
    shop_sales: 0,
    total_sales: 0,
    total_revenue: 0,
    total_litres: 0,
    banking: 0,
    drive_offs: 0,
    report_count: 0,
    flagged_count: 0,
  };
  if (!Array.isArray(reports)) return acc;

  const getTol = (siteId) => {
    if (!siteToleranceMap) return DEFAULT_TOLERANCE_PCT;
    if (siteToleranceMap instanceof Map) return siteToleranceMap.get(siteId) ?? DEFAULT_TOLERANCE_PCT;
    return siteToleranceMap[siteId] ?? DEFAULT_TOLERANCE_PCT;
  };

  for (const r of reports) {
    const c = computeTotals(r, { tolerancePct: getTol(r.site_id) });
    acc.fuel_sales += c.fuel_sales;
    acc.shop_sales += c.shop_sales;
    acc.total_sales += c.total_sales;
    acc.total_revenue += c.total_revenue;
    acc.total_litres += c.total_litres;
    acc.banking += c.banking;
    acc.drive_offs += num(r.drive_offs);
    acc.report_count += 1;
    if (!c.reconciles) acc.flagged_count += 1;
  }

  // Round once at the end for clean display
  return {
    fuel_sales: round2(acc.fuel_sales),
    shop_sales: round2(acc.shop_sales),
    total_sales: round2(acc.total_sales),
    total_revenue: round2(acc.total_revenue),
    total_litres: round2(acc.total_litres),
    banking: round2(acc.banking),
    drive_offs: round2(acc.drive_offs),
    report_count: acc.report_count,
    flagged_count: acc.flagged_count,
  };
}

/**
 * Convenience: pull the canonical "revenue" for one report.
 * Use this anywhere code currently does `Number(r.total_revenue) || Number(r.total_sales)`.
 */
export function revenueFor(report, opts) {
  return computeTotals(report, opts).total_sales;
}

/**
 * Returns the canonical SELECT list of columns we need from shift_reports to
 * compute totals correctly. Use this in dashboard queries to ensure every
 * endpoint fetches the same fields.
 */
export const CANONICAL_SHIFT_REPORT_COLUMNS = [
  'id', 'site_id', 'date', 'shift_type', 'status',
  'total_sales', 'total_revenue', 'fuel_sales', 'shop_sales', 'total_litres',
  'eftpos', 'motorpass', 'cash', 'accounts',
  'drive_offs', 'dips',
  'custom_values',
  'reconciles', 'reconciliation_reason', 'submitted_totals',
].join(', ');
