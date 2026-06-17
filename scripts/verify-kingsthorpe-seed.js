/**
 * scripts/verify-kingsthorpe-seed.js
 *
 * Read-only proof that scripts/seed-kingsthorpe-leak.js actually
 * inserted rows in live Supabase (the same DB the app talks to). Prints:
 *   1. Exact dip_readings count + earliest/latest reading_time, with the
 *      level dictionary on the first and last rows.
 *   2. Exact shift_reports count + earliest/latest date, plus the
 *      per-grade metered sales aggregated from custom_values.
 *   3. The wet-stock reconciliation result for KINGSTHORPE as computed
 *      by the same math the handler uses (so we can match the period
 *      view's variance %).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const SITE_ID = '8c8d2156-1012-4410-81f3-f30b6efc91d3';
  console.log('Site:', SITE_ID, 'KINGSTHORPE');
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('---');

  // 1. Dips
  const { data: dips, error: dipsErr } = await sb.from('dip_readings')
    .select('id, reading_time, reading_label, custom_values, notes')
    .eq('site_id', SITE_ID)
    .order('reading_time', { ascending: true });
  if (dipsErr) throw dipsErr;
  console.log('dip_readings rows total :', dips.length);
  console.log('  earliest reading_time :', dips[0]?.reading_time);
  console.log('  latest   reading_time :', dips[dips.length - 1]?.reading_time);
  console.log('  baseline custom_values:', JSON.stringify(dips[0]?.custom_values));
  console.log('  latest   custom_values:', JSON.stringify(dips[dips.length - 1]?.custom_values));
  const seedTagged = dips.filter((d) => (d.reading_label || '').startsWith('seed_leak_v1'));
  console.log('  rows tagged seed_leak_v1:', seedTagged.length);
  console.log('---');

  // 2. Reports
  const { data: reports, error: rErr } = await sb.from('shift_reports')
    .select('id, date, shift_type, status, custom_values, notes')
    .eq('site_id', SITE_ID)
    .order('date', { ascending: true });
  if (rErr) throw rErr;
  console.log('shift_reports rows total :', reports.length);
  console.log('  earliest date          :', reports[0]?.date, reports[0]?.shift_type);
  console.log('  latest   date          :', reports[reports.length - 1]?.date, reports[reports.length - 1]?.shift_type);
  const taggedReports = reports.filter((r) => (r.notes || '').startsWith('seed_leak_v1'));
  console.log('  rows tagged seed_leak_v1:', taggedReports.length);

  // Aggregate metered sales per grade
  const metered = { ulp: 0, diesel: 0, pre98: 0, pre_diesel: 0 };
  for (const r of reports) {
    const cv = r.custom_values || {};
    for (const g of Object.keys(metered)) {
      if (cv[`${g}_litres`] != null) metered[g] += Number(cv[`${g}_litres`]);
    }
  }
  console.log('  total metered (sum of <grade>_litres in custom_values):');
  for (const g of Object.keys(metered)) console.log(`     ${g.padEnd(12)} ${metered[g]} L`);
  console.log('---');

  // 3. Period-view math (mirrors lib/api/handlers/wetstock.js)
  console.log('Period-view reconciliation (mirroring handler math):');
  for (const g of ['ulp', 'diesel', 'pre98', 'pre_diesel']) {
    const withLevel = dips.filter((d) => d.custom_values?.[g]?.level != null);
    if (withLevel.length < 2) {
      console.log(`  ${g}: no_dips (only ${withLevel.length} readings)`);
      continue;
    }
    const opening = Number(withLevel[0].custom_values[g].level) || 0;
    const closing = Number(withLevel[withLevel.length - 1].custom_values[g].level) || 0;
    const deliveries = dips.reduce(
      (a, d) => a + (Number(d.custom_values?.[g]?.delivery) || 0), 0
    );
    const bookMvmt = opening - closing + deliveries;
    const meteredG = metered[g];
    const varianceL = meteredG - bookMvmt;
    const variancePct = meteredG > 0 ? varianceL / meteredG : 0;
    const tol = 0.005;
    const abs = Math.abs(variancePct);
    const status = abs <= tol ? 'ok' : abs <= 3 * tol ? 'watch' : 'alert';
    console.log(
      `  ${g.padEnd(12)} opening=${opening}  closing=${closing}  ` +
      `deliveries=${deliveries}  book=${bookMvmt}  metered=${meteredG}  ` +
      `var=${varianceL.toFixed(1)}L  ${(variancePct * 100).toFixed(2)}%  [${status}]`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
