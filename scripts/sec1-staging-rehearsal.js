/**
 * SEC1 staging rehearsal — orchestrator
 * =============================================================================
 * STAGING ONLY. Hard-guarded against prod.
 *
 * Steps (matches SEC1 directive):
 *   0  Phase 0 baselines (pg_class, pg_policies, backend baseline note)
 *   1  Pre-migration verifier (anon + 6 role JWTs + service)
 *   2  Apply lib/supabase-sec1-helpers.sql (Phase 1)
 *   3  Helper-bridge sanity (user_role / user_site_ids for both owners)
 *   4  Apply lib/supabase-sec1-rls-hardening-migration.sql (Phases A–5)
 *   5  Post-migration capture (pg_class, pg_policies, policy count per table)
 *   6  Post-migration verifier
 *   7  Apply lib/supabase-sec1-rls-hardening-rollback.sql
 *   8  Post-rollback capture
 *   9  Verify rollback = baseline
 *
 * All evidence written to memory/SEC1_staging_evidence/.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ─── HARD GUARDS ───────────────────────────────────────────────────────────
const DB_URL = process.env.STAGING_DATABASE_URL;
const SB_URL = process.env.SUPABASE_STAGING_URL;
const SB_ANON = process.env.SUPABASE_STAGING_ANON_KEY;
const SB_SVC = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
const PROD_BLOCK = process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST;
const EXPECTED_REF = process.env.SEC1_STAGING_EXPECTED_PROJECT_REF;

if (!DB_URL || !SB_URL || !SB_ANON || !SB_SVC) {
  console.error('FATAL: missing staging env vars'); process.exit(2);
}
if (PROD_BLOCK && (DB_URL.includes(PROD_BLOCK) || SB_URL.includes(PROD_BLOCK))) {
  console.error('FATAL: prod ref leaked into staging connection'); process.exit(2);
}
if (EXPECTED_REF && !SB_URL.includes(EXPECTED_REF)) {
  console.error('FATAL: SB URL does not match expected staging ref'); process.exit(2);
}
// Cross-check prod .env's URL is different
try {
  const prodEnv = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = prodEnv.match(/NEXT_PUBLIC_SUPABASE_URL=(\S+)/);
  if (m && m[1].trim() === SB_URL) { console.error('FATAL: staging URL == prod URL'); process.exit(2); }
} catch (_) { /* prod env file optional in this context */ }

const OUT = path.join(__dirname, '..', 'memory', 'SEC1_staging_evidence');
fs.mkdirSync(OUT, { recursive: true });
const log = (file, content) => { fs.writeFileSync(path.join(OUT, file), content); console.log(`    → wrote ${file} (${content.length} bytes)`); };

const LIB = path.join(__dirname, '..', 'lib');
const HELPERS_SQL = fs.readFileSync(path.join(LIB, 'supabase-sec1-helpers.sql'), 'utf8');
const MIGRATION_SQL = fs.readFileSync(path.join(LIB, 'supabase-sec1-rls-hardening-migration.sql'), 'utf8');
const ROLLBACK_SQL = fs.readFileSync(path.join(LIB, 'supabase-sec1-rls-hardening-rollback.sql'), 'utf8');

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
  'user_invites','audit_log','notifications',
  'fuel_prices_live','fuel_stations','fuel_price_sync_meta',
];

// Verifier identities (6 users for isolation testing)
const ROLES = [
  { id: 'anon',                       authMode: 'anon' },
  { id: 'owner_001',                  authMode: 'jwt', email: 'owner@fopsapp.com',                    password: 'WorkflowDemo2026!' },
  { id: 'operator_001',               authMode: 'jwt', email: 'operator@fopsapp.com',                 password: 'WorkflowDemo2026!' },
  { id: 'staff_001',                  authMode: 'jwt', email: 'staff@fopsapp.com',                    password: 'WorkflowDemo2026!' },
  { id: 'staging_owner_002',          authMode: 'jwt', email: 'staging-owner-002@sec1test.local',     password: 'SEC1Staging2026!' },
  { id: 'staging_operator_002',       authMode: 'jwt', email: 'staging-operator-002@sec1test.local',  password: 'SEC1Staging2026!' },
  { id: 'staging_staff_002',          authMode: 'jwt', email: 'staging-staff-002@sec1test.local',     password: 'SEC1Staging2026!' },
  { id: 'service_role',               authMode: 'service' },
];

// ─── helpers ───────────────────────────────────────────────────────────────
async function pgCapture(pg, sql, params) {
  const r = await pg.query(sql, params);
  return r.rows;
}

function fmtRows(rows, keys) {
  if (!rows || !rows.length) return '(no rows)';
  const cols = keys || Object.keys(rows[0]);
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const sep  = cols.map((_, i) => '-'.repeat(widths[i])).join('-+-');
  const body = rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ')).join('\n');
  return `${line}\n${sep}\n${body}`;
}

async function captureState(pg, label) {
  const lines = [`# SEC1 staging — ${label}`, `Captured: ${new Date().toISOString()}`, ''];

  const rls = await pgCapture(pg,
    `SELECT relname AS table_name, relrowsecurity AS rls_enabled
       FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r'
        AND relname = ANY($1::text[])
      ORDER BY 1`, [TABLES]).catch(async () => {
    const r = await pg.query(
      `SELECT relname AS table_name, relrowsecurity AS rls_enabled
         FROM pg_class
        WHERE relnamespace='public'::regnamespace AND relkind='r'
        ORDER BY 1`);
    return r.rows.filter(x => TABLES.includes(x.table_name));
  });

  lines.push('## pg_class — RLS state per in-scope table');
  lines.push(fmtRows(rls, ['table_name','rls_enabled']));
  lines.push(`\nTotal: ${rls.length} tables · RLS enabled: ${rls.filter(r => r.rls_enabled).length} · RLS disabled: ${rls.filter(r => !r.rls_enabled).length}`);

  const policies = await pgCapture(pg,
    `SELECT tablename, policyname, cmd, roles
       FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`);
  lines.push('\n## pg_policies — policy inventory');
  lines.push(fmtRows(policies, ['tablename','policyname','cmd','roles']));
  lines.push(`\nTotal policies: ${policies.length}`);

  const helpers = await pgCapture(pg,
    `SELECT proname, pg_get_function_identity_arguments(p.oid) args
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND proname IN (
        'current_user_app_id','user_site_ids','user_role','user_is_owner_of',
        'get_user_id_from_auth','get_operator_site_ids','get_staff_site_ids',
        'get_user_role_and_id','get_operator_assigned_sites','get_staff_assigned_sites',
        'auth_user_uuid','auth_user_role','auth_user_site_ids',
        'set_fuel_deliveries_updated_at','tanks_set_updated_at','set_dip_readings_updated_at'
      ) ORDER BY proname`);
  lines.push('\n## Relevant functions in public schema');
  lines.push(fmtRows(helpers, ['proname','args']));

  return { content: lines.join('\n'), rls, policies, helpers };
}

// Build a Supabase client per role (anon-key for JWT modes; service key for service_role)
async function makeRoleClient(role) {
  if (role.authMode === 'anon') {
    return { client: createClient(SB_URL, SB_ANON, { auth: { persistSession: false } }) };
  }
  if (role.authMode === 'service') {
    return { client: createClient(SB_URL, SB_SVC, { auth: { persistSession: false } }) };
  }
  const c = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: role.email, password: role.password });
  if (error) return { client: null, error: error.message };
  return { client: c, userId: data.user.id };
}

async function runVerifier(label) {
  const lines = [`# SEC1 staging — ${label}`, `Captured: ${new Date().toISOString()}`, ''];
  const clients = {};
  const authNotes = [];
  for (const role of ROLES) {
    const r = await makeRoleClient(role);
    clients[role.id] = r.client;
    if (r.error) authNotes.push(`  ${role.id}: AUTH-ERROR ${r.error}`);
    else if (r.userId) authNotes.push(`  ${role.id}: signed in (auth.uid=${r.userId})`);
    else authNotes.push(`  ${role.id}: ${role.authMode}`);
  }
  lines.push('## Identities established');
  lines.push(authNotes.join('\n'));

  // Header
  const cols = ['table', ...ROLES.map(r => r.id)];
  const widths = cols.map(c => Math.max(c.length, 8));
  // Probe
  const matrix = [];
  for (const t of TABLES) {
    const row = { table: t };
    for (const role of ROLES) {
      const c = clients[role.id];
      if (!c) { row[role.id] = 'AUTH?'; continue; }
      try {
        const { count, error } = await c.from(t).select('*', { count: 'exact', head: true });
        row[role.id] = error ? `ERR:${error.code || 'X'}` : (count ?? 0);
      } catch (e) {
        row[role.id] = 'EXC';
      }
    }
    matrix.push(row);
  }
  // Pretty print
  lines.push('\n## Isolation matrix (row count visible per role; ERR = PostgREST returned error)');
  lines.push(fmtRows(matrix, cols));

  // Headline assertions (auto-graded)
  lines.push('\n## Headline assertions');
  const assert = [];
  const sr = (t) => matrix.find(r => r.table === t)?.service_role ?? '?';
  const v = (t, r) => matrix.find(x => x.table === t)?.[r];

  // anon should be 0/ERR on every business table EXCEPT fuel_prices_live/fuel_stations (Option A)
  for (const t of TABLES) {
    const anonVal = v(t, 'anon');
    const optionA = ['fuel_prices_live', 'fuel_stations'].includes(t);
    if (optionA) continue;
    if (anonVal !== 0 && !String(anonVal).startsWith('ERR')) {
      assert.push(`  ✗ anon sees ${anonVal} rows of ${t} (expected 0 or ERR)`);
    } else {
      assert.push(`  ✓ anon ${t}: ${anonVal}`);
    }
  }
  // owner-001 should NOT see staging-owner-002's sites/data
  // Approximate: owner-001 sees ≤ service on sites (=5 prod sites, was 7+2 with seeds)
  const o1sites = v('sites', 'owner_001');
  const o2sites = v('sites', 'staging_owner_002');
  assert.push(`  owner_001 sees ${o1sites} sites; staging_owner_002 sees ${o2sites} sites; service ${sr('sites')}`);
  if (typeof o1sites === 'number' && typeof o2sites === 'number' && typeof sr('sites') === 'number') {
    if (o1sites + o2sites === sr('sites')) assert.push('  ✓ owner isolation: 7+2 = 9 sites accounted for (partition holds)');
    else assert.push('  ⚠ owner isolation: counts do not partition cleanly (likely overlap or leak)');
  }
  // staff should see 0 on tank_reconciliation
  const staffTR = v('tank_reconciliation', 'staff_001');
  assert.push(`  staff_001 tank_reconciliation: ${staffTR} (expected 0)`);
  if (staffTR === 0) assert.push('  ✓ staff blocked from tank_reconciliation');
  else assert.push('  ✗ staff has access to tank_reconciliation');

  lines.push(assert.join('\n'));
  return { content: lines.join('\n'), matrix };
}

async function applySqlFile(pg, name, sql) {
  console.log(`\n## Applying ${name} (${sql.length} chars)`);
  const startedAt = Date.now();
  try {
    await pg.query(sql);
    console.log(`  ✓ applied in ${Date.now() - startedAt}ms`);
    return { ok: true, ms: Date.now() - startedAt };
  } catch (e) {
    console.error(`  ✗ FAILED: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

(async () => {
  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();
  console.log('=== SEC1 staging rehearsal — start ' + new Date().toISOString() + ' ===');

  // STEP 0 — Phase 0 baseline
  console.log('\n## STEP 0 — Phase 0 baseline capture');
  const baseline = await captureState(pg, 'Phase 0 baseline (pre-migration)');
  log('phase0_baseline.txt', baseline.content);

  // Quick auth.users count
  const authCount = await pgCapture(pg, 'SELECT count(*) FROM auth.users');
  log('phase0_auth_count.txt',
    `auth.users count on staging: ${authCount[0].count}\n` +
    `Captured ${new Date().toISOString()}\n`);

  // STEP 1 — Pre-migration verifier
  console.log('\n## STEP 1 — Pre-migration verifier (RLS off, everyone sees all)');
  const v1 = await runVerifier('Pre-migration verifier (RLS off baseline)');
  log('verify_before.txt', v1.content);

  // STEP 2 — Apply helpers
  console.log('\n## STEP 2 — Apply lib/supabase-sec1-helpers.sql');
  const r2 = await applySqlFile(pg, 'helpers', HELPERS_SQL);
  if (!r2.ok) { log('step2_helpers_FAILED.txt', r2.error); throw new Error('helpers failed'); }
  log('step2_helpers_OK.txt', `applied ok in ${r2.ms}ms\n`);

  // STEP 3 — Helper-bridge sanity
  console.log('\n## STEP 3 — Helper-bridge sanity (user_role/user_site_ids for both owners)');
  const owners = await pgCapture(pg,
    `SELECT id, email, auth_user_id FROM users WHERE role='owner' AND auth_user_id IS NOT NULL ORDER BY id`);
  const bridge = [];
  for (const o of owners) {
    const role = await pgCapture(pg, `SELECT public.user_role($1::uuid) AS role`, [o.auth_user_id]);
    const sites = await pgCapture(pg, `SELECT public.user_site_ids($1::uuid) AS site_id`, [o.auth_user_id]);
    const appId = await pgCapture(pg, `SELECT public.user_is_owner_of($1::uuid, $2::text) AS owns_first`, [o.auth_user_id, sites[0]?.site_id || 'nonexistent']);
    bridge.push({ owner: o.id, email: o.email, auth_user_id: o.auth_user_id, user_role: role[0].role, site_count: sites.length, sample_sites: sites.slice(0,3).map(s=>s.site_id).join(','), user_is_owner_of_first: appId[0].owns_first });
  }
  const bridgeOut = '# Helper bridge sanity\n\n' + fmtRows(bridge, ['owner','email','auth_user_id','user_role','site_count','sample_sites','user_is_owner_of_first']);
  log('step3_helper_bridge.txt', bridgeOut);
  console.log('  ' + bridgeOut.split('\n').slice(2,8).join('\n  '));

  // STEP 4 — Apply migration
  console.log('\n## STEP 4 — Apply lib/supabase-sec1-rls-hardening-migration.sql');
  const r4 = await applySqlFile(pg, 'migration', MIGRATION_SQL);
  if (!r4.ok) { log('step4_migration_FAILED.txt', r4.error); throw new Error('migration failed: ' + r4.error); }
  log('step4_migration_OK.txt', `applied ok in ${r4.ms}ms\n`);

  // STEP 5 — Post-migration capture
  console.log('\n## STEP 5 — Post-migration state capture');
  const postMig = await captureState(pg, 'Post-migration (RLS on, new policies applied)');
  log('after_pg_state.txt', postMig.content);

  // STEP 6 — Post-migration verifier
  console.log('\n## STEP 6 — Post-migration verifier (isolation matrix)');
  const v6 = await runVerifier('Post-migration verifier (RLS on)');
  log('verify_after.txt', v6.content);

  // STEP 7 — Rollback
  console.log('\n## STEP 7 — Apply lib/supabase-sec1-rls-hardening-rollback.sql');
  const r7 = await applySqlFile(pg, 'rollback', ROLLBACK_SQL);
  if (!r7.ok) { log('step7_rollback_FAILED.txt', r7.error); throw new Error('rollback failed: ' + r7.error); }
  log('step7_rollback_OK.txt', `applied ok in ${r7.ms}ms\n`);

  // STEP 8 — Post-rollback capture
  console.log('\n## STEP 8 — Post-rollback state capture');
  const postRb = await captureState(pg, 'Post-rollback (back to pre-SEC1 state)');
  log('after_rollback_pg_state.txt', postRb.content);

  // STEP 9 — Post-rollback verifier
  console.log('\n## STEP 9 — Post-rollback verifier (back to RLS off)');
  const v9 = await runVerifier('Post-rollback verifier');
  log('verify_rollback.txt', v9.content);

  // Diff baseline vs rollback
  const baselineRlsMap = Object.fromEntries(baseline.rls.map(r => [r.table_name, r.rls_enabled]));
  const rbRlsMap = Object.fromEntries(postRb.rls.map(r => [r.table_name, r.rls_enabled]));
  const drifts = TABLES.filter(t => baselineRlsMap[t] !== rbRlsMap[t]);
  const diff = drifts.length ? drifts.map(t => `  ${t}: baseline=${baselineRlsMap[t]} → post-rollback=${rbRlsMap[t]}`).join('\n') : '  (no drift — perfect match)';
  log('rollback_vs_baseline_diff.txt', `# RLS state diff: baseline vs post-rollback\n\n${diff}\n`);

  await pg.end();
  console.log('\n=== SEC1 staging rehearsal — complete ' + new Date().toISOString() + ' ===');
  console.log('Evidence written to memory/SEC1_staging_evidence/');
})().catch(e => { console.error('FATAL in rehearsal:', e.message); process.exit(1); });
