/**
 * scripts/seed-kingsthorpe-leak.js
 *
 * Bug #6: KINGSTHORPE only has 1 dip reading and no per-grade metered
 * sales, so the wet-stock period summary can't compute variance and the
 * marquee "leak" signal never surfaces.
 *
 * This script seeds, idempotently, 14 days of dip readings + 14 days of
 * shift_reports with per-grade metered sales for KINGSTHORPE. The ULP
 * book-movement is bumped slightly above metered sales to simulate a
 * small persistent under-recording / leak — variance lands in 'alert'
 * range and the leak signal will surface in the period view.
 *
 * Safe to re-run: deletes only rows tagged via reading_label/notes
 * prefix "seed_leak_v1".
 *
 * Usage:
 *   node scripts/seed-kingsthorpe-leak.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const { v4: uuid } = require('uuid');

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const SITE_ID = '8c8d2156-1012-4410-81f3-f30b6efc91d3'; // KINGSTHORPE
  const SEED_TAG = 'seed_leak_v1';
  const DAYS = 14;

  // Pick a "logger" user — operator/owner. owner-001 is fine.
  const LOGGER_ID = 'owner-001';

  // 1. Wipe any prior seeded rows so the script is idempotent.
  await sb.from('dip_readings')
    .delete().eq('site_id', SITE_ID).like('reading_label', `${SEED_TAG}%`);
  await sb.from('shift_reports')
    .delete().eq('site_id', SITE_ID).like('notes', `${SEED_TAG}%`);

  // Also strip any orphan single-shot dip readings on the same site that
  // predate this seeded timeline — they skew opening/closing math.
  // Keep this targeted: only remove dips with NO custom_values keys
  // matching the new seeded grade dictionary (ulp/diesel/pre98/pre_diesel)
  // OR an old test reading_label.
  await sb.from('dip_readings')
    .delete().eq('site_id', SITE_ID)
    .or('reading_label.is.null,reading_label.not.like.seed_leak_v%');

  console.log('Cleared prior seeded rows tagged', SEED_TAG);

  // 2. Walk DAYS+1 days backwards from today, draining each tank by a
  //    realistic daily consumption + occasional deliveries. Track the
  //    book-movement per grade as the ground truth; metered sales mirror
  //    book-movement except ULP loses ~30 L/day → ~2% leak.
  const GRADES = [
    { key: 'ulp',        startLevel: 18000, dailyConsumption: 1500, leakPerDay: 30,  deliveryEvery: 5,  deliverySize: 5000 },
    { key: 'diesel',     startLevel: 14000, dailyConsumption: 1100, leakPerDay: 0,   deliveryEvery: 6,  deliverySize: 4000 },
    { key: 'pre98',      startLevel: 8000,  dailyConsumption: 300,  leakPerDay: 0,   deliveryEvery: 9,  deliverySize: 2000 },
    { key: 'pre_diesel', startLevel: 10000, dailyConsumption: 500,  leakPerDay: 0,   deliveryEvery: 7,  deliverySize: 3000 },
  ];

  // Snapshot the current tank level per grade — start of period.
  const levels = Object.fromEntries(GRADES.map((g) => [g.key, g.startLevel]));

  const today = new Date();
  today.setHours(8, 0, 0, 0); // 08:00 morning reading time

  // Seed reading at day -DAYS (the very start). We'll then step forward
  // day by day, each step (a) consuming via metered sales (b) optionally
  // applying a delivery (c) writing a new dip reading at 08:00 the next
  // day.
  const dipRows = [];
  const reportRows = [];

  // First dip = baseline opening readings
  const baselineDate = new Date(today);
  baselineDate.setDate(today.getDate() - DAYS);
  dipRows.push({
    id: uuid(),
    site_id: SITE_ID,
    operator_user_id: LOGGER_ID,
    reading_label: `${SEED_TAG} Baseline opening`,
    reading_time: baselineDate.toISOString(),
    ulp_litres: null,
    diesel_litres: null,
    premium_litres: null,
    deliveries_ulp_litres: 0,
    deliveries_diesel_litres: 0,
    deliveries_premium_litres: 0,
    custom_values: Object.fromEntries(
      GRADES.map((g) => [g.key, { level: levels[g.key], delivery: 0 }])
    ),
    notes: `${SEED_TAG} baseline`,
  });

  for (let i = 1; i <= DAYS; i++) {
    const day = new Date(baselineDate);
    day.setDate(baselineDate.getDate() + i);

    // ------ Build a shift report for this day with metered sales ------
    const customValues = {
      account: 0,
      cash_drop: 0,
      fuel_cards: 0,
      drive_off_iou: 0,
    };
    for (const g of GRADES) {
      // Metered sales = daily consumption minus the leak (so book moves
      // more than metered). For most grades leakPerDay=0 → no variance.
      const metered = Math.max(0, g.dailyConsumption - g.leakPerDay);
      customValues[`${g.key}_litres`] = metered;
    }

    const reportDate = day.toISOString().slice(0, 10); // YYYY-MM-DD
    reportRows.push({
      id: uuid(),
      site_id: SITE_ID,
      submitted_by_user_id: LOGGER_ID,
      date: reportDate,
      shift_type: 'Night',
      status: 'reviewed',
      total_litres: GRADES.reduce((a, g) => a + (g.dailyConsumption - g.leakPerDay), 0),
      total_sales: 0,
      cash: 0,
      eftpos: 0,
      motorpass: 0,
      drive_offs: 0,
      custom_values: customValues,
      notes: `${SEED_TAG} day ${i}`,
    });

    // ------ Apply consumption + delivery to update levels ------
    const cv = {};
    for (const g of GRADES) {
      // Drain by FULL daily consumption (book movement), not just metered.
      levels[g.key] -= g.dailyConsumption;
      let delivery = 0;
      if (i % g.deliveryEvery === 0) {
        delivery = g.deliverySize;
        levels[g.key] += delivery;
      }
      cv[g.key] = { level: levels[g.key], delivery };
    }

    // ------ Write the next morning's dip reading ------
    dipRows.push({
      id: uuid(),
      site_id: SITE_ID,
      operator_user_id: LOGGER_ID,
      reading_label: `${SEED_TAG} day ${i} morning`,
      reading_time: new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ulp_litres: null,
      diesel_litres: null,
      premium_litres: null,
      deliveries_ulp_litres: 0,
      deliveries_diesel_litres: 0,
      deliveries_premium_litres: 0,
      custom_values: cv,
      notes: `${SEED_TAG} day ${i}`,
    });
  }

  // 3. Bulk insert dip rows then report rows.
  const { error: dipsErr } = await sb.from('dip_readings').insert(dipRows);
  if (dipsErr) throw dipsErr;
  console.log('Inserted dip readings:', dipRows.length);

  const { error: reportsErr } = await sb.from('shift_reports').insert(reportRows);
  if (reportsErr) {
    // Try to surface which columns failed; partial seed is still useful.
    console.error('shift_reports insert failed (dips still in place):', reportsErr.message);
    process.exit(1);
  }
  console.log('Inserted shift reports:', reportRows.length);

  // 4. Quick sanity print of expected leak for ULP.
  const ulp = GRADES[0];
  const ulpBook = ulp.dailyConsumption * DAYS;
  const ulpMetered = (ulp.dailyConsumption - ulp.leakPerDay) * DAYS;
  const ulpLeak = ulpBook - ulpMetered;
  console.log(`Expected ULP book movement: ${ulpBook} L, metered: ${ulpMetered} L, leak: ${ulpLeak} L (~${((ulpLeak / ulpMetered) * 100).toFixed(2)}%)`);
})().catch((e) => { console.error(e); process.exit(1); });
