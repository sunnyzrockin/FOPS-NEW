/**
 * scripts/setup-demo-owner.js
 *
 * Provisions a fixed READ-ONLY demo owner user that the "Explore the
 * demo" CTA logs into. Idempotent: re-running is safe.
 *
 * It does NOT create any sites — use scripts/seed-wetstock-tier1.js for
 * KINGSTHORPE, and reassign owner_id to this user. (Or run that script
 * after this one with the demo user's id.)
 *
 * Env-driven:
 *   BILLING_DEMO_OWNER_EMAIL     (default demo@workflowlite.com)
 *   BILLING_DEMO_OWNER_PASSWORD  (default DemoReadOnly2026!)
 */
const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const EMAIL    = process.env.BILLING_DEMO_OWNER_EMAIL    || 'demo@workflowlite.com';
const PASSWORD = process.env.BILLING_DEMO_OWNER_PASSWORD || 'DemoReadOnly2026!';

async function main() {
  console.log('Provisioning demo owner:', EMAIL);

  // Find existing user row.
  const { data: existing } = await sb.from('users').select('*').eq('email', EMAIL).maybeSingle();

  let authUserId = existing?.auth_user_id;

  if (!authUserId) {
    // Look up auth user by email (Supabase has no direct getByEmail; list and filter).
    const { data: list } = await sb.auth.admin.listUsers();
    const found = (list?.users || []).find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
    if (found) authUserId = found.id;
  }

  if (!authUserId) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { name: 'Demo Owner', role: 'owner', is_demo: true },
    });
    if (error) { console.error('createUser failed:', error.message); process.exit(1); }
    authUserId = created.user.id;
    console.log('✓ Created auth user', authUserId);
  } else {
    // Ensure password matches (for repeatable seeding).
    await sb.auth.admin.updateUserById(authUserId, { password: PASSWORD });
    console.log('= auth user already exists', authUserId);
  }

  if (!existing) {
    const { error } = await sb.from('users').insert({
      id: uuidv4(),
      auth_user_id: authUserId,
      name: 'Demo Owner',
      email: EMAIL,
      role: 'owner',
      status: 'active',
      first_login: false,
      is_demo: true,
    });
    if (error) { console.error('users insert failed:', error.message); process.exit(1); }
    console.log('✓ Created users row with is_demo=true');
  } else if (!existing.is_demo) {
    await sb.from('users').update({ is_demo: true }).eq('id', existing.id);
    console.log('✓ Set is_demo=true on existing users row');
  } else {
    console.log('= users row already marked is_demo');
  }

  // Update .env hints
  let body = fs.readFileSync(envPath, 'utf8');
  for (const [k, v] of Object.entries({ BILLING_DEMO_OWNER_EMAIL: EMAIL, BILLING_DEMO_OWNER_PASSWORD: PASSWORD })) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(body)) body = body.replace(re, `${k}=${v}`);
    else body += `\n${k}=${v}`;
  }
  fs.writeFileSync(envPath, body);

  console.log('\n✓ Demo owner ready. Update .env wrote BILLING_DEMO_OWNER_* keys.');
  console.log(`   email:    ${EMAIL}`);
  console.log(`   password: ${PASSWORD}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
