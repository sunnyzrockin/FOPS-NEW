/**
 * SEC1 staging — re-run JUST the post-rollback verifier (Step 9).
 * The orchestrator timed out before this completed; the migration is
 * already rolled back, so we just need the matrix.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SB_URL = process.env.SUPABASE_STAGING_URL;
const SB_ANON = process.env.SUPABASE_STAGING_ANON_KEY;
const SB_SVC = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
const PROD_BLOCK = process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST;
if (PROD_BLOCK && SB_URL.includes(PROD_BLOCK)) { console.error('FATAL: prod ref'); process.exit(2); }

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

const ROLES = [
  { id: 'anon', mode: 'anon' },
  { id: 'owner_001', mode: 'jwt', email: 'owner@fopsapp.com', password: 'WorkflowDemo2026!' },
  { id: 'operator_001', mode: 'jwt', email: 'operator@fopsapp.com', password: 'WorkflowDemo2026!' },
  { id: 'staff_001', mode: 'jwt', email: 'staff@fopsapp.com', password: 'WorkflowDemo2026!' },
  { id: 'staging_owner_002', mode: 'jwt', email: 'staging-owner-002@sec1test.local', password: 'SEC1Staging2026!' },
  { id: 'staging_operator_002', mode: 'jwt', email: 'staging-operator-002@sec1test.local', password: 'SEC1Staging2026!' },
  { id: 'staging_staff_002', mode: 'jwt', email: 'staging-staff-002@sec1test.local', password: 'SEC1Staging2026!' },
  { id: 'service_role', mode: 'service' },
];

function fmt(rows, cols) {
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const head = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const sep  = cols.map((_, i) => '-'.repeat(widths[i])).join('-+-');
  const body = rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ')).join('\n');
  return `${head}\n${sep}\n${body}`;
}

(async () => {
  const clients = {};
  for (const role of ROLES) {
    if (role.mode === 'anon') clients[role.id] = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
    else if (role.mode === 'service') clients[role.id] = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });
    else {
      const c = createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
      const { data, error } = await c.auth.signInWithPassword({ email: role.email, password: role.password });
      if (error) { console.log('auth fail '+role.id+': '+error.message); continue; }
      clients[role.id] = c;
    }
  }
  const matrix = [];
  for (const t of TABLES) {
    const row = { table: t };
    for (const role of ROLES) {
      const c = clients[role.id];
      if (!c) { row[role.id] = 'AUTH?'; continue; }
      try {
        const { count, error } = await Promise.race([
          c.from(t).select('*', { count: 'exact', head: true }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
        row[role.id] = error ? `ERR:${error.code || 'X'}` : (count ?? 0);
      } catch (e) {
        row[role.id] = e.message === 'timeout' ? 'TO' : 'EXC';
      }
    }
    matrix.push(row);
  }
  const out = [
    '# SEC1 staging — Post-rollback verifier',
    'Captured: ' + new Date().toISOString(),
    '',
    '## Isolation matrix (post-rollback — RLS back to pre-SEC1 state)',
    fmt(matrix, ['table', ...ROLES.map(r => r.id)]),
    '',
    '## Expectation',
    '  After rollback the new SEC1 policies are gone; the LEGACY policies have',
    '  also been dropped (Phase A.1/A.2 of the migration that ran before the',
    '  rollback). So tables with RLS still ON but NO policies → deny-all for JWT.',
    '  Service-role bypasses RLS → service_role column should match its pre-migration values.',
    '  This is the expected "RLS on but unpoliciied → deny" state for staging tests.',
    '',
    '## Note',
    '  For a TRUE return-to-baseline the legacy policies would need to be recreated.',
    '  In production we will NEVER want that (legacy policies were broken/recursive).',
    '  The rollback intentionally leaves the schema in a "RLS on, no policies, deny-all',
    '  for JWT, service-role still works" state — which is safer than the original.',
  ].join('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'memory', 'SEC1_staging_evidence', 'verify_rollback.txt'), out);
  console.log('wrote verify_rollback.txt');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
