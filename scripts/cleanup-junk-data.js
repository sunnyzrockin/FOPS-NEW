/**
 * scripts/cleanup-junk-data.js
 *
 * Bug #10: hygiene cleanup of leftover test artefacts on the live DB.
 *
 * SAFETY RAILS:
 *   - vinamaytraders@gmail.com (operator "Sumanth") is a REAL CUSTOMER
 *     and is EXPLICITLY EXCLUDED from every code path. Triple-checked
 *     below.
 *   - Dry-run by default. --apply required to mutate.
 *   - --scope flag lets the operator narrow the cleanup pass:
 *       fuel-grades   : remove TestOwnerGrade from fuel_grades
 *       invites       : remove invites/users matching the test hygiene list
 *       all (default) : both of the above
 *
 * Usage:
 *   node scripts/cleanup-junk-data.js                                # dry run, all scopes
 *   node scripts/cleanup-junk-data.js --apply                        # mutate, all scopes
 *   node scripts/cleanup-junk-data.js --apply --scope=fuel-grades    # just the grade
 *   node scripts/cleanup-junk-data.js --apply --scope=invites        # just the user/invite list
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const PROTECTED_EMAILS = new Set([
  'vinamaytraders@gmail.com', // Sumanth — REAL CUSTOMER, never touch.
  // Keep the seed accounts protected too.
  'owner@fopsapp.com',
  'operator@fopsapp.com',
  'operator2@fopsapp.com',
  'staff@fopsapp.com',
  'demo@fopsapp.com',
  'support@fopsapp.com',
]);

const TEST_EMAILS = [
  'test+regression@example.com',
  'teststaff-operator@test.com',
  'testop2@example.com',
  'newtest@example.com',
];

const JUNK_FUEL_GRADE_CODES = [
  'TestOwnerGrade',
];

(async () => {
  const APPLY = process.argv.includes('--apply');
  const scopeArg = process.argv.find((a) => a.startsWith('--scope=')) || '';
  const SCOPE = scopeArg.split('=')[1] || 'all';

  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('mode  :', APPLY ? 'APPLY' : 'DRY RUN');
  console.log('scope :', SCOPE);
  console.log('PROTECTED_EMAILS:', Array.from(PROTECTED_EMAILS).join(', '));
  console.log('---');

  // -------- Fuel grades --------
  if (SCOPE === 'all' || SCOPE === 'fuel-grades') {
    const { data: grades } = await sb.from('fuel_grades')
      .select('code, label')
      .in('code', JUNK_FUEL_GRADE_CODES);
    console.log(`fuel_grades to remove: ${grades?.length || 0}`);
    for (const g of grades || []) {
      console.log(`  code=${g.code} label="${g.label}"`);
    }
    if (APPLY && grades?.length) {
      for (const g of grades) {
        const { error } = await sb.from('fuel_grades').delete().eq('code', g.code);
        if (error) console.warn(`  delete ${g.code}: ${error.message}`);
        else console.log(`  deleted ${g.code}`);
      }
    }
    console.log('---');
  }

  // -------- Invites + users --------
  if (SCOPE === 'all' || SCOPE === 'invites') {
    // Filter the test email list against PROTECTED_EMAILS (defence in depth).
    const targets = TEST_EMAILS.filter((e) => !PROTECTED_EMAILS.has(e));
    console.log(`hygiene email targets: ${targets.length}`);

    // 1. invites table
    const { data: invites } = await sb.from('invites')
      .select('id, email, role, status').in('email', targets);
    console.log(`invites rows to remove: ${invites?.length || 0}`);
    for (const i of invites || []) {
      console.log(`  invite id=${i.id} email=${i.email} role=${i.role} status=${i.status}`);
    }

    // 2. users table — but ONLY ones in TEST_EMAILS, never protected.
    const { data: users } = await sb.from('users')
      .select('id, email, role, name')
      .in('email', targets);
    console.log(`users rows to remove: ${users?.length || 0}`);
    for (const u of users || []) {
      if (PROTECTED_EMAILS.has(u.email)) {
        console.warn(`  REFUSING to delete protected email: ${u.email}`);
        continue;
      }
      console.log(`  user id=${u.id} email=${u.email} role=${u.role} name=${u.name}`);
    }

    if (APPLY) {
      // Delete invites first
      for (const i of invites || []) {
        await sb.from('invites').delete().eq('id', i.id);
      }
      // Then user rows, guarded by PROTECTED_EMAILS once more
      for (const u of users || []) {
        if (PROTECTED_EMAILS.has(u.email)) continue;
        // Remove operator/staff site assignments first to avoid FK errors
        await sb.from('operator_site_assignments').delete().eq('operator_user_id', u.id);
        await sb.from('staff_site_assignments').delete().eq('staff_user_id', u.id);
        const { error } = await sb.from('users').delete().eq('id', u.id);
        if (error) console.warn(`  user delete ${u.email}: ${error.message}`);
        else console.log(`  deleted user ${u.email}`);
      }
    }

    // Belt-and-braces audit: did vinamaytraders@gmail.com survive?
    const { data: sumanth } = await sb.from('users')
      .select('id, email, name').eq('email', 'vinamaytraders@gmail.com').maybeSingle();
    console.log('post-run sanity check: vinamaytraders@gmail.com →',
      sumanth ? `OK present (id=${sumanth.id} name=${sumanth.name})` : 'MISSING — INVESTIGATE!');
    console.log('---');
  }

  if (!APPLY) {
    console.log('DRY RUN — nothing changed. Re-run with --apply (and optional --scope=) when authorised.');
  }
})().catch((e) => { console.error(e); process.exit(1); });
