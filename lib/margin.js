/**
 * lib/margin.js — Fuel margin engine (pure functions, no I/O).
 *
 * SINGLE SOURCE OF TRUTH for everything margin-related. Every endpoint and
 * UI that talks margin MUST route through these functions — same pattern
 * as lib/financials.js for revenue.
 *
 * Owner-signed-off decisions (2026-06 P2b plan):
 *   1. Cost basis = moving weighted-average over fuel_deliveries up to
 *      the asOf date. (Brief recommends this; FIFO deferred.)
 *   2. Grades shared with fuel_price_entries via lookup table (extensible).
 *   3. Normalise fuel_price_entries.price on read: value < 10 → ×100
 *      (cents-per-litre). The 2 outlier rows in production also surface
 *      in Data Integrity for cleanup at source.
 *   4. Form accepts EITHER total_cost_dollars OR unit_cost_cpl; the missing
 *      one is derived (ex-GST always).
 *   5. Status thresholds: healthy ≥ 8c / amber ≥ 3c / red < 3c (per-site
 *      override in sites.margin_healthy_cpl / margin_amber_cpl).
 *   6. Server-side subscription gating (Growth+ / Enterprise) is enforced
 *      in lib/billing.js — NOT in this pure module.
 *   7. Dip-delivery vs fuel_deliveries cross-check lives in the data
 *      integrity endpoint, NOT here.
 */

export const DEFAULT_HEALTHY_CPL = 8.0;
export const DEFAULT_AMBER_CPL = 3.0;

// Below this value, a fuel_price_entries.price is interpreted as dollars-
// per-litre and multiplied by 100 to normalise to cents-per-litre. A real
// AU fuel price of $2.00/L = 200 cpl; the normalisation kicks in well
// below any realistic cpl figure.
export const PRICE_DOLLAR_HEURISTIC_THRESHOLD = 10;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r4 = (n) => Math.round(n * 10000) / 10000;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Normalise a fuel_price_entries.price value to cents-per-litre.
 * Decision 3: values < 10 are assumed to be dollars-per-litre.
 */
export function normalisePriceToCpl(raw) {
  const n = num(raw);
  if (n <= 0) return 0;
  if (n < PRICE_DOLLAR_HEURISTIC_THRESHOLD) return r4(n * 100);
  return r4(n);
}

/** Was this raw price an outlier the heuristic had to fix? */
export function isPriceOutlier(raw) {
  const n = num(raw);
  return n > 0 && n < PRICE_DOLLAR_HEURISTIC_THRESHOLD;
}

/**
 * Derive cpl from total_cost_dollars + litres (or accept cpl directly).
 * Returns { unit_cost_cpl, total_cost_dollars } consistent pair.
 */
export function deriveDeliveryCost({ total_cost_dollars, unit_cost_cpl, litres }) {
  const L = num(litres);
  let cpl = num(unit_cost_cpl);
  let total = num(total_cost_dollars);

  if (cpl > 0 && (total === 0 || total == null)) {
    // cpl was provided; compute total = (cpl * L) / 100
    total = r2((cpl * L) / 100);
  } else if (total > 0 && cpl === 0) {
    // total was provided; compute cpl = (total / L) * 100
    cpl = L > 0 ? r4((total / L) * 100) : 0;
  } else if (cpl > 0 && total > 0) {
    // Both provided — sanity-check consistency. If they disagree by more
    // than 1c/L, trust the cpl (the per-litre figure is what feeds margin).
    const computedCpl = L > 0 ? (total / L) * 100 : cpl;
    if (Math.abs(computedCpl - cpl) > 1) {
      // Trust cpl, recompute total
      total = r2((cpl * L) / 100);
    }
  }
  return { unit_cost_cpl: r4(cpl), total_cost_dollars: r2(total) };
}

/**
 * Moving weighted-average cost (cpl) for a single grade at a single site
 * "as of" a given date.
 *
 * mwa_cpl = (sum of litres * cpl) / (sum of litres) across all deliveries
 *           with delivered_at <= asOfDate.
 *
 * If no deliveries exist on or before the asOfDate → returns null.
 */
export function movingWeightedAverageCpl(deliveries, asOfDate) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return null;
  let weightedSum = 0;
  let litresSum = 0;
  for (const d of deliveries) {
    if (asOfDate && d.delivered_at > asOfDate) continue;
    const L = num(d.litres);
    const cpl = num(d.unit_cost_cpl);
    if (L <= 0 || cpl <= 0) continue;
    weightedSum += L * cpl;
    litresSum += L;
  }
  if (litresSum === 0) return null;
  return r4(weightedSum / litresSum);
}

/**
 * Time-weighted average sell price (cpl) over a period.
 *
 * Given a list of fuel_price_entries (one per (site, date, grade)), compute
 * the average cpl over a period [startDate, endDate], weighting each price
 * by the number of days it was in effect.
 *
 * Strategy: sort entries by date asc. For each entry, the price applies
 * from its date until the next entry's date (or endDate, whichever comes
 * first). The first entry's coverage starts at startDate.
 */
export function timeWeightedSellCpl(priceEntries, startDate, endDate) {
  if (!Array.isArray(priceEntries) || priceEntries.length === 0) return null;
  // Filter and normalise
  const rows = priceEntries
    .filter((p) => p && p.date)
    .map((p) => ({
      date: p.date,
      cpl: normalisePriceToCpl(p.price),
    }))
    .filter((p) => p.cpl > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length === 0) return null;

  const start = startDate || rows[0].date;
  const end = endDate || rows[rows.length - 1].date;
  if (start > end) return null;

  // Walk forward: for each row, the price is in effect from max(row.date, start)
  // until the next row's date (or end+1).
  const startTime = Date.parse(start + 'T00:00:00Z');
  const endTime = Date.parse(end + 'T23:59:59Z');
  let totalDays = 0;
  let weighted = 0;
  for (let i = 0; i < rows.length; i++) {
    const rowStart = Math.max(Date.parse(rows[i].date + 'T00:00:00Z'), startTime);
    const rowEnd = i + 1 < rows.length
      ? Math.min(Date.parse(rows[i + 1].date + 'T00:00:00Z') - 1, endTime)
      : endTime;
    if (rowEnd < rowStart) continue;
    const days = (rowEnd - rowStart) / (1000 * 60 * 60 * 24);
    if (days <= 0) continue;
    weighted += rows[i].cpl * days;
    totalDays += days;
  }
  if (totalDays === 0) {
    // Fallback: simple average
    const avg = rows.reduce((a, r) => a + r.cpl, 0) / rows.length;
    return r4(avg);
  }
  return r4(weighted / totalDays);
}

/**
 * Classify a margin (cpl) using per-site thresholds with fall-back to
 * library defaults.
 */
export function classifyMargin(marginCpl, opts = {}) {
  const healthy = num(opts.healthy_cpl) > 0 ? num(opts.healthy_cpl) : DEFAULT_HEALTHY_CPL;
  const amber = num(opts.amber_cpl) > 0 ? num(opts.amber_cpl) : DEFAULT_AMBER_CPL;
  if (marginCpl == null || !Number.isFinite(marginCpl)) return 'unavailable';
  if (marginCpl >= healthy) return 'healthy';
  if (marginCpl >= amber) return 'amber';
  return 'red';
}

/**
 * Compute margin for one (site, grade) over a period.
 *
 * @param {Object} args
 * @param {Array}  args.deliveries     fuel_deliveries rows for site+grade
 * @param {Array}  args.priceEntries   fuel_price_entries rows for site+grade
 * @param {number} args.litresSold     metered litres sold in the period
 * @param {string} args.startDate      YYYY-MM-DD
 * @param {string} args.endDate        YYYY-MM-DD
 * @param {Object} [args.thresholds]   { healthy_cpl, amber_cpl }
 *
 * Returns:
 *   {
 *     cost_cpl: number|null,            // moving weighted average up to endDate
 *     sell_cpl: number|null,            // time-weighted over period
 *     margin_cpl: number|null,          // sell - cost
 *     litres_sold: number,
 *     gross_profit_dollars: number|null,// margin_cpl * litres_sold / 100
 *     status: 'healthy'|'amber'|'red'|'unavailable',
 *     reason: string|null,
 *   }
 */
export function computeGradeMargin({ deliveries, priceEntries, litresSold, startDate, endDate, thresholds }) {
  const costCpl = movingWeightedAverageCpl(deliveries || [], endDate);
  const sellCpl = timeWeightedSellCpl(priceEntries || [], startDate, endDate);
  const L = num(litresSold);

  if (costCpl == null) {
    return {
      cost_cpl: null,
      sell_cpl: sellCpl,
      margin_cpl: null,
      litres_sold: r2(L),
      gross_profit_dollars: null,
      status: 'unavailable',
      reason: 'No fuel deliveries with cost recorded for this grade. Record a delivery to enable margin tracking.',
    };
  }
  if (sellCpl == null) {
    return {
      cost_cpl: costCpl,
      sell_cpl: null,
      margin_cpl: null,
      litres_sold: r2(L),
      gross_profit_dollars: null,
      status: 'unavailable',
      reason: 'No fuel price entries recorded for this grade in this period.',
    };
  }

  const marginCpl = r4(sellCpl - costCpl);
  const grossProfit = r2((marginCpl * L) / 100);
  return {
    cost_cpl: costCpl,
    sell_cpl: sellCpl,
    margin_cpl: marginCpl,
    litres_sold: r2(L),
    gross_profit_dollars: grossProfit,
    status: classifyMargin(marginCpl, thresholds || {}),
    reason: null,
  };
}

export const FUEL_MARGIN_VERSION = '1.0.0';
