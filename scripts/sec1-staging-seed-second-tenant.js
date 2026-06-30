/**
 * SEC1 staging — seed a 2nd owner + 2 sites + 1 operator + 1 staff with assignments.
 * STAGING ONLY. Hard-guarded against prod.
 *
 * After this script:
 *   staging-owner-002 (a fresh auth user) owns staging-site-002, staging-site-003
 *   staging-operator-002 assigned to staging-site-002
 *   staging-staff-002 assigned to staging-site-002
 *   demo data still owned by owner-001 (untouched)
 *
 * This gives the verifier real cross-owner / cross-operator / cross-staff
 * isolation to exercise.
 *
 * Idempotent: safe to re-run (uses upsert + IF NOT EXISTS for sites).
 *
 * Usage:  node scripts/sec1-staging-seed-second-tenant.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_STAGING_URL;
const SVC = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
const PROD_BLOCK = process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST;

if (!URL || !SVC) { console.error('Missing staging env'); process.exit(2); }
if (PROD_BLOCK && URL.includes(PROD_BLOCK)) {
  console.error('FATAL: URL contains blocklisted prod ref'); process.exit(2);
}
// Belt-and-braces: read prod URL from prod .env and refuse if equal
const fs = require('fs');
try {
  const prodEnv = fs.readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
  const prodUrlLine = prodEnv.split(/\r?\n/).find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
  if (prodUrlLine && prodUrlLine.split('=')[1].trim() === URL) {
    console.error('FATAL: staging URL == prod URL. Refusing.'); process.exit(2);
  }
} catch (_) { /* prod env file optional in this script context */ }

const supabase = createClient(URL, SVC, { auth: { persistSession: false } });

const NEW_USERS = [
  { app_id: 'staging-owner-002',    email: 'staging-owner-002@sec1test.local',    role: 'owner',    name: 'Staging Owner Two' },
  { app_id: 'staging-operator-002', email: 'staging-operator-002@sec1test.local', role: 'operator', name: 'Staging Operator Two' },
  { app_id: 'staging-staff-002',    email: 'staging-staff-002@sec1test.local',    role: 'staff',    name: 'Staging Staff Two' },
];
const PASSWORD = process.env.SEC1_STAGING_USER_PASSWORD || (() => {
  console.error('FATAL: set SEC1_STAGING_USER_PASSWORD in .env.staging.');
  console.error('       The previously-hardcoded literal was retired 2026-06-26');
  console.error('       when the staging clone was deleted; pick a fresh one for');
  console.error('       any future rehearsal.');
  process.exit(2);
})();

const NEW_SITES = [
  { id: 'staging-site-002', owner_id: 'staging-owner-002', name: 'SEC1-STAGING Site Alpha', code: 'STG-002', location: 'Staging Test Address 1', status: 'active', shifts_per_day: 2 },
  { id: 'staging-site-003', owner_id: 'staging-owner-002', name: 'SEC1-STAGING Site Beta',  code: 'STG-003', location: 'Staging Test Address 2', status: 'active', shifts_per_day: 2 },
];

async function ensureAuthUser(email) {
  // Check if user already exists via admin list (paginated search)
  // Simplest: try createUser; if "User already registered" then find them
  const { data: created, error } = await supabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (!error) return { id: created.user.id, created: true };
  // try to find existing
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users?.find(u => u.email === email);
  if (found) return { id: found.id, created: false };
  throw new Error(`Could not create or find auth user ${email}: ${error?.message}`);
}

async function upsertAppUser(u, auth_uid) {
  // Upsert into public.users
  const { error } = await supabase.from('users').upsert({
    id: u.app_id,
    email: u.email,
    role: u.role,
    name: u.name,
    auth_user_id: auth_uid,
  }, { onConflict: 'id' });
  if (error) throw new Error(`users upsert ${u.app_id}: ${error.message}`);
}

async function ensureSite(s) {
  // Upsert site
  const { error } = await supabase.from('sites').upsert(s, { onConflict: 'id' });
  if (error) throw new Error(`sites upsert ${s.id}: ${error.message}`);
}

async function ensureOperatorAssign(operator_id, site_id, owner_id) {
  // Idempotent: check first
  const { data: existing } = await supabase
    .from('operator_site_assignments')
    .select('id')
    .eq('operator_user_id', operator_id).eq('site_id', site_id).limit(1);
  if (existing && existing.length) return existing[0].id;
  const { error } = await supabase.from('operator_site_assignments').insert({
    id: require('crypto').randomUUID(),
    operator_user_id: operator_id, site_id, assigned_by_owner_id: owner_id
  });
  if (error) throw new Error(`operator assign: ${error.message}`);
}

async function ensureStaffAssign(staff_id, site_id, operator_id) {
  const { data: existing } = await supabase
    .from('staff_site_assignments')
    .select('id')
    .eq('staff_user_id', staff_id).eq('site_id', site_id).limit(1);
  if (existing && existing.length) return existing[0].id;
  const { error } = await supabase.from('staff_site_assignments').insert({
    id: require('crypto').randomUUID(),
    staff_user_id: staff_id, site_id, assigned_by_operator_id: operator_id
  });
  if (error) throw new Error(`staff assign: ${error.message}`);
}

(async () => {
  console.log('# SEC1 staging seed — second tenant');
  console.log('Target: ' + URL);
  console.log('');

  // 1. Auth users + app users
  const authIds = {};
  for (const u of NEW_USERS) {
    const r = await ensureAuthUser(u.email);
    authIds[u.app_id] = r.id;
    await upsertAppUser(u, r.id);
    console.log(`  ${r.created ? 'CREATED' : 'EXISTING'}  ${u.app_id.padEnd(22)} auth_uid=${r.id}`);
  }

  // 2. Sites
  for (const s of NEW_SITES) {
    await ensureSite(s);
    console.log(`  SITE      ${s.id.padEnd(22)} owner=${s.owner_id}  name=${s.name}`);
  }

  // 3. Assignments
  await ensureOperatorAssign('staging-operator-002', 'staging-site-002', 'staging-owner-002');
  console.log('  OP_ASSIGN staging-operator-002 -> staging-site-002');
  await ensureStaffAssign('staging-staff-002', 'staging-site-002', 'staging-operator-002');
  console.log('  ST_ASSIGN staging-staff-002    -> staging-site-002');

  // 4. Sanity: print final isolation map
  const { data: o2sites } = await supabase.from('sites').select('id,name').eq('owner_id', 'staging-owner-002');
  console.log('\nstaging-owner-002 should own ' + o2sites.length + ' sites: ' + o2sites.map(s=>s.id).join(', '));

  console.log('\n## Credentials (staging-only)');
  console.log('  staging-owner-002@sec1test.local    / ' + PASSWORD);
  console.log('  staging-operator-002@sec1test.local / ' + PASSWORD);
  console.log('  staging-staff-002@sec1test.local    / ' + PASSWORD);
  process.exit(0);
})().catch(e => { console.error('fatal:', e.message || e); process.exit(1); });
