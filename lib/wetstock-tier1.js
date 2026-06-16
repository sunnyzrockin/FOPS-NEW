/**
 * lib/wetstock-tier1.js — pure reconciliation math for Tier 1
 * daily tank reconciliation.
 *
 * No I/O, no Supabase calls — the same helpers are used by the API
 * handler, the engine that runs on shift submit, and the test suite.
 *
 * STATUSES (per-tank, per-day):
 *   green        — |variance_pct| <= tolerance_pct
 *   amber        — |variance_pct| <= 2 * tolerance_pct
 *   red          — |variance_pct| >  2 * tolerance_pct
 *   no_data      — neither sales nor actual_closing recorded
 *   broken_chain — prior-day closing missing → opening_litres is a manual input,
 *                  status surfaces the chain break for operator attention.
 */

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Classify a tank reconciliation row given its inputs and tolerance.
 *
 * Returns the fully-computed row shape (mirroring `tank_reconciliation`
 * columns minus id/created_at/updated_at).
 *
 * @param {Object} input
 *   - tank_id, site_id, date  (echoed through)
 *   - opening_litres, delivery_litres, sales_litres, actual_closing
 *   - tolerance_pct           (per-tank, falls back to 0.5%)
 *   - chain_broken            (true when prior-day closing missing)
 *   - notes                   (optional)
 */
export function reconcileTank(input) {
  const tolerance_pct = toNum(input.tolerance_pct ?? 0.5);
  const opening_litres = toNum(input.opening_litres);
  const delivery_litres = toNum(input.delivery_litres);
  const sales_litres = toNum(input.sales_litres);
  const hasActual = input.actual_closing !== null && input.actual_closing !== undefined && input.actual_closing !== '';
  const actual_closing = hasActual ? toNum(input.actual_closing) : null;

  const expected_closing = opening_litres + delivery_litres - sales_litres;

  const haveAny = sales_litres > 0 || hasActual;
  let variance_litres = null;
  let variance_pct = null;
  let status = 'no_data';

  if (hasActual) {
    variance_litres = Math.round((actual_closing - expected_closing) * 100) / 100;
    if (sales_litres > 0) {
      variance_pct = Math.round((variance_litres / sales_litres) * 10000) / 100; // percent, 2dp
    } else {
      variance_pct = null; // can't divide by zero sales
    }
  }

  if (input.chain_broken) {
    status = 'broken_chain';
  } else if (variance_pct === null) {
    status = haveAny ? 'no_data' : 'no_data';
  } else {
    const abs = Math.abs(variance_pct);
    if (abs <= tolerance_pct) status = 'green';
    else if (abs <= 2 * tolerance_pct) status = 'amber';
    else status = 'red';
  }

  return {
    tank_id: input.tank_id,
    site_id: input.site_id,
    date: input.date,
    opening_litres,
    delivery_litres,
    sales_litres,
    actual_closing,
    expected_closing: Math.round(expected_closing * 100) / 100,
    variance_litres,
    variance_pct,
    status,
    chain_broken: !!input.chain_broken,
    notes: input.notes || null,
  };
}

/**
 * Aggregate per-tank reconciliation rows for a single site/day into the
 * shape the dashboard table consumes (status pill counts, totals).
 */
export function summariseSiteDay(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = { green: 0, amber: 0, red: 0, no_data: 0, broken_chain: 0 };
  let totalSales = 0;
  let totalVarianceL = 0;
  for (const r of list) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalSales += toNum(r.sales_litres);
    totalVarianceL += toNum(r.variance_litres);
  }
  return {
    tanks_total: list.length,
    within_tolerance: counts.green,
    counts,
    total_sales_litres: Math.round(totalSales * 100) / 100,
    total_variance_litres: Math.round(totalVarianceL * 100) / 100,
  };
}

/**
 * The validation/UX helper used by the staff wizard before submit.
 * Returns a list of human-readable warnings (empty when all clear).
 */
export function validateTankEntry({ opening_litres, delivery_litres, sales_litres, actual_closing, capacity_litres }) {
  const warnings = [];
  const opening = toNum(opening_litres);
  const delivery = toNum(delivery_litres);
  const sales = toNum(sales_litres);
  const cap = toNum(capacity_litres);
  const actual = actual_closing == null || actual_closing === '' ? null : toNum(actual_closing);

  if (sales < 0) warnings.push('Litres sold can\'t be negative.');
  if (actual != null && (actual < 0 || (cap > 0 && actual > cap))) {
    warnings.push('Dip reading is outside the tank capacity range.');
  }
  if (sales > opening + delivery + 0.01) {
    warnings.push('Litres sold is greater than available stock (opening + delivery). Re-check the POS sales figure.');
  }
  if (actual != null && sales > 0) {
    const expected = opening + delivery - sales;
    const variance = actual - expected;
    const pct = (variance / sales) * 100;
    if (Math.abs(pct) > 2) {
      warnings.push(`Variance of ${pct.toFixed(2)}% (${variance.toFixed(0)} L) — please double-check the dip reading before submitting.`);
    }
  }
  return warnings;
}

export default { reconcileTank, summariseSiteDay, validateTankEntry };
