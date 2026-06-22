/**
 * SEC1 — Schema introspection (sampling approach).
 * Service role: fetch 1 row from each table to enumerate columns.
 * Read-only. Output drives the revised SEC1 spec + decision matrix.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  'users', 'sites',
  'operator_site_assignments', 'staff_site_assignments',
  'shift_reports', 'shift_formula_results', 'dip_readings',
  'site_field_configs', 'site_banking_formulas',
  'fuel_price_entries', 'fuel_price_acknowledgements', 'fuel_price_changes',
  'fuel_price_escalations', 'fuel_price_notifications',
  'fuel_deliveries', 'fuel_grades',
  'tanks', 'tank_reconciliation',
  'site_competitors', 'competitor_fuel_prices',
  'subscriptions', 'stripe_customers', 'stripe_webhook_events',
  'user_invites', 'audit_log',
  'fuel_prices_live', 'fuel_stations', 'fuel_price_sync_meta',
];

const FK_PATTERN = /^(id|.*_id|owner.*|.*user.*|site_id|inviter.*|invited.*|shift_report_id|tank_id|email)$/i;

async function sample(t) {
  const { data, error, count } = await supabase
    .from(t)
    .select('*', { count: 'exact' })
    .limit(1);
  if (error) return { error: error.message };
  return { row: data && data[0], count };
}

async function main() {
  console.log('# SEC1 schema introspection — ' + new Date().toISOString());
  for (const t of TABLES) {
    const r = await sample(t);
    console.log(`\n## ${t}`);
    if (r.error) { console.log('  ERROR: ' + r.error); continue; }
    console.log(`  rowcount: ${r.count}`);
    if (!r.row) {
      // empty table — try insert-shape introspection via OPTIONS? fallback: do an upsert with select to discover
      console.log('  (empty — columns not available via sampling)');
      continue;
    }
    const keys = Object.keys(r.row);
    const fkLike = keys.filter(k => FK_PATTERN.test(k));
    console.log('  identity/FK cols:', JSON.stringify(fkLike));
    // Type inference: show a sample value per FK col
    fkLike.forEach(k => {
      const v = r.row[k];
      const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      const looksUUID = typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      console.log(`    - ${k} : ${type}${looksUUID ? ' (UUID-shaped)' : ''}  e.g. ${JSON.stringify(v).slice(0,80)}`);
    });
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
