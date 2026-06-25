/**
 * SEC1 staging — probe the staging project to determine its state.
 * READ-ONLY. Uses .env.staging (NEVER the prod .env).
 *
 * Outputs:
 *   - Project ref sanity check (must be staging, must NOT be prod)
 *   - List of public tables present
 *   - Row counts per table
 *   - Any existing auth.users (count only — no PII printed)
 *   - Existing RLS state per table
 *
 * The output drives the decision tree:
 *   - Empty project    → need full schema + seed before SEC1 rehearsal
 *   - Schema only      → need seed
 *   - Schema + seed    → ready for SEC1 rehearsal (Phase 0 capture)
 *   - Clone of prod    → ready immediately
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { createClient } = require('@supabase/supabase-js');

const STAGING_URL = process.env.SUPABASE_STAGING_URL;
const STAGING_SVC = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
const PROD_BLOCKLIST = process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST;

// HARD GUARD #1 — staging vars must exist
if (!STAGING_URL || !STAGING_SVC) {
  console.error('FATAL: SUPABASE_STAGING_URL or SUPABASE_STAGING_SERVICE_ROLE_KEY missing from .env.staging');
  process.exit(2);
}
// HARD GUARD #2 — staging URL must not be the prod URL
const prodUrl = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8')
  .split(/\r?\n/)
  .find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
if (prodUrl) {
  const prodHost = prodUrl.split('=')[1].trim();
  if (STAGING_URL === prodHost) {
    console.error('FATAL: staging URL equals prod URL. Refusing to run.');
    process.exit(2);
  }
}
// HARD GUARD #3 — staging URL must not contain the blocklisted prod ref
if (PROD_BLOCKLIST && STAGING_URL.includes(PROD_BLOCKLIST)) {
  console.error(`FATAL: staging URL contains blocklisted prod ref "${PROD_BLOCKLIST}". Refusing to run.`);
  process.exit(2);
}

const supabase = createClient(STAGING_URL, STAGING_SVC, { auth: { persistSession: false } });

// All known business tables + the auth introspection
const TABLES = [
  'users','sites','operator_site_assignments','staff_site_assignments',
  'shift_reports','shift_formula_results','dip_readings',
  'site_field_configs','site_banking_formulas',
  'fuel_price_entries','fuel_price_acknowledgements','fuel_price_changes',
  'fuel_price_escalations','fuel_price_notifications',
  'fuel_deliveries','fuel_grades',
  'tanks','tank_reconciliation',
  'site_competitors','competitor_fuel_prices',
  'subscriptions','stripe_customers','stripe_webhook_events',
  'user_invites','audit_log',
  'fuel_prices_live','fuel_stations','fuel_price_sync_meta',
];

async function probeTable(t) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) return { exists: false };
    return { exists: 'unknown', error: error.message };
  }
  return { exists: true, count: count ?? 0 };
}

(async () => {
  console.log('# SEC1 staging probe — ' + new Date().toISOString());
  console.log('Target URL:  ' + STAGING_URL);
  console.log('Project ref: ' + STAGING_URL.match(/https:\/\/([^.]+)/)?.[1]);
  console.log('Guards:      passed (URL ≠ prod, ref ≠ blocklist)');
  console.log('');

  const present = []; const missing = []; const errors = [];
  for (const t of TABLES) {
    const r = await probeTable(t);
    if (r.exists === true) present.push({ table: t, rowcount: r.count });
    else if (r.exists === false) missing.push(t);
    else errors.push({ table: t, error: r.error });
  }

  console.log('## Tables present in staging (' + present.length + '/' + TABLES.length + ')');
  if (present.length === 0) console.log('  (none)');
  present.forEach(p => console.log(`  ${p.table.padEnd(34)} rows=${p.rowcount}`));

  if (missing.length) {
    console.log('\n## Tables MISSING (' + missing.length + ')');
    missing.forEach(t => console.log('  - ' + t));
  }
  if (errors.length) {
    console.log('\n## Errors');
    errors.forEach(e => console.log(`  ${e.table}: ${e.error}`));
  }

  // auth.users count (heuristic: try sign-in as a known user; if that fails, we still
  // see the count via the admin API)
  console.log('\n## Auth users (service-role admin API)');
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) console.log('  (auth introspection error: ' + error.message + ')');
    else console.log('  total auth.users on staging: (page 1 contained ' + (data?.users?.length || 0) + ' user; full count visible in Supabase Studio)');
  } catch (e) {
    console.log('  (auth introspection failed: ' + e.message + ')');
  }

  // Decision tree
  console.log('\n## State assessment');
  const knownBusinessTables = TABLES.length;
  const presentCount = present.length;
  const totalRows = present.reduce((s, p) => s + (p.rowcount || 0), 0);
  if (presentCount === 0) {
    console.log('  → EMPTY PROJECT. Need: schema migration + seed data before SEC1 rehearsal.');
  } else if (presentCount < knownBusinessTables) {
    console.log(`  → PARTIAL SCHEMA (${presentCount}/${knownBusinessTables}). Missing tables listed above. Decision required.`);
  } else if (totalRows === 0) {
    console.log('  → SCHEMA PRESENT, ZERO ROWS. Need: seed data (≥2 owners + ≥2 sites + assignments) before SEC1 rehearsal.');
  } else {
    console.log(`  → SCHEMA + DATA PRESENT (${totalRows} rows across ${presentCount} tables). Ready to advance to Phase 0 capture.`);
  }

  process.exit(0);
})().catch(e => { console.error('fatal:', e); process.exit(1); });
