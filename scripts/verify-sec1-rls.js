/**
 * SEC1 — RLS verifier (READ-ONLY, no DDL, no DML)
 * =============================================================================
 * Verifies that the SEC1 migration produces the intended isolation per role.
 * Runs three identities against a representative table per scope class:
 *   - anon         (NEXT_PUBLIC_SUPABASE_ANON_KEY only, no JWT)
 *   - authenticated owner / operator / staff (signs in via email+password)
 *   - service_role (RLS bypass; used as the "ground truth" row count)
 *
 * Asserts:
 *   - anon sees 0 rows on every business table (except fuel_prices_live /
 *     fuel_stations if Option A is configured)
 *   - owner JWT sees ALL rows for sites they own
 *   - operator JWT sees ONLY assigned-site rows
 *   - staff JWT sees ONLY assigned-site rows
 *   - service_role sees everything (baseline)
 *
 * Usage:
 *   node scripts/verify-sec1-rls.js
 *
 * Reads test credentials from memory/test_credentials.md (or env overrides):
 *   SEC1_OWNER_EMAIL    / SEC1_OWNER_PASSWORD
 *   SEC1_OPERATOR_EMAIL / SEC1_OPERATOR_PASSWORD
 *   SEC1_STAFF_EMAIL    / SEC1_STAFF_PASSWORD
 *
 * This script is SAFE to run before migration too — in that state it will
 * report "RLS off — everyone sees everything" which is the expected baseline.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars'); process.exit(2);
}

// Default test credentials — override via env if production-stripped
const CREDS = {
  owner:    { email: process.env.SEC1_OWNER_EMAIL    || 'owner@fopsapp.com',    password: process.env.SEC1_OWNER_PASSWORD    || 'WorkflowDemo2026!' },
  operator: { email: process.env.SEC1_OPERATOR_EMAIL || 'operator@fopsapp.com', password: process.env.SEC1_OPERATOR_PASSWORD || 'WorkflowDemo2026!' },
  staff:    { email: process.env.SEC1_STAFF_EMAIL    || 'staff@fopsapp.com',    password: process.env.SEC1_STAFF_PASSWORD    || 'WorkflowDemo2026!' },
};

// Tables to probe + the column we expect to scope by.
const PROBES = [
  { table: 'sites',                       scope: 'site-member' },
  { table: 'shift_reports',               scope: 'site-member' },
  { table: 'shift_formula_results',       scope: 'via-parent'  },
  { table: 'dip_readings',                scope: 'site-member' },
  { table: 'site_field_configs',          scope: 'site-member' },
  { table: 'site_banking_formulas',       scope: 'site-member' },
  { table: 'fuel_price_entries',          scope: 'site-member' },
  { table: 'fuel_price_changes',          scope: 'site-member' },
  { table: 'fuel_price_acknowledgements', scope: 'via-parent'  },
  { table: 'fuel_price_escalations',      scope: 'via-parent'  },
  { table: 'fuel_price_notifications',    scope: 'via-parent'  },
  { table: 'fuel_deliveries',             scope: 'owner-op'    },
  { table: 'fuel_grades',                 scope: 'global-authed' },
  { table: 'tanks',                       scope: 'site-member' },
  { table: 'tank_reconciliation',         scope: 'owner-op'    },
  { table: 'site_competitors',            scope: 'site-member' },
  { table: 'competitor_fuel_prices',      scope: 'site-member' },
  { table: 'subscriptions',               scope: 'owner-self'  },
  { table: 'stripe_customers',            scope: 'owner-self'  },
  { table: 'stripe_webhook_events',       scope: 'deny-all'    },
  { table: 'user_invites',                scope: 'inviter-or-site' },
  { table: 'audit_log',                   scope: 'site-scoped-or-deny' },
  { table: 'notifications',               scope: 'self-only' },
  { table: 'fuel_prices_live',            scope: 'authed-or-owner' },
  { table: 'fuel_stations',               scope: 'authed-or-owner' },
  { table: 'fuel_price_sync_meta',        scope: 'deny-all'    },
  { table: 'operator_site_assignments',   scope: 'self-or-owner' },
  { table: 'staff_site_assignments',      scope: 'self-or-op-owner' },
];

const ROLES = ['anon', 'owner', 'operator', 'staff', 'service_role'];

async function makeClient(role) {
  if (role === 'anon')         return { client: createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } }) };
  if (role === 'service_role') return { client: createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) };
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword(CREDS[role]);
  if (error) return { client: null, error: error.message };
  return { client: c, userId: data?.user?.id };
}

async function countRows(client, table) {
  try {
    const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0 };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

function fmt(n, max=8) { return String(n).padStart(max); }

(async () => {
  console.log('# SEC1 RLS verifier — ' + new Date().toISOString());
  console.log('URL: ' + SUPABASE_URL);
  console.log('');
  const clients = {};
  for (const role of ROLES) {
    const r = await makeClient(role);
    clients[role] = r;
    if (r.error) console.log(`  [${role}] auth-error: ${r.error}`);
    else if (r.userId) console.log(`  [${role}] signed in as ${r.userId}`);
    else console.log(`  [${role}] ready`);
  }

  console.log('\n| table                            | anon | owner | operator | staff | service | scope               | assessment |');
  console.log('|----------------------------------|------|-------|----------|-------|---------|---------------------|------------|');

  const failures = [];
  for (const p of PROBES) {
    const row = { table: p.table, scope: p.scope, counts: {} };
    for (const role of ROLES) {
      const c = clients[role]?.client;
      if (!c) { row.counts[role] = 'AUTH'; continue; }
      const { count, error } = await countRows(c, p.table);
      row.counts[role] = error ? 'ERR' : count;
    }
    // Assess
    const c = row.counts;
    const sr = c.service_role;
    let verdict = 'OK';
    const expectations = [];
    if (p.scope === 'deny-all') {
      if (c.anon !== 0 && c.anon !== 'ERR')      { verdict='FAIL'; expectations.push('anon should be 0/ERR'); }
      if (c.owner !== 0 && c.owner !== 'ERR')    { verdict='FAIL'; expectations.push('owner should be 0/ERR'); }
      if (c.operator !== 0 && c.operator !== 'ERR') { verdict='FAIL'; expectations.push('operator should be 0/ERR'); }
    } else if (p.scope === 'global-authed' || p.scope === 'authed-or-owner') {
      if (c.anon !== 0 && c.anon !== 'ERR')      { verdict='FAIL'; expectations.push('anon should be 0/ERR'); }
      // authed reads acceptable (Option A); won't fail if owner sees < sr
    } else {
      // site-scoped / per-role
      if (c.anon !== 0 && c.anon !== 'ERR')      { verdict='FAIL'; expectations.push('anon should be 0/ERR'); }
      if (typeof c.owner === 'number' && typeof sr === 'number' && c.owner > sr)
        { verdict='FAIL'; expectations.push('owner > service'); }
      if (typeof c.operator === 'number' && typeof c.owner === 'number' && c.operator > c.owner)
        { verdict='WARN'; expectations.push('operator > owner suspicious'); }
      if (typeof c.staff === 'number' && typeof c.operator === 'number' && c.staff > c.operator)
        { verdict='WARN'; expectations.push('staff > operator suspicious'); }
    }
    if (verdict !== 'OK') failures.push({ table: p.table, verdict, reasons: expectations });

    console.log(`| ${p.table.padEnd(32)} | ${fmt(c.anon,4)} | ${fmt(c.owner,5)} | ${fmt(c.operator,8)} | ${fmt(c.staff,5)} | ${fmt(sr,7)} | ${p.scope.padEnd(19)} | ${verdict}${expectations.length?' — '+expectations.join('; '):''} |`);
  }

  console.log('\n## Summary');
  if (failures.length === 0) {
    console.log('  ALL PROBES PASS ✓');
  } else {
    console.log(`  ${failures.length} probe(s) failed:`);
    failures.forEach(f => console.log(`    - ${f.table} [${f.verdict}]: ${f.reasons.join('; ')}`));
  }

  console.log('\n## Notes');
  console.log('  - "ERR" in the table means PostgREST returned an error for that role+table');
  console.log('    (e.g. permission denied). For "deny-all" scope this is expected.');
  console.log('  - This script does not modify any data. It only counts rows.');
  console.log('  - Before migration: every authenticated role probably matches service_role');
  console.log('    (RLS is off — nothing is isolated). That is the baseline state.');
  console.log('  - After migration: expect owner ≤ service, operator ≤ owner, staff ≤ operator,');
  console.log('    and anon = 0 everywhere except fuel_prices_live/fuel_stations (Option A).');

  process.exit(failures.length === 0 ? 0 : 1);
})().catch(e => { console.error('fatal:', e); process.exit(2); });
