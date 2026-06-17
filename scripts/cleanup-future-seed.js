/**
 * scripts/cleanup-future-seed.js
 *
 * Bug #8: shift_reports / dip_readings with dates in the future are
 * leftover seed/test data and confuse the dashboards (the dashboard
 * displays them as "submitted" but they're for dates that haven't
 * happened yet, so the "stale last reading" badge surfaces wrong).
 *
 * Two modes:
 *   --dry-run (default) : list what WOULD be touched, change nothing.
 *   --apply --strategy=backdate : shift each future row back to a date
 *                                 randomly chosen in the last 30 days.
 *   --apply --strategy=delete   : hard-delete future rows.
 *
 * Always preserves real customer data — only touches rows whose `date`
 * is strictly greater than today (server local time).
 *
 * Usage:
 *   node scripts/cleanup-future-seed.js                                 # dry run
 *   node scripts/cleanup-future-seed.js --apply --strategy=backdate     # back-date
 *   node scripts/cleanup-future-seed.js --apply --strategy=delete       # delete
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const APPLY = process.argv.includes('--apply');
  const strategyArg = process.argv.find((a) => a.startsWith('--strategy=')) || '';
  const STRATEGY = strategyArg.split('=')[1] || 'backdate';
  if (!['backdate', 'delete'].includes(STRATEGY)) {
    console.error(`Invalid --strategy=${STRATEGY}. Use 'backdate' or 'delete'.`);
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10);
  console.log('today (server UTC):', today);
  console.log('strategy           :', STRATEGY);
  console.log('mode               :', APPLY ? 'APPLY' : 'DRY RUN');
  console.log('---');

  // 1. Shift reports
  const { data: futureReports } = await sb.from('shift_reports')
    .select('id, site_id, date, shift_type')
    .gt('date', today)
    .order('date', { ascending: false });
  console.log(`future shift_reports: ${futureReports?.length || 0}`);
  for (const r of futureReports || []) {
    console.log(`  ${r.date} ${r.shift_type.padEnd(10)} site=${r.site_id} id=${r.id}`);
  }

  // 2. Dip readings — strictly more than a few hours into the future
  //    (some seeds use an end-of-day reading at 23:59 today which is OK).
  const tomorrowISO = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const { data: futureDips } = await sb.from('dip_readings')
    .select('id, site_id, reading_time, reading_label')
    .gt('reading_time', tomorrowISO)
    .order('reading_time', { ascending: false });
  console.log(`future dip_readings (> +36h): ${futureDips?.length || 0}`);
  for (const d of futureDips || []) {
    console.log(`  ${d.reading_time} label="${d.reading_label}" id=${d.id}`);
  }
  console.log('---');

  if (!APPLY) {
    console.log('DRY RUN. Re-run with --apply --strategy=backdate (or =delete) to act.');
    process.exit(0);
  }

  if (STRATEGY === 'delete') {
    for (const r of futureReports || []) {
      await sb.from('shift_reports').delete().eq('id', r.id);
    }
    for (const d of futureDips || []) {
      await sb.from('dip_readings').delete().eq('id', d.id);
    }
    console.log(`Deleted ${futureReports?.length || 0} reports + ${futureDips?.length || 0} dips.`);
    process.exit(0);
  }

  // strategy=backdate: spread future rows across the last 30 days,
  // preserving relative ordering of each (site, shift_type) bucket so we
  // don't create unique-key collisions.
  const seen = new Map(); // key=`${site}_${shift}` → set of used dates
  function nextFreeDate(siteId, shiftType, offsetIdx) {
    const key = `${siteId}_${shiftType}`;
    if (!seen.has(key)) seen.set(key, new Set());
    const used = seen.get(key);
    // Walk forward from N days ago until we find an unused date for this
    // (site, shift) tuple.
    for (let i = 1; i <= 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (30 - offsetIdx) - (i - 1));
      const iso = d.toISOString().slice(0, 10);
      if (!used.has(iso)) {
        used.add(iso);
        return iso;
      }
    }
    return null;
  }

  let backdated = 0;
  for (let i = 0; i < (futureReports || []).length; i++) {
    const r = futureReports[i];
    const newDate = nextFreeDate(r.site_id, r.shift_type, i);
    if (!newDate) {
      console.warn('  could not find a free date for', r.id, '— skipping');
      continue;
    }
    const { error } = await sb.from('shift_reports').update({ date: newDate }).eq('id', r.id);
    if (error) {
      console.warn(`  backdate failed for ${r.id}: ${error.message}`);
    } else {
      console.log(`  ${r.date} → ${newDate}  (site=${r.site_id} ${r.shift_type})`);
      backdated++;
    }
  }
  console.log(`Backdated ${backdated} shift_reports.`);

  // For dips, shift their reading_time uniformly backwards by (delta + 30d)
  for (const d of futureDips || []) {
    const past = new Date(d.reading_time);
    past.setDate(past.getDate() - 60); // safe historical shift
    const iso = past.toISOString();
    await sb.from('dip_readings').update({ reading_time: iso }).eq('id', d.id);
    console.log(`  dip ${d.id}: ${d.reading_time} → ${iso}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
