/**
 * scripts/seed-wetstock-tier1.js — KINGSTHORPE Tier 1 wet-stock demo seed.
 *
 * Usage:
 *   node /app/scripts/seed-wetstock-tier1.js
 *
 * What it does
 *   1. Finds the KINGSTHORPE site (by name or code).
 *   2. Idempotently upserts 4 tanks: ULP, DIESEL, PRE DIESEL, PRE98 with
 *      30 000 L capacity and 0.5 % tolerance.
 *   3. Seeds 7 days of `tank_reconciliation` rows so the daily dashboard
 *      lights up immediately. ULP, DIESEL and PRE98 hover within
 *      tolerance (green). The PRE DIESEL tank is engineered to leak
 *      ~120 L/day on ~10 000 L sales → ~-1.2 % variance → red status.
 *
 * Safe to re-run: tanks are upserted on (site_id, grade); reconciliation
 * is upserted on (tank_id, date).
 *
 * Requires the migration in lib/supabase-wetstock-tier1-migration.sql
 * to have been applied. Aborts with a clear message if the tables are
 * missing.
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
const round = (n) => Math.round(Number(n) * 100) / 100;

async function main() {
  // 1. Find KINGSTHORPE
  const { data: sites, error: sErr } = await sb.from('sites').select('id, name, code').or('name.ilike.%KINGSTHORPE%,code.ilike.%KINGSTHORPE%');
  if (sErr) { console.error('site lookup failed:', sErr.message); process.exit(1); }
  if (!sites?.length) { console.error('No KINGSTHORPE site found. Aborting.'); process.exit(1); }
  const site = sites[0];
  console.log(`✓ Found site: ${site.name} (${site.code || site.id})`);

  // 2. Sanity-check tank tables exist
  const probe = await sb.from('tanks').select('id', { count: 'exact', head: true });
  if (probe.error) {
    console.error('`tanks` table missing — apply lib/supabase-wetstock-tier1-migration.sql first.');
    console.error('Supabase error:', probe.error.message);
    process.exit(1);
  }

  // 3. Upsert tanks
  const tankSpecs = [
    { grade: 'ULP',        capacity_litres: 30000, tolerance_pct: 0.5 },
    { grade: 'DIESEL',     capacity_litres: 30000, tolerance_pct: 0.5 },
    { grade: 'PRE DIESEL', capacity_litres: 30000, tolerance_pct: 0.5 },
    { grade: 'PRE98',      capacity_litres: 15000, tolerance_pct: 0.5 },
  ];

  const tanks = [];
  for (const spec of tankSpecs) {
    // Upsert one at a time so we get the id back reliably.
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

  // 4. Seed 7 days of reconciliation
  const byGrade = Object.fromEntries(tanks.map((t) => [t.grade, t]));
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }

  // Opening levels (Day -7 closing). Tweak per tank.
  const startLevels = { 'ULP': 18000, 'DIESEL': 21000, 'PRE DIESEL': 19000, 'PRE98': 9500 };
  // Daily metered sales per tank (consistent).
  const dailySales = { 'ULP': 7500, 'DIESEL': 9000, 'PRE DIESEL': 10000, 'PRE98': 3200 };
  // Daily deliveries (sometimes 0). Day index -> delivery per grade.
  const deliveryByDay = [
    { 'ULP': 0, 'DIESEL': 0, 'PRE DIESEL': 0, 'PRE98': 0 },
    { 'ULP': 9000, 'DIESEL': 0, 'PRE DIESEL': 9000, 'PRE98': 0 },
    { 'ULP': 0, 'DIESEL': 12000, 'PRE DIESEL': 0, 'PRE98': 3500 },
    { 'ULP': 0, 'DIESEL': 0, 'PRE DIESEL': 9000, 'PRE98': 0 },
    { 'ULP': 8000, 'DIESEL': 9000, 'PRE DIESEL': 0, 'PRE98': 0 },
    { 'ULP': 0, 'DIESEL': 0, 'PRE DIESEL': 9000, 'PRE98': 3000 },
    { 'ULP': 9000, 'DIESEL': 9000, 'PRE DIESEL': 0, 'PRE98': 0 },
  ];

  // Variance per tank per day: PRE DIESEL leaks ~120 L/day; others within tolerance.
  // ULP / DIESEL / PRE98: random small variance in [-0.2%, +0.2%].
  // PRE DIESEL: consistent -1.20 % variance ≈ -120 L on 10000 sales.
  function noiseSmall() { return (Math.random() - 0.5) * 0.004 * 10000; } // ±~20L on 10k sales
  function leakPreDiesel() { return -120 + (Math.random() - 0.5) * 6; }   // -120 ± 3

  const recRows = [];
  // Track each tank's prior closing to chain correctly.
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
      prevClosing[grade] = actual; // chain forward
    }
  }

  // Upsert all rows
  const ids = recRows.map((r) => ({ ...r, id: cryptoUuid() }));
  const { error: upErr } = await sb.from('tank_reconciliation').upsert(ids, { onConflict: 'tank_id,date' });
  if (upErr) { console.error('reconciliation upsert failed:', upErr.message); process.exit(1); }
  console.log(`✓ Seeded ${recRows.length} reconciliation rows across ${days.length} days`);

  // 5. Verify
  const counts = recRows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log('\nReconciliation status counts (across all seeded rows):');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k.padEnd(14)} ${v}`);

  const preD = recRows.filter((r) => byGrade['PRE DIESEL'].id === r.tank_id);
  const avgPct = preD.reduce((a, r) => a + (r.variance_pct || 0), 0) / preD.length;
  console.log(`\nPRE DIESEL avg variance pct over 7 days: ${avgPct.toFixed(2)} %  (expect ~-1.2 %)`);

  console.log('\n✓ Seed complete. Open the Wet-stock → Daily reconciliation tab to view.');
}

// Tiny UUIDv4 (Node 14+: crypto.randomUUID; Node <14: poly).
function cryptoUuid() {
  try { return require('crypto').randomUUID(); }
  catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
  }); }
}

main().catch((e) => { console.error(e); process.exit(1); });
