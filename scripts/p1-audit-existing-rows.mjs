/**
 * scripts/p1-audit-existing-rows.mjs
 *
 * Per the user's instruction: "log original-entered vs canonical-computed for
 * the 38 existing rows so we can see what changed."
 *
 * Reads every shift_reports row, runs computeTotals() against it, and prints
 * a clear diff of submitted vs canonical. Also writes the result to
 * /app/memory/p1-audit-results.json so we can compare before/after a
 * production deploy. NO ROWS ARE MUTATED — this is a pure read.
 *
 * Run:  node /app/scripts/p1-audit-existing-rows.mjs
 */
import fs from 'node:fs';
import dotenv from 'node:fs';

import { computeTotals } from '../lib/financials.js';

// Load .env without dotenv (single-file constraint)
const envText = fs.readFileSync('/app/.env', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m) env[m[1]] = m[2];
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

async function rest(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} ${await r.text()}`);
  return r.json();
}

const fmt$ = (n) => `$${(Math.round(Number(n) * 100) / 100).toFixed(2)}`;
const fmtL = (n) => `${(Math.round(Number(n) * 100) / 100).toFixed(2)} L`;

const rows = await rest(
  'shift_reports?select=id,site_id,date,shift_type,status,total_sales,total_revenue,fuel_sales,shop_sales,total_litres,eftpos,motorpass,cash,accounts,custom_values&order=date.asc&limit=2000'
);
const sites = await rest('sites?select=id,name,code');
const siteName = Object.fromEntries(sites.map((s) => [s.id, s.code || s.name]));

const results = [];
let unchanged = 0,
  changedTotals = 0,
  changedRevenue = 0,
  changedLitres = 0,
  changedFuel = 0,
  reconciles = 0,
  flagged = 0;

for (const r of rows) {
  const c = computeTotals(r);
  const sub = c.submitted;
  const diff = {
    id: r.id,
    site: siteName[r.site_id] || r.site_id,
    date: r.date,
    shift: r.shift_type,
    submitted: sub,
    canonical: {
      fuel_sales: c.fuel_sales,
      shop_sales: c.shop_sales,
      total_sales: c.total_sales,
      total_revenue: c.total_revenue,
      total_litres: c.total_litres,
      banking: c.banking,
    },
    reconciles: c.reconciles,
    reason: c.reconciliation_reason,
    delta: {
      total_sales: c.total_sales - sub.total_sales,
      total_revenue: c.total_revenue - sub.total_revenue,
      fuel_sales: c.fuel_sales - sub.fuel_sales,
      total_litres: c.total_litres - sub.total_litres,
    },
  };
  results.push(diff);

  const anyChange =
    Math.abs(diff.delta.total_sales) > 0.01 ||
    Math.abs(diff.delta.total_revenue) > 0.01 ||
    Math.abs(diff.delta.fuel_sales) > 0.01 ||
    Math.abs(diff.delta.total_litres) > 0.01;
  if (!anyChange) unchanged += 1;
  if (Math.abs(diff.delta.total_sales) > 0.01) changedTotals += 1;
  if (Math.abs(diff.delta.total_revenue) > 0.01) changedRevenue += 1;
  if (Math.abs(diff.delta.total_litres) > 0.01) changedLitres += 1;
  if (Math.abs(diff.delta.fuel_sales) > 0.01) changedFuel += 1;
  if (c.reconciles) reconciles += 1;
  else flagged += 1;
}

// ---------- Print table -----------------------------------------------------
console.log('\n========================================================');
console.log(`P1 Financial Integrity audit — ${rows.length} rows`);
console.log('========================================================');
console.log(`reconciles=true (clean):  ${reconciles}`);
console.log(`reconciles=false (flag):  ${flagged}`);
console.log(`unchanged (no delta):     ${unchanged}`);
console.log(`canonical TOTAL  changed: ${changedTotals}`);
console.log(`canonical REVENUE changed:${changedRevenue}`);
console.log(`canonical FUEL    changed:${changedFuel}`);
console.log(`canonical LITRES  changed:${changedLitres}`);
console.log('========================================================\n');

// Detailed table for changed rows only
console.log('Per-row diff (rows where canonical differs from submitted):\n');
console.log(
  '  '.padEnd(2) +
    'date'.padEnd(12) +
    'site'.padEnd(20) +
    'shift'.padEnd(11) +
    'submitted'.padEnd(38) +
    'canonical'.padEnd(38) +
    'flag'
);
console.log('-'.repeat(140));
for (const d of results) {
  const anyChange =
    Math.abs(d.delta.total_sales) > 0.01 ||
    Math.abs(d.delta.total_revenue) > 0.01 ||
    Math.abs(d.delta.fuel_sales) > 0.01 ||
    Math.abs(d.delta.total_litres) > 0.01;
  if (!anyChange && d.reconciles) continue;
  const subStr = `T=${fmt$(d.submitted.total_sales)} R=${fmt$(d.submitted.total_revenue)} F=${fmt$(d.submitted.fuel_sales)}`;
  const canStr = `T=${fmt$(d.canonical.total_sales)} R=${fmt$(d.canonical.total_revenue)} F=${fmt$(d.canonical.fuel_sales)}`;
  const flag = d.reconciles ? 'ok' : '⚠ FLAGGED';
  console.log(
    '  ' +
      String(d.date).padEnd(12) +
      String(d.site).slice(0, 18).padEnd(20) +
      String(d.shift).padEnd(11) +
      subStr.padEnd(38) +
      canStr.padEnd(38) +
      flag
  );
  if (!d.reconciles && d.reason) {
    console.log(`     └─ ${d.reason}`);
  }
}

// ---------- Persist JSON snapshot ------------------------------------------
fs.writeFileSync(
  '/app/memory/p1-audit-results.json',
  JSON.stringify(
    { generatedAt: new Date().toISOString(), summary: { total: rows.length, reconciles, flagged, unchanged, changedTotals, changedRevenue, changedFuel, changedLitres }, results },
    null,
    2
  )
);
console.log(`\nFull JSON snapshot: /app/memory/p1-audit-results.json`);
