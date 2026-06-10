/**
 * Self-contained unit tests for /app/lib/financials.js.
 * Run with: node /app/scripts/test-financials.mjs
 * No test framework dependency — just assertions + a counter.
 */
import {
  computeTotals,
  sumCanonical,
  findGradeLitreFields,
  findGradeDollarFields,
  DEFAULT_TOLERANCE_PCT,
} from '../lib/financials.js';

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}
function approx(actual, expected, label, eps = 0.011) {
  const ok = Math.abs(actual - expected) <= eps;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}  (got ${actual}, want ≈${expected})`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}\n    expected ≈ ${expected}\n    actual    = ${actual}`);
  }
}
function truthy(v, label) {
  if (v) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label} (got ${v})`); }
}

// ----------------------------------------------------------------------------
console.log('\n[1] Happy path — components reconcile to total exactly');
{
  const c = computeTotals({
    fuel_sales: 3500, shop_sales: 1500, total_sales: 5000, total_revenue: 5000,
    total_litres: 2500, eftpos: 3000, motorpass: 800, cash: 1200, accounts: 0,
  });
  approx(c.total_sales, 5000, 'total_sales');
  approx(c.total_revenue, 5000, 'total_revenue === total_sales');
  approx(c.banking, 5000, 'banking');
  truthy(c.reconciles === true, 'reconciles=true');
}

// ----------------------------------------------------------------------------
console.log('\n[2] Bug case from production — total_revenue=0 but total_sales=5000');
{
  const c = computeTotals({
    fuel_sales: 3500, shop_sales: 1500, total_sales: 5000, total_revenue: 0,
    total_litres: 2500, eftpos: 3000, motorpass: 800, cash: 1200,
  });
  approx(c.total_sales, 5000, 'total_sales = derived 5000');
  approx(c.total_revenue, 5000, 'total_revenue = derived 5000 (collapsed)');
  truthy(c.reconciles === true, 'reconciles=true (typed total matches)');
}

// ----------------------------------------------------------------------------
console.log('\n[3] Mismatch — typed total wrong by more than tolerance');
{
  const c = computeTotals({
    fuel_sales: 3500, shop_sales: 1500, total_sales: 9999,
  });
  approx(c.total_sales, 5000, 'canonical wins (5000), not 9999');
  truthy(c.reconciles === false, 'reconciles=false');
  truthy(c.reconciliation_reason?.includes('total_sales_mismatch'), 'reason mentions total_sales_mismatch');
  approx(c.submitted.total_sales, 9999, 'audit trail preserves submitted 9999');
}

// ----------------------------------------------------------------------------
console.log('\n[4] Per-grade fallback — fixed fuel_sales=0, custom_values has per-grade $');
{
  const c = computeTotals({
    fuel_sales: 0, shop_sales: 1500, total_litres: 0,
    custom_values: {
      ulp_sales: 2000,
      diesel_sales: 1500,
      premium_sales: 800,
      ulp_litres: 1100,
      diesel_litres: 600,
      premium_litres: 400,
      // junk that should NOT match
      notes: 'foo', clerk_name: 'bob', shift_number: 3,
    },
  });
  approx(c.fuel_sales, 4300, 'fuel_sales summed from per-grade $ (2000+1500+800)');
  approx(c.total_litres, 2100, 'total_litres summed from per-grade L');
  approx(c.total_sales, 4300 + 1500, 'total_sales = derived fuel + shop');
  truthy(c.reconciles === true, 'reconciles=true (no typed total to compare)');
  eq(
    c._diagnostics.grade_fuel_keys.sort(),
    ['diesel_sales', 'premium_sales', 'ulp_sales'].sort(),
    'detected fuel $ keys'
  );
  eq(
    c._diagnostics.grade_litre_keys.sort(),
    ['diesel_litres', 'premium_litres', 'ulp_litres'].sort(),
    'detected litre keys'
  );
}

// ----------------------------------------------------------------------------
console.log('\n[5] Fixed column WINS when populated, even if per-grade also present');
{
  const c = computeTotals({
    fuel_sales: 9999, shop_sales: 0,
    custom_values: { ulp_sales: 100, diesel_sales: 200 },
  });
  approx(c.fuel_sales, 9999, 'fixed column 9999 wins over per-grade sum 300');
}

// ----------------------------------------------------------------------------
console.log('\n[6] Banking mismatch beyond 1% tolerance flags reconciles=false');
{
  const c = computeTotals({
    fuel_sales: 4000, shop_sales: 1000, // total = 5000
    eftpos: 3000, motorpass: 800, cash: 1500, // banking = 5300 (6% off)
  });
  truthy(c.reconciles === false, 'reconciles=false (banking off by 6%)');
  truthy(c.reconciliation_reason?.includes('banking_mismatch'), 'banking_mismatch in reason');
}

// ----------------------------------------------------------------------------
console.log('\n[7] Banking within 1% tolerance is OK');
{
  // total=5000, tolerance = 1% = $50. Banking=5040 → within tolerance.
  const c = computeTotals({
    fuel_sales: 4000, shop_sales: 1000,
    eftpos: 3040, motorpass: 800, cash: 1200,
  });
  truthy(c.reconciles === true, 'reconciles=true (banking within $50)');
}

// ----------------------------------------------------------------------------
console.log('\n[8] Custom tolerance — per-site override (5%)');
{
  // total=5000, tolerance = 5% = $250. Banking=5200 → within. Default 1% would flag it.
  const reportArgs = {
    fuel_sales: 4000, shop_sales: 1000,
    eftpos: 3200, motorpass: 800, cash: 1200,
  };
  const cDefault = computeTotals(reportArgs);
  truthy(cDefault.reconciles === false, 'default 1% flags 5200-vs-5000');
  const cLoose = computeTotals(reportArgs, { tolerancePct: 0.05 });
  truthy(cLoose.reconciles === true, 'per-site 5% accepts the same row');
}

// ----------------------------------------------------------------------------
console.log('\n[9] sumCanonical aggregates correctly across many reports');
{
  const reports = [
    { fuel_sales: 3500, shop_sales: 1500, total_sales: 5000, total_litres: 2500, eftpos: 5000, site_id: 'a' },
    { fuel_sales: 4000, shop_sales: 1000, total_sales: 5000, total_litres: 3000, eftpos: 5000, site_id: 'a' },
    { fuel_sales: 0,    shop_sales: 0,    total_sales: 0,    total_litres: 0,    site_id: 'b', custom_values: { ulp_sales: 1000, ulp_litres: 500 } },
  ];
  const s = sumCanonical(reports);
  approx(s.fuel_sales, 3500 + 4000 + 1000, 'fuel_sales');
  approx(s.shop_sales, 1500 + 1000 + 0, 'shop_sales');
  approx(s.total_sales, 5000 + 5000 + 1000, 'total_sales');
  approx(s.total_litres, 2500 + 3000 + 500, 'total_litres');
  eq(s.report_count, 3, 'report_count');
}

// ----------------------------------------------------------------------------
console.log('\n[10] sumCanonical respects per-site tolerance map');
{
  const reports = [
    // total=5000, banking=5200 (4% off). Default 1% flags it.
    { fuel_sales: 4000, shop_sales: 1000, eftpos: 5200, site_id: 'strict' },
    // same numbers but site 'loose' is configured 5% tolerance.
    { fuel_sales: 4000, shop_sales: 1000, eftpos: 5200, site_id: 'loose' },
  ];
  const s = sumCanonical(reports, { loose: 0.05, strict: 0.01 });
  eq(s.flagged_count, 1, 'only strict site flagged');
}

// ----------------------------------------------------------------------------
console.log('\n[11] Edge — empty/null report does not crash');
{
  const c = computeTotals(null);
  approx(c.total_sales, 0, 'null safe');
  truthy(c.reconciles === true, 'reconciles=true for empty');
}
{
  const c = computeTotals({});
  approx(c.total_sales, 0, 'empty object safe');
}

// ----------------------------------------------------------------------------
console.log('\n[12] Grade key heuristics — no false positives');
{
  truthy(findGradeLitreFields({ notes: 'lots of litres', total_litres: 999 }).length === 0,
    'no grade match without grade keyword');
  truthy(findGradeDollarFields({ shop_sales: 1000, beverage_sales: 100 }).length === 0,
    'shop / beverage are NOT grade matches');
  truthy(findGradeLitreFields({ ulp_litres: 100, diesel_volume: 200, e10_l: 300 }).length === 3,
    '3 grade litre keys detected');
}

// ----------------------------------------------------------------------------
console.log('\n[13] Tolerance constant sanity');
{
  truthy(DEFAULT_TOLERANCE_PCT === 0.01, 'default is 1%');
}

// ----------------------------------------------------------------------------
console.log(`\n=================== ${passed} passed / ${failed} failed ===================`);
if (failed > 0) process.exit(1);
