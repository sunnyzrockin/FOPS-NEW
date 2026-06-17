/**
 * scripts/migrate-sub-to-v2.js
 *
 * One-shot migration for tenants whose Stripe subscription still has v1
 * tier line items (Starter / Growth / Enterprise) and never picked up
 * the v2 base + per-site items. After this runs, syncQuantityForOwner
 * works for that tenant (finds the per-site item and updates qty).
 *
 * What it does (single atomic `stripe.subscriptions.update`):
 *   1. Marks all non-v2 items as `deleted: true`.
 *   2. Adds the v2 base price at qty 1.
 *   3. Adds the v2 per-site price at qty = active site count.
 *
 * Uses `proration_behavior: 'none'` — this is a billing-model migration,
 * not a usage change. The customer shouldn't see a surprise invoice.
 *
 * Usage:
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/migrate-sub-to-v2.js          # dry run (report)
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/migrate-sub-to-v2.js --apply  # actually do it
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');

  const APPLY = process.argv.includes('--apply');
  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@fopsapp.com';

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  const BASE_ID = process.env.STRIPE_PRICE_BASE;
  const PER_SITE_ID = process.env.STRIPE_PRICE_PER_SITE;
  if (!BASE_ID || !PER_SITE_ID) {
    console.error('Missing STRIPE_PRICE_BASE / STRIPE_PRICE_PER_SITE in env.');
    process.exit(1);
  }

  // 1. Resolve owner + subscription
  const { data: owner } = await sb.from('users')
    .select('id, email, is_demo').eq('email', OWNER_EMAIL).maybeSingle();
  if (!owner) {
    console.error('owner not found:', OWNER_EMAIL);
    process.exit(1);
  }
  if (owner.is_demo) {
    console.error('Refusing to migrate demo tenant. Pick a real owner.');
    process.exit(1);
  }
  const { data: subRow } = await sb.from('subscriptions')
    .select('id, status').eq('user_id', owner.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!subRow) {
    console.error('No subscription row for owner.');
    process.exit(1);
  }

  // 2. Read the live Stripe sub
  const fullSub = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
  console.log('Sub:', fullSub.id, 'status=', fullSub.status);
  console.log('Existing line items:');
  for (const it of fullSub.items.data) {
    const flag = (it.price?.id === BASE_ID) ? 'BASE-v2'
               : (it.price?.id === PER_SITE_ID) ? 'PER-SITE-v2'
               : 'LEGACY';
    console.log(`  - ${it.id} price=${it.price?.id} qty=${it.quantity}  [${flag}]`);
  }

  const hasBase = fullSub.items.data.some((it) => it.price?.id === BASE_ID);
  const hasPerSite = fullSub.items.data.some((it) => it.price?.id === PER_SITE_ID);
  const legacyItems = fullSub.items.data.filter(
    (it) => it.price?.id !== BASE_ID && it.price?.id !== PER_SITE_ID,
  );

  if (hasBase && hasPerSite && legacyItems.length === 0) {
    console.log('Already on v2 items — nothing to do.');
    process.exit(0);
  }

  // 3. Compute desired per-site quantity = active site count.
  const { count: liveCount } = await sb.from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', owner.id).eq('status', 'active');
  const desiredQty = Math.max(1, liveCount || 1);
  console.log('Active site count:', liveCount, '→ per-site quantity:', desiredQty);

  // 4. Build the items[] payload for one atomic update.
  const items = [];
  for (const it of legacyItems) items.push({ id: it.id, deleted: true });
  if (!hasBase) items.push({ price: BASE_ID, quantity: 1 });
  if (!hasPerSite) items.push({ price: PER_SITE_ID, quantity: desiredQty });

  console.log('Planned items[] mutation:');
  for (const i of items) console.log('  -', JSON.stringify(i));
  console.log('proration_behavior: none (billing-model migration, not a usage change)');

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN. Re-run with --apply to make the change.');
    process.exit(2);
  }

  // 5. Apply.
  const updated = await stripe.subscriptions.update(fullSub.id, {
    items,
    proration_behavior: 'none',
  });
  console.log('Stripe subscription updated. Items after:');
  for (const it of updated.items.data) {
    console.log(`  - ${it.id} price=${it.price?.id} qty=${it.quantity}`);
  }

  // 6. Mirror to DB so /api/billing/status reads the right quantity
  //    immediately (webhook will overwrite with the same numbers).
  const perSiteAfter = updated.items.data.find((it) => it.price?.id === PER_SITE_ID);
  if (perSiteAfter) {
    await sb.from('subscriptions').update({
      quantity: perSiteAfter.quantity, updated_at: new Date().toISOString(),
    }).eq('id', updated.id);
    console.log('DB subscriptions.quantity updated to', perSiteAfter.quantity);
  }

  console.log('Migration complete.');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
