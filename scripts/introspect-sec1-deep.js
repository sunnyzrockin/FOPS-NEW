/**
 * SEC1 — Deep probes for ambiguous tables/columns.
 * Read-only. Focus: audit_log actor_user_id type, fuel_deliveries shape,
 * sites.id value patterns, user_invites detail, fuel_prices_live/stations ownership.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function probeAuditLog() {
  console.log('## audit_log — distinct actor_user_id formats');
  const { data } = await supabase.from('audit_log')
    .select('actor_user_id,site_id,table_name,action,created_at')
    .limit(30).order('created_at', { ascending: false });
  if (!data) return;
  const uuidPat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const friendlyPat = /^(owner|operator|staff)-\d+$/;
  let uuidCount = 0, friendlyCount = 0, otherCount = 0;
  const samples = [];
  data.forEach(r => {
    if (!r.actor_user_id) return;
    if (uuidPat.test(r.actor_user_id)) uuidCount++;
    else if (friendlyPat.test(r.actor_user_id)) friendlyCount++;
    else otherCount++;
    if (samples.length < 6) samples.push({ id: r.actor_user_id, site: r.site_id, table: r.table_name, act: r.action });
  });
  console.log(`  uuid-format: ${uuidCount}  friendly-format: ${friendlyCount}  other: ${otherCount}`);
  samples.forEach(s => console.log('  sample:', JSON.stringify(s)));
  // distinct site_id presence
  const { data: siteNonNull } = await supabase.from('audit_log')
    .select('id', { count: 'exact', head: true }).not('site_id','is',null);
  const { count: total } = await supabase.from('audit_log').select('id', { count: 'exact', head: true });
  console.log(`  site_id populated rows: depends on follow-up below`);
  const { count: withSite } = await supabase.from('audit_log').select('id', { count: 'exact', head: true }).not('site_id','is',null);
  console.log(`  total: ${total}  with site_id: ${withSite}`);
}

async function probeFuelDeliveries() {
  console.log('\n## fuel_deliveries — column shape via insert dry-run (we abort)');
  // Try a select * with an impossible filter to peek at error info; safer: use HEAD count + an attempted update with non-matching ID
  // Simpler: read pg_catalog via PostgREST aliases isn't possible. Use a known scripted insert? Skip — owner can describe.
  console.log('  (empty table; column list not available via sampling — flag for owner)');
}

async function probeSites() {
  console.log('\n## sites — id format distribution');
  const { data } = await supabase.from('sites').select('id,owner_id,name');
  if (!data) return;
  const uuidPat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const f = data.filter(r => /^site-/.test(r.id)).length;
  const u = data.filter(r => uuidPat.test(r.id)).length;
  console.log(`  total: ${data.length}  friendly site-NNN: ${f}  uuid: ${u}`);
  data.forEach(r => console.log(`  ${r.id} owner=${r.owner_id} name=${r.name}`));
}

async function probeTanksSiteId() {
  console.log('\n## tanks vs sites — site_id linkage check');
  const { data: tanks } = await supabase.from('tanks').select('id,site_id').limit(5);
  console.log('  sample tanks.site_id:', tanks?.map(t => t.site_id));
  // Cross-join: for each tank.site_id, does sites contain it?
  for (const t of (tanks||[])) {
    const { data: s } = await supabase.from('sites').select('id,name').eq('id', t.site_id).limit(1);
    console.log(`    tank.site_id=${t.site_id} -> sites match: ${s?.length ? s[0].name : 'NONE'}`);
  }
}

async function probeUserInvites() {
  console.log('\n## user_invites — full shape');
  const { data } = await supabase.from('user_invites').select('*').limit(2);
  if (data && data.length) console.log('  keys:', Object.keys(data[0]));
  data?.forEach(r => console.log('  row:', JSON.stringify(r).slice(0,300)));
}

async function probeAuditLogColumns() {
  console.log('\n## audit_log — full column keys (one sample)');
  const { data } = await supabase.from('audit_log').select('*').limit(1);
  if (data && data.length) console.log('  keys:', Object.keys(data[0]));
}

async function probeFuelDeliveriesViaInsertNoop() {
  console.log('\n## fuel_deliveries — column discovery via PostgREST error');
  // Force an error referencing all columns we suspect; capture error message
  const { error } = await supabase.from('fuel_deliveries').select('id,site_id,delivered_at,grade,volume_l,supplier').limit(1);
  if (error) console.log('  error from select-with-cols:', error.message);
  else console.log('  select succeeded — at least those cols exist');
}

async function probeFuelGrades() {
  console.log('\n## fuel_grades — full sample');
  const { data } = await supabase.from('fuel_grades').select('*').limit(2);
  if (data && data.length) console.log('  keys:', Object.keys(data[0]), '  sample:', JSON.stringify(data[0]).slice(0,200));
}

async function probeStripeWebhookEvents() {
  console.log('\n## stripe_webhook_events — column keys');
  const { data } = await supabase.from('stripe_webhook_events').select('*').limit(1);
  if (data && data.length) console.log('  keys:', Object.keys(data[0]));
}

async function probeFuelPricesLive() {
  console.log('\n## fuel_prices_live / fuel_stations — sample');
  const { data: l } = await supabase.from('fuel_prices_live').select('*').limit(1);
  if (l?.length) console.log('  fuel_prices_live keys:', Object.keys(l[0]));
  const { data: s } = await supabase.from('fuel_stations').select('*').limit(1);
  if (s?.length) console.log('  fuel_stations keys:', Object.keys(s[0]));
}

async function probeSyncMeta() {
  console.log('\n## fuel_price_sync_meta — full sample');
  const { data } = await supabase.from('fuel_price_sync_meta').select('*');
  console.log('  rows:', JSON.stringify(data));
}

async function probeSubscriptionsKeys() {
  console.log('\n## subscriptions / stripe_customers — full keys');
  const { data: s } = await supabase.from('subscriptions').select('*').limit(1);
  if (s?.length) console.log('  subscriptions keys:', Object.keys(s[0]));
  const { data: c } = await supabase.from('stripe_customers').select('*').limit(1);
  if (c?.length) console.log('  stripe_customers keys:', Object.keys(c[0]));
}

(async () => {
  await probeAuditLog();
  await probeAuditLogColumns();
  await probeFuelDeliveries();
  await probeFuelDeliveriesViaInsertNoop();
  await probeFuelGrades();
  await probeSites();
  await probeTanksSiteId();
  await probeUserInvites();
  await probeStripeWebhookEvents();
  await probeFuelPricesLive();
  await probeSyncMeta();
  await probeSubscriptionsKeys();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
