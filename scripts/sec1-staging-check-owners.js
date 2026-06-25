/**
 * SEC1 staging — count owners + sites; report the breakdown.
 * READ-ONLY.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_STAGING_URL;
const SVC = process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY;
if (!URL || !SVC) { console.error('Missing staging env'); process.exit(2); }
if (URL.includes(process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST)) {
  console.error('FATAL: URL contains blocklisted prod ref'); process.exit(2);
}

const supabase = createClient(URL, SVC, { auth: { persistSession: false } });

(async () => {
  console.log('# Owner / site distribution check on staging');
  const { data: owners } = await supabase.from('users').select('id,email,role,auth_user_id').eq('role','owner');
  const { data: operators } = await supabase.from('users').select('id,email').eq('role','operator');
  const { data: staff } = await supabase.from('users').select('id,email').eq('role','staff');
  const { data: sites } = await supabase.from('sites').select('id,owner_id,name');
  console.log(`\nOwners: ${owners?.length}`);
  owners?.forEach(o => console.log(`  ${o.id.padEnd(18)} ${o.email}  auth_user_id=${o.auth_user_id ? 'SET' : 'NULL'}`));
  console.log(`\nOperators: ${operators?.length}`);
  operators?.forEach(o => console.log(`  ${o.id.padEnd(18)} ${o.email}`));
  console.log(`\nStaff: ${staff?.length}`);
  staff?.forEach(o => console.log(`  ${o.id.padEnd(18)} ${o.email}`));
  console.log(`\nSites: ${sites?.length}`);
  const byOwner = {};
  sites?.forEach(s => { byOwner[s.owner_id] = (byOwner[s.owner_id]||0)+1; });
  Object.entries(byOwner).forEach(([o,c]) => console.log(`  owner=${o.padEnd(12)} sites=${c}`));

  // Cross-owner isolation testability
  console.log('\n## Cross-owner isolation testability');
  if ((owners?.length||0) >= 2) {
    console.log('  ✓ ≥2 owners present — isolation testable directly.');
  } else {
    console.log('  ✗ Only ' + (owners?.length||0) + ' owner. Need to seed a 2nd owner + sites + assignments on staging.');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
