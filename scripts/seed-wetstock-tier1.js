/**
 * scripts/seed-wetstock-tier1.js — KINGSTHORPE Tier 1 wet-stock demo seed.
 *
 * Usage:
 *   node /app/scripts/seed-wetstock-tier1.js
 *
 * What it does
 *   1. Finds the KINGSTHORPE site (by name or code).
 *   2. Idempotently upserts 4 tanks: ULP, DIESEL, PRE DIESEL, PRE98 with
 *      30 000 L (or 15 000 L for PRE98) capacity and 0.5 % tolerance.
 *   3. DELETES any existing KINGSTHORPE tank_reconciliation rows in the
 *      7-day seed window, then INSERTs the freshly-generated rows. This
 *      guarantees the seed REPLACES — never silently no-ops — the data.
 *   4. Generates physically-plausible levels: opening / actual_closing
 *      stay strictly between 0 and capacity_litres every day. A pre-flight
 *      simulation validates this before any DB write; the script aborts
 *      if anything goes out of range.
 *
 * Engineered signal (preserved exactly):
 *   - PRE DIESEL: sustained ~-1.2 %/day variance (~-120 L on 10 000 L sales)
 *     → RED status every day.
 *   - ULP, DIESEL, PRE98: small noise (~±0.2 %) → GREEN.
 *   - One occasional amber day from natural noise variance is acceptable.
 *
 * Requires the migration in lib/supabase-wetstock-tier1-migration.sql.
 */

const path = require('path');
const fs = require('fs');

// Load .env from /app
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in /app/.env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const round = (n) => Math.round(Number(n) * 100) / 100;

function reconcileTank({ tank_id, site_id, date, opening, delivery, sales, actual, tolerance_pct, chain_broken = false }) {
  const expected = opening + delivery - sales;
  const variance_litres = actual - expected;
  const variance_pct = sales > 0 ? (variance_litres / sales) * 100 : null;
  let status = 'no_data';
  if (chain_broken) status = 'broken_chain';
  else if (variance_pct == null) status = 'no_data';
  else {
    const abs = Math.abs(variance_pct);
    if (abs <= tolerance_pct) status = 'green';
    else if (abs <= 2 * tolerance_pct) status = 'amber';
    else status = 'red';
  }
  return {
    tank_id,
    site_id,
    date,
    opening_litres: round(opening),
    delivery_litres: round(delivery),
    sales_litres: round(sales),
    actual_closing: round(actual),
    expected_closing: round(expected),
    variance_litres: round(variance_litres),
    variance_pct: variance_pct == null ? null : Math.round(variance_pct * 100) / 100,
    status,
    chain_broken,
  };
}

// ---------------------------------------------------------------------------
// PHYSICAL PLAN — designed so every tank stays in (0, capacity) every day.
// startLevel chosen to absorb 7 days of sales given the delivery schedule.
// ---------------------------------------------------------------------------
const CAPACITY = { 'ULP': 30000, 'DIESEL': 30000, 'PRE DIESEL': 30000, 'PRE98': 15000 };

const startLevels = {
  'ULP':        22000,   // ~73% full
  'DIESEL':     22000,   // ~73% full
  'PRE DIESEL': 22000,   // ~73% full
  'PRE98':      12000,   // ~80% full (smaller tank, smaller sales)
};

const dailySales = {
  'ULP':         7500,
  'DIESEL':      9000,
  'PRE DIESEL': 10000,
  'PRE98':       3200,
};

// 7-day delivery plan. Indexed Day -6 (oldest) → Day 0 (today).
// Designed so each tank never goes below ~1 000 L or above its capacity.
const deliveryByDay = [
  // Day -6: rest day everywhere
  { 'ULP':     0, 'DIESEL':     0, 'PRE DIESEL':     0, 'PRE98':    0 },
  // Day -5: big morning truck — ULP + DIESEL + PRE DIESEL
  { 'ULP': 22000, 'DIESEL': 25000, 'PRE DIESEL': 22000, 'PRE98':    0 },
  // Day -4: PRE98 top-up only
  { 'ULP':     0, 'DIESEL':     0, 'PRE DIESEL':     0, 'PRE98': 7000 },
  // Day -3: PRE DIESEL only (it drains fastest)
  { 'ULP':     0, 'DIESEL':     0, 'PRE DIESEL': 22000, 'PRE98':    0 },
  // Day -2: ULP + DIESEL refill
  { 'ULP': 22000, 'DIESEL': 25000, 'PRE DIESEL':     0, 'PRE98':    0 },
  // Day -1: PRE DIESEL again + PRE98 top-up
  { 'ULP':     0, 'DIESEL':     0, 'PRE DIESEL': 22000, 'PRE98': 6000 },
  // Day 0 (today): rest day
  { 'ULP':     0, 'DIESEL':     0, 'PRE DIESEL':     0, 'PRE98':    0 },
];

// Variance generators
function noiseSmall() { return (Math.random() - 0.5) * 0.004 * 10000; } // ±~20L on 10k sales
function leakPreDiesel() { return -120 + (Math.random() - 0.5) * 6; }   // -120 ± 3

// ---------------------------------------------------------------------------
// Pre-flight simulation — refuses to proceed if any level goes out of range.
// ---------------------------------------------------------------------------
function simulateAndValidate() {
  const violations = [];
  const trace = {};
  for (const grade of Object.keys(startLevels)) {
    const cap = CAPACITY[grade];
    let level = startLevels[grade];
    trace[grade] = [level];
    if (level <= 0 || level > cap) violations.push(`${grade} start ${level} out of (0, ${cap}]`);
    for (let d = 0; d < 7; d++) {
      const delivery = deliveryByDay[d][grade] || 0;
      const sales    = dailySales[grade];
      // Simulate the EXPECTED level (noise won't push us out of physical bounds materially).
      const after = level + delivery - sales;
      const leakOffset = grade === 'PRE DIESEL' ? -120 : 0;
      const actual = after + leakOffset;
      if (actual <= 0)   violations.push(`${grade} day ${d} actual ${actual.toFixed(0)} ≤ 0`);
      if (actual > cap)  violations.push(`${grade} day ${d} actual ${actual.toFixed(0)} > cap ${cap}`);
      // Also sanity-check pre-delivery (in case a delivery couldn't fit):
      if (after > cap)   violations.push(`${grade} day ${d} pre-delivery overflow ${after.toFixed(0)} > cap ${cap}`);
      level = actual;
      trace[grade].push(level);
    }
  }
  return { ok: violations.length === 0, violations, trace };
}

async function main() {
  // Pre-flight simulate BEFORE touching the DB
  const sim = simulateAndValidate();
  if (!sim.ok) {
    console.error('❌ Seed plan would produce out-of-range levels. Aborting.');
    sim.violations.forEach((v) => console.error('   • ' + v));
    process.exit(1);
  }
  console.log('✓ Pre-flight simulation passed — all 4 tanks stay within (0, capacity) across 7 days.');
  for (const g of Object.keys(sim.trace)) {
    console.log(`  ${g.padEnd(11)}  closing levels: ${sim.trace[g].slice(1).map((n) => n.toFixed(0).padStart(6)).join(' ')}`);
  }

  // 1. Find KINGSTHORPE
  const { data: sites, error: sErr } = await sb.from('sites').select('id, name, code').or('name.ilike.%KINGSTHORPE%,code.ilike.%KINGSTHORPE%');
  if (sErr) { console.error('site lookup failed:', sErr.message); process.exit(1); }
  if (!sites?.length) { console.error('No KINGSTHORPE site found. Aborting.'); process.exit(1); }
  const site = sites[0];
  console.log(`\n✓ Found site: ${site.name} (${site.code || site.id})`);

  // 2. Sanity-check tank tables exist
  const probe = await sb.from('tanks').select('id', { count: 'exact', head: true });
  if (probe.error) {
    console.error('`tanks` table missing — apply lib/supabase-wetstock-tier1-migration.sql first.');
    console.error('Supabase error:', probe.error.message);
    process.exit(1);
  }

  // 3. Upsert tanks
  const tankSpecs = [
    { grade: 'ULP',        capacity_litres: CAPACITY['ULP'],        tolerance_pct: 0.5 },
    { grade: 'DIESEL',     capacity_litres: CAPACITY['DIESEL'],     tolerance_pct: 0.5 },
    { grade: 'PRE DIESEL', capacity_litres: CAPACITY['PRE DIESEL'], tolerance_pct: 0.5 },
    { grade: 'PRE98',      capacity_litres: CAPACITY['PRE98'],      tolerance_pct: 0.5 },
  ];

  const tanks = [];
  for (const spec of tankSpecs) {
    const { data: existing } = await sb.from('tanks')
      .select('*').eq('site_id', site.id).eq('grade', spec.grade).maybeSingle();
    if (existing) {
      const { data: upd } = await sb.from('tanks').update({
        capacity_litres: spec.capacity_litres,
        tolerance_pct: spec.tolerance_pct,
        active: true,
      }).eq('id', existing.id).select('*').single();
      tanks.push(upd);
    } else {
      const { data: ins, error: iErr } = await sb.from('tanks').insert({
        site_id: site.id,
        grade: spec.grade,
        capacity_litres: spec.capacity_litres,
        tolerance_pct: spec.tolerance_pct,
        active: true,
      }).select('*').single();
      if (iErr) { console.error('tank insert failed:', iErr.message); process.exit(1); }
      tanks.push(ins);
    }
  }
  console.log(`✓ Upserted ${tanks.length} tanks at KINGSTHORPE`);

  // 4. Build the 7-day reconciliation plan
  const byGrade = Object.fromEntries(tanks.map((t) => [t.grade, t]));
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }

  const recRows = [];
  const prevClosing = { ...startLevels };

  for (let di = 0; di < days.length; di++) {
    const date = days[di];
    for (const grade of Object.keys(byGrade)) {
      const tank = byGrade[grade];
      const opening = prevClosing[grade];
      const delivery = deliveryByDay[di][grade] || 0;
      const sales = dailySales[grade];
      const expected = opening + delivery - sales;
      const noise = grade === 'PRE DIESEL' ? leakPreDiesel() : noiseSmall();
      const actual = round(expected + noise);
      const row = reconcileTank({
        tank_id: tank.id,
        site_id: site.id,
        date,
        opening,
        delivery,
        sales,
        actual,
        tolerance_pct: Number(tank.tolerance_pct),
        chain_broken: false,
      });
      recRows.push(row);
      prevClosing[grade] = actual;
    }
  }

  // 5. DELETE existing rows in the seed window, then INSERT.
  //    Spec: "DELETE the existing KINGSTHORPE tank_reconciliation rows
  //    for the seeded date range first, then insert."
  const tankIds = tanks.map((t) => t.id);
  const fromDate = days[0];
  const toDate   = days[days.length - 1];
  const { error: dErr, count: deletedCount } = await sb.from('tank_reconciliation')
    .delete({ count: 'exact' })
    .in('tank_id', tankIds)
    .gte('date', fromDate)
    .lte('date', toDate);
  if (dErr) { console.error('delete failed:', dErr.message); process.exit(1); }
  console.log(`✓ Deleted ${deletedCount ?? '?'} existing rows in window ${fromDate} → ${toDate}`);

  const ids = recRows.map((r) => ({ ...r, id: cryptoUuid() }));
  const { error: iErr } = await sb.from('tank_reconciliation').insert(ids);
  if (iErr) { console.error('insert failed:', iErr.message); process.exit(1); }
  console.log(`✓ Inserted ${recRows.length} fresh reconciliation rows across ${days.length} days`);

  // 6. Verification summary
  const counts = recRows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log('\nStatus counts across all seeded rows:');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k.padEnd(14)} ${v}`);

  const preD = recRows.filter((r) => byGrade['PRE DIESEL'].id === r.tank_id);
  const avgPct = preD.reduce((a, r) => a + (r.variance_pct || 0), 0) / preD.length;
  console.log(`\nPRE DIESEL avg variance pct over 7 days: ${avgPct.toFixed(2)} %  (expect ~-1.2 %)`);

  // 7. Re-read from DB to PROVE physical plausibility post-write.
  console.log(`\nVerifying stored rows for KINGSTHORPE on ${toDate} (today):`);
  const { data: todayRows, error: vErr } = await sb.from('tank_reconciliation')
    .select('date, opening_litres, delivery_litres, sales_litres, expected_closing, actual_closing, variance_litres, variance_pct, status, tank_id')
    .in('tank_id', tankIds)
    .eq('date', toDate)
    .order('tank_id');
  if (vErr) { console.error('verify select failed:', vErr.message); process.exit(1); }
  const tankNameById = Object.fromEntries(tanks.map((t) => [t.id, t.grade]));
  for (const r of todayRows || []) {
    const cap = CAPACITY[tankNameById[r.tank_id]];
    const ok  = Number(r.opening_litres) > 0 && Number(r.actual_closing) > 0
             && Number(r.opening_litres) <= cap && Number(r.actual_closing) <= cap;
    console.log(`  ${tankNameById[r.tank_id].padEnd(11)}  open=${String(r.opening_litres).padStart(8)}  deliv=${String(r.delivery_litres).padStart(6)}  sales=${String(r.sales_litres).padStart(6)}  expect=${String(r.expected_closing).padStart(8)}  actual=${String(r.actual_closing).padStart(8)}  var=${String(r.variance_litres).padStart(6)}L  ${String(r.variance_pct).padStart(6)}%  ${r.status.padEnd(6)} ${ok ? '✓' : '✗ OUT OF RANGE'}`);
  }

  console.log('\n✓ Seed complete. Open the Wet-stock → Daily reconciliation tab to view.');
}

// Tiny UUIDv4 helper
function cryptoUuid() {
  try { return require('crypto').randomUUID(); }
  catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
  }); }
}

main().catch((e) => { console.error(e); process.exit(1); });
