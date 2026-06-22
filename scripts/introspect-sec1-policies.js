/**
 * SEC1 — Enumerate live pg_policies + rls state per table.
 * Service-role read against pg_policies via the REST `rpc` if available;
 * fallback: try a select against pg_policies (PostgREST exposes it if added
 * to allowed schemas — usually not). If both fail, prompt to run an SQL
 * statement in Supabase studio.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  // Try the standard exec_sql RPC (some projects have it).
  const tryRpc = async (sql) => {
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    return { data, error: error && error.message };
  };

  console.log('# Attempt 1: rpc(exec_sql)');
  let r = await tryRpc("SELECT schemaname,tablename,policyname,cmd,permissive,roles,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname");
  if (!r.error) { console.log(JSON.stringify(r.data, null, 2)); return; }
  console.log('  rpc-error:', r.error);

  console.log('\n# Attempt 2: PostgREST pg_policies via REST (rarely exposed)');
  const { data, error } = await supabase.from('pg_policies').select('*');
  if (!error) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log('  rest-error:', error.message);

  console.log('\n# Attempt 3: pg_class rls state via REST');
  const { data: c, error: e2 } = await supabase.from('pg_class').select('relname,relrowsecurity').eq('relnamespace', 2200);
  if (!e2) { console.log(JSON.stringify(c, null, 2)); return; }
  console.log('  rest-error:', e2.message);

  console.log('\n# All probes blocked by PostgREST. Manual SQL needed.');
  console.log('Run this in Supabase SQL editor and paste results back:');
  console.log(`
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='public'
 ORDER BY tablename, policyname;

SELECT relname, relrowsecurity AS rls_enabled
  FROM pg_class
 WHERE relnamespace='public'::regnamespace AND relkind='r'
 ORDER BY relname;
`);
})().catch(e => { console.error(e); process.exit(1); });
