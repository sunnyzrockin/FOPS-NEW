/**
 * Restore staging to RLS=on baseline (28 tables I disabled via the rollback).
 * This is staging-only cleanup so the rollback rehearsal can be re-run cleanly
 * against a known baseline.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.staging') });
const { Client } = require('pg');
const URL = process.env.STAGING_DATABASE_URL;
if (!URL || URL.includes(process.env.SEC1_STAGING_PROD_PROJECT_REF_BLOCKLIST)) {
  console.error('FATAL'); process.exit(2);
}
const TABLES = [
  'sites','operator_site_assignments','staff_site_assignments',
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

(async () => {
  const c = new Client({ connectionString: URL }); await c.connect();
  console.log('# Re-enabling RLS on staging tables (28 tables)');
  for (const t of TABLES) {
    await c.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
    console.log('  ✓ ' + t);
  }
  await c.end();
  console.log('done — staging back to baseline (RLS on, no policies → deny-all for JWT)');
})().catch(e => { console.error(e); process.exit(1); });
