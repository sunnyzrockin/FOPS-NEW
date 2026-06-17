/**
 * scripts/verify-quantity-sync.js
 *
 * Phase 1 verification for Bug #1 (Stripe quantity sync not firing).
 *
 * What it does:
 *   1. Counts the owner's active sites in Supabase.
 *   2. Reads the latest subscription row (`quantity`) for that owner.
 *   3. Fetches the live Stripe subscription quantity for the per-site item.
 *   4. Reports drift across all three numbers.
 *   5. Optionally calls `syncQuantityForOwner` to heal drift.
 *
 * Usage:
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/verify-quantity-sync.js          # report only
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/verify-quantity-sync.js --fix    # heal drift
 *
 * Safe to run against prod-mirrored data. Performs only one Stripe write
 * when --fix is passed, and that write is prorated.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const PER_SITE_PRICE_ID = process.env.STRIPE_PRICE_PER_SITE;
  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@fopsapp.com';
  const FIX = process.argv.includes('--fix');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY');
    process.exit(1);
  }
  if (!PER_SITE_PRICE_ID) {
    console.error('Missing STRIPE_PRICE_PER_SITE');
    process.exit(1);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  // Find the owner row
  const { data: owner, error: ownerErr } = await sb
    .from('users').select('id, email, role, is_demo').eq('email', OWNER_EMAIL).maybeSingle();
  if (ownerErr || !owner) {
    console.error('Could not find owner with email', OWNER_EMAIL, ownerErr?.message);
    process.exit(1);
  }
  console.log('OWNER:', owner.id, owner.email, owner.is_demo ? '(DEMO — skipping)' : '');
  if (owner.is_demo) process.exit(0);

  // Count active sites
  const { count: liveCount, error: countErr } = await sb
    .from('sites').select('id', { count: 'exact', head: true })
    .eq('owner_id', owner.id).eq('status', 'active');
  if (countErr) {
    console.error('Site count failed:', countErr.message);
    process.exit(1);
  }
  console.log('LIVE active site count:', liveCount);

  // Read DB subscription quantity
  const { data: sub, error: subErr } = await sb
    .from('subscriptions')
    .select('id, status, quantity, current_period_end')
    .eq('user_id', owner.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (subErr) {
    console.error('Subscription query failed:', subErr.message);
    process.exit(1);
  }
  if (!sub) {
    console.log('NO subscription row — nothing to sync.');
    process.exit(0);
  }
  console.log('DB subscription:', sub.id, 'status=', sub.status, 'quantity=', sub.quantity);

  // Read live Stripe quantity
  const fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  const perSiteItem = fullSub.items.data.find((it) => it.price?.id === PER_SITE_PRICE_ID);
  if (!perSiteItem) {
    console.error('per_site_item not found on Stripe subscription. Available price ids:',
      fullSub.items.data.map((it) => it.price?.id));
    process.exit(1);
  }
  console.log('STRIPE per-site item:', perSiteItem.id, 'quantity=', perSiteItem.quantity);

  const desired = Math.max(1, liveCount || 1);
  const drift = perSiteItem.quantity !== desired || sub.quantity !== desired;

  console.log('---');
  console.log('Desired qty (sites):', desired);
  console.log('Stripe qty        :', perSiteItem.quantity);
  console.log('DB qty            :', sub.quantity);
  console.log('Drift             :', drift ? 'YES' : 'NO');

  if (!drift) {
    console.log('OK — all three are in sync.');
    process.exit(0);
  }

  if (!FIX) {
    console.log('');
    console.log('Re-run with --fix to push the Stripe update and heal drift.');
    process.exit(2);
  }

  console.log('Applying Stripe update…');
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: perSiteItem.id, quantity: desired }],
    proration_behavior: 'always_invoice',
  });
  await sb.from('subscriptions').update({ quantity: desired, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  console.log('Stripe + DB updated to qty', desired);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
