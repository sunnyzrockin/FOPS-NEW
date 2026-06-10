/**
 * Self-contained unit tests for /app/lib/margin.js.
 * Run with: node /app/scripts/test-margin.mjs
 */
import {
  normalisePriceToCpl, isPriceOutlier, deriveDeliveryCost,
  movingWeightedAverageCpl, timeWeightedSellCpl, classifyMargin,
  computeGradeMargin, DEFAULT_HEALTHY_CPL, DEFAULT_AMBER_CPL,
} from '../lib/margin.js';

let passed = 0, failed = 0;
function approx(actual, expected, label, eps = 0.011) {
  const ok = Math.abs(actual - expected) <= eps;
  if (ok) { passed += 1; console.log(`  ✓ ${label}  (got ${actual}, want ≈${expected})`); }
  else { failed += 1; console.error(`  ✗ ${label}\n    expected ≈ ${expected}\n    actual    = ${actual}`); }
}
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function truthy(v, label) {
  if (v) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label} (got ${v})`); }
}

console.log('\n[1] normalisePriceToCpl — cents value passes through');
approx(normalisePriceToCpl(195.5), 195.5, '195.5 cpl stays as 195.5');
approx(normalisePriceToCpl(177.13), 177.13, '177.13 stays');

console.log('\n[2] normalisePriceToCpl — dollars heuristic <10 multiplies by 100');
approx(normalisePriceToCpl(1.85), 185, '1.85 → 185 cpl');
approx(normalisePriceToCpl(2.05), 205, '2.05 → 205 cpl');
truthy(isPriceOutlier(1.85), 'isPriceOutlier(1.85) true');
truthy(!isPriceOutlier(195.5), 'isPriceOutlier(195.5) false');

console.log('\n[3] deriveDeliveryCost — cpl provided derives total');
{
  const r = deriveDeliveryCost({ unit_cost_cpl: 175, litres: 30000 });
  approx(r.unit_cost_cpl, 175, 'cpl preserved');
  approx(r.total_cost_dollars, 52500, 'total = 175*30000/100 = $52500');
}
console.log('\n[4] deriveDeliveryCost — total provided derives cpl');
{
  const r = deriveDeliveryCost({ total_cost_dollars: 52500, litres: 30000 });
  approx(r.unit_cost_cpl, 175, 'cpl = 52500*100/30000 = 175');
  approx(r.total_cost_dollars, 52500, 'total preserved');
}
console.log('\n[5] deriveDeliveryCost — both provided, cpl wins');
{
  const r = deriveDeliveryCost({ unit_cost_cpl: 175, total_cost_dollars: 99999, litres: 30000 });
  approx(r.unit_cost_cpl, 175, 'cpl trusted');
  approx(r.total_cost_dollars, 52500, 'total recomputed from cpl');
}

console.log('\n[6] movingWeightedAverageCpl — simple');
{
  // 10000 L @ 100 cpl + 30000 L @ 120 cpl = (10000*100 + 30000*120) / 40000 = 4600000/40000 = 115
  const cpl = movingWeightedAverageCpl([
    { litres: 10000, unit_cost_cpl: 100, delivered_at: '2026-06-01' },
    { litres: 30000, unit_cost_cpl: 120, delivered_at: '2026-06-15' },
  ]);
  approx(cpl, 115, 'weighted average 115 cpl');
}
console.log('\n[7] movingWeightedAverageCpl — asOf cutoff excludes future deliveries');
{
  const deliveries = [
    { litres: 10000, unit_cost_cpl: 100, delivered_at: '2026-06-01' },
    { litres: 30000, unit_cost_cpl: 120, delivered_at: '2026-06-15' },
  ];
  approx(movingWeightedAverageCpl(deliveries, '2026-06-10'), 100, 'only first delivery counted');
  approx(movingWeightedAverageCpl(deliveries, '2026-06-20'), 115, 'both counted');
}
console.log('\n[8] movingWeightedAverageCpl — empty returns null');
eq(movingWeightedAverageCpl([]), null, 'no deliveries → null');
eq(movingWeightedAverageCpl(null), null, 'null input → null');

console.log('\n[9] timeWeightedSellCpl — single price entry');
{
  const cpl = timeWeightedSellCpl([{ date: '2026-06-01', price: 185 }], '2026-06-01', '2026-06-07');
  approx(cpl, 185, 'single price 185 covers whole period');
}
console.log('\n[10] timeWeightedSellCpl — two prices, time-weighted');
{
  // 185 cpl from 06-01 through 06-04 (4 days), 195 cpl from 06-05 through 06-07 (3 days)
  // weighted = (185*4 + 195*3) / 7 = (740 + 585) / 7 = 1325/7 = ~189.286
  const cpl = timeWeightedSellCpl(
    [{ date: '2026-06-01', price: 185 }, { date: '2026-06-05', price: 195 }],
    '2026-06-01',
    '2026-06-07'
  );
  approx(cpl, 189.29, 'time-weighted 185/195 → ~189.29', 0.3);
}
console.log('\n[11] timeWeightedSellCpl — dollars-stored prices are normalised');
{
  const cpl = timeWeightedSellCpl([{ date: '2026-06-01', price: 1.85 }], '2026-06-01', '2026-06-07');
  approx(cpl, 185, '1.85 → normalised to 185 cpl');
}
console.log('\n[12] timeWeightedSellCpl — empty returns null');
eq(timeWeightedSellCpl([]), null, 'empty → null');
eq(timeWeightedSellCpl(null), null, 'null → null');

console.log('\n[13] classifyMargin — defaults');
eq(classifyMargin(10), 'healthy', '10 cpl → healthy');
eq(classifyMargin(5), 'amber', '5 cpl → amber');
eq(classifyMargin(1), 'red', '1 cpl → red');
eq(classifyMargin(null), 'unavailable', 'null → unavailable');

console.log('\n[14] classifyMargin — per-site override');
eq(classifyMargin(5, { healthy_cpl: 4, amber_cpl: 2 }), 'healthy', 'loose thresholds make 5 healthy');
eq(classifyMargin(5, { healthy_cpl: 15, amber_cpl: 10 }), 'red', 'strict thresholds make 5 red');

console.log('\n[15] computeGradeMargin — happy path');
{
  const m = computeGradeMargin({
    deliveries: [{ litres: 30000, unit_cost_cpl: 170, delivered_at: '2026-06-01' }],
    priceEntries: [{ date: '2026-06-01', price: 185 }],
    litresSold: 25000,
    startDate: '2026-06-01',
    endDate: '2026-06-07',
  });
  approx(m.cost_cpl, 170, 'cost_cpl = 170');
  approx(m.sell_cpl, 185, 'sell_cpl = 185');
  approx(m.margin_cpl, 15, 'margin = 15 cpl');
  approx(m.gross_profit_dollars, 3750, 'gross profit = 15 × 25000 / 100 = $3750');
  eq(m.status, 'healthy', 'status healthy');
}
console.log('\n[16] computeGradeMargin — no deliveries → unavailable');
{
  const m = computeGradeMargin({
    deliveries: [],
    priceEntries: [{ date: '2026-06-01', price: 185 }],
    litresSold: 25000,
    startDate: '2026-06-01',
    endDate: '2026-06-07',
  });
  eq(m.cost_cpl, null, 'cost_cpl null');
  eq(m.margin_cpl, null, 'margin null');
  eq(m.status, 'unavailable', 'status unavailable');
  truthy(m.reason?.includes('Record a delivery'), 'reason mentions Record a delivery');
}
console.log('\n[17] computeGradeMargin — cost > sell yields red + negative margin');
{
  const m = computeGradeMargin({
    deliveries: [{ litres: 30000, unit_cost_cpl: 190, delivered_at: '2026-06-01' }],
    priceEntries: [{ date: '2026-06-01', price: 185 }],
    litresSold: 25000,
    startDate: '2026-06-01',
    endDate: '2026-06-07',
  });
  approx(m.margin_cpl, -5, 'negative margin -5 cpl');
  approx(m.gross_profit_dollars, -1250, 'gross profit -$1250');
  eq(m.status, 'red', 'status red');
}
console.log('\n[18] computeGradeMargin — per-site amber threshold');
{
  const m = computeGradeMargin({
    deliveries: [{ litres: 30000, unit_cost_cpl: 180, delivered_at: '2026-06-01' }],
    priceEntries: [{ date: '2026-06-01', price: 184 }], // margin = 4 cpl
    litresSold: 25000,
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    thresholds: { healthy_cpl: 10, amber_cpl: 5 },
  });
  approx(m.margin_cpl, 4, 'margin = 4 cpl');
  eq(m.status, 'red', 'red at 5c amber threshold');
}

console.log('\n[19] Default constants sanity');
truthy(DEFAULT_HEALTHY_CPL === 8.0, 'healthy = 8.0');
truthy(DEFAULT_AMBER_CPL === 3.0, 'amber = 3.0');

console.log(`\n=================== ${passed} passed / ${failed} failed ===================`);
if (failed > 0) process.exit(1);
