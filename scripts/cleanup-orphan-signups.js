/**
 * scripts/cleanup-orphan-signups.js
 *
 * Removes owner accounts that were created via the signup path but never
 * completed Stripe checkout. These accumulate when the signup endpoint
 * throws AFTER creating the auth.users + public.users rows but BEFORE
 * the user lands on Stripe — the email is then "stuck taken" because
 * users.email is UNIQUE, and the user can't retry. (The new
 * try/catch + rollback in /api/auth/signup prevents this going forward;
 * this script cleans up the legacy mess.)
 *
 * Detection heuristic — ALL of the following must be true:
 *   1. users.role = 'owner'
 *   2. users.email is NOT in the PROTECTED_EMAILS allowlist
 *   3. NO row in `subscriptions` (any status) for this user_id
 *   4. NOT a seed account (no is_demo_source, no @fopsapp.com)
 *
 * SAFETY:
 *   - PROTECTED_EMAILS allowlist (enforced TWICE: once in the SELECT
 *     filter, once before every delete call).
 *   - Dry-run by default. --apply required to mutate.
 *   - Prints exact rows before and after each delete.
 *
 * Usage:
 *   node scripts/cleanup-orphan-signups.js                  # dry run
 *   node scripts/cleanup-orphan-signups.js --apply          # actually delete
 *
 * IRREVERSIBLE on live DB. Owner authorization required to --apply.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const PROTECTED_EMAILS = new Set([
  // Real customer — NEVER touch.
  'vinamaytraders@gmail.com',
  // Seed / system accounts — keep.
  'owner@fopsapp.com',
  'operator@fopsapp.com',
  'operator2@fopsapp.com',
  'staff@fopsapp.com',
  'demo@fopsapp.com',
  'support@fopsapp.com',
  'founder@fops.platform',
]);

(async () => {
  const APPLY = process.argv.includes('--apply');
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
    : null;

  console.log('mode  :', APPLY ? 'APPLY' : 'DRY RUN');
  console.log('PROTECTED_EMAILS allowlist (defence in depth, enforced 2x):');
  for (const e of PROTECTED_EMAILS) console.log('  -', e);
  console.log('---');

  // 1. Pull all owner rows
  const { data: owners, error } = await sb.from('users')
    .select('id, auth_user_id, email, name, role, created_at, is_demo, is_demo_source, status')
    .eq('role', 'owner')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('users query failed:', error.message);
    process.exit(1);
  }
  console.log(`total owner users : ${owners.length}`);

  // 2. For each, check subscriptions presence + protection.
  const orphans = [];
  for (const u of owners) {
    if (PROTECTED_EMAILS.has(u.email)) continue;
    if (u.email && u.email.endsWith('@fopsapp.com')) continue; // safety net
    if (u.is_demo || u.is_demo_source) continue;

    const { count } = await sb.from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id);
    if (!count) {
      orphans.push(u);
    }
  }

  console.log(`orphan owner accounts (no subscription row): ${orphans.length}`);
  for (const u of orphans) {
    console.log(`  - ${u.email.padEnd(40)}  id=${u.id}  auth_user_id=${u.auth_user_id || 'null'}  status=${u.status}  created=${u.created_at}`);
  }

  if (!APPLY) {
    console.log('---');
    console.log('DRY RUN — no rows touched. Re-run with --apply when authorised.');
    process.exit(0);
  }

  if (orphans.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  console.log('---');
  console.log('APPLYING DELETES');
  const deleted = [];
  const failed = [];

  for (const u of orphans) {
    // BELT-AND-BRACES — refuse to delete if the email is in the allowlist.
    if (PROTECTED_EMAILS.has(u.email)) {
      console.warn(`  REFUSING — ${u.email} is in PROTECTED_EMAILS allowlist`);
      continue;
    }

    try {
      // Stripe customer (if any)
      const { data: sc } = await sb.from('stripe_customers')
        .select('stripe_customer_id').eq('user_id', u.id).maybeSingle();
      if (sc?.stripe_customer_id && stripe) {
        try { await stripe.customers.del(sc.stripe_customer_id); }
        catch (e) { console.warn(`    stripe customer delete failed: ${e?.message}`); }
      }
      await sb.from('stripe_customers').delete().eq('user_id', u.id);

      // Site assignment cleanup (in case orphan created one)
      await sb.from('operator_site_assignments').delete().eq('operator_user_id', u.id);
      await sb.from('staff_site_assignments').delete().eq('staff_user_id', u.id);
      // Owned sites — there shouldn't be any (no checkout = no owner workflow),
      // but defend against partial state by NOT cascading. A site with no
      // owner is recoverable; a wrongly-deleted site is not.
      const { count: ownedCount } = await sb.from('sites')
        .select('id', { count: 'exact', head: true }).eq('owner_id', u.id);
      if (ownedCount && ownedCount > 0) {
        console.warn(`    ${u.email} owns ${ownedCount} site(s) — SKIPPING delete to avoid orphaning sites. Manual review needed.`);
        failed.push({ ...u, reason: `owns ${ownedCount} sites` });
        continue;
      }

      // public.users
      await sb.from('users').delete().eq('id', u.id);
      // auth.users
      if (u.auth_user_id) {
        try { await sb.auth.admin.deleteUser(u.auth_user_id); }
        catch (e) { console.warn(`    auth.users delete failed: ${e?.message}`); }
      }
      console.log(`  deleted ${u.email}  (id=${u.id})`);
      deleted.push(u);
    } catch (e) {
      console.error(`  FAILED ${u.email}: ${e?.message}`);
      failed.push({ ...u, reason: e?.message });
    }
  }

  console.log('---');
  console.log(`DELETED ${deleted.length} orphan owner account(s):`);
  for (const u of deleted) {
    console.log(`  ✓ ${u.email}  id=${u.id}  auth_user_id=${u.auth_user_id || 'null'}  was_status=${u.status}`);
  }
  if (failed.length) {
    console.log(`SKIPPED/FAILED ${failed.length}:`);
    for (const u of failed) console.log(`  ✗ ${u.email}  reason=${u.reason}`);
  }

  // Belt-and-braces: post-run sanity check that vinamaytraders survived.
  const { data: sumanth } = await sb.from('users')
    .select('id, email, name').eq('email', 'vinamaytraders@gmail.com').maybeSingle();
  console.log('---');
  console.log('post-run sanity check: vinamaytraders@gmail.com →',
    sumanth ? `OK present (id=${sumanth.id} name=${sumanth.name})` : 'MISSING — INVESTIGATE!');
})().catch((e) => { console.error(e); process.exit(1); });
