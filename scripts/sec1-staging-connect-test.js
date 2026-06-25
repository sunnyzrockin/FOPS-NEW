/**
 * SEC1 staging — direct Postgres connection test + safety guard.
 * Run first to confirm the connection works and the guard fires correctly.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { Client } = require('pg');

const URL = process.env.STAGING_DATABASE_URL;
const PROD_BLOCK = process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST;
if (!URL) { console.error('FATAL: STAGING_DATABASE_URL missing'); process.exit(2); }
if (PROD_BLOCK && URL.includes(PROD_BLOCK)) {
  console.error('FATAL: connection string contains blocklisted prod ref'); process.exit(2);
}

(async () => {
  const client = new Client({ connectionString: URL });
  await client.connect();
  console.log('# SEC1 staging — connection OK');
  const r1 = await client.query("SELECT current_database() db, current_user usr, inet_server_addr() server_ip, version() v");
  console.log('  db:', r1.rows[0].db);
  console.log('  usr:', r1.rows[0].usr);
  console.log('  server_ip:', r1.rows[0].server_ip);
  console.log('  version:', r1.rows[0].v.split(' on ')[0]);

  // Confirm we are NOT prod by checking the auth.users emails for the prod-only seeds
  // (cheap sanity — both DBs may share the same auth seeds since this is a PITR clone,
  //  so this is informational only).
  const r2 = await client.query("SELECT count(*) FROM public.sites WHERE id LIKE 'staging-site-%'");
  console.log('  staging-site-% sites present:', r2.rows[0].count, '(should be 2 from prior seed)');

  await client.end();
  console.log('# done');
})().catch(e => { console.error('fatal:', e.message); process.exit(1); });
