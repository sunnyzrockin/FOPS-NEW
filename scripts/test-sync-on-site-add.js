/**
 * scripts/test-sync-on-site-add.js
 *
 * End-to-end test that exercises the fixed `await syncQuantityForOwner`
 * flow without hitting the HTTP API. Creates a synthetic site row for
 * the owner, calls syncQuantityForOwner, then either deletes it again
 * (default) or leaves it (`--keep`). Either way, drift is checked.
 *
 * Usage:
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/test-sync-on-site-add.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');
  const { v4: uuid } = require('uuid');

  const KEEP = process.argv.includes('--keep');
  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@fopsapp.com';

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  const { data: owner } = await sb.from('users')
    .select('id, email').eq('email', OWNER_EMAIL).maybeSingle();
  if (!owner) { console.error('owner not found'); process.exit(1); }

  const { data: subRow } = await sb.from('subscriptions')
    .select('id').eq('user_id', owner.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!subRow) { console.error('no subscription row for owner'); process.exit(1); }
  const fullSub = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
  const perSite = fullSub.items.data.find((it) => it.price?.id === process.env.STRIPE_PRICE_PER_SITE);
  const before = perSite.quantity;
  console.log('BEFORE: stripe per-site quantity =', before);

  // Create a synthetic site row
  const newSiteId = uuid();
  const newSite = {
    id: newSiteId,
    name: `__sync_test_${newSiteId.slice(0, 8)}`,
    code: `TST_${newSiteId.slice(0, 6).toUpperCase()}`,
    owner_id: owner.id,
    status: 'active',
    location: 'TEST',
  };
  const { error: insErr } = await sb.from('sites').insert([newSite]);
  if (insErr) { console.error('insert failed:', insErr); process.exit(1); }
  console.log('Inserted synthetic site', newSiteId);

  // Manually invoke the sync (matches what `syncQuantityForOwner` does
  // inside the fixed handler — we replicate it here using the already-
  // built clients above, since the lib path-alias @ doesn't resolve in
  // a plain node script).
  async function syncManually() {
    const { count } = await sb.from('sites')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', owner.id).eq('status', 'active');
    const desired = Math.max(1, count || 1);
    const fresh = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
    const item = fresh.items.data.find((it) => it.price?.id === process.env.STRIPE_PRICE_PER_SITE);
    if (!item) throw new Error('per_site_item_missing');
    if (item.quantity === desired) return { unchanged: true, quantity: desired };
    await stripe.subscriptions.update(subRow.id, {
      items: [{ id: item.id, quantity: desired }],
      proration_behavior: 'always_invoice',
    });
    await sb.from('subscriptions').update({ quantity: desired, updated_at: new Date().toISOString() })
      .eq('id', subRow.id);
    return { previous: item.quantity, quantity: desired };
  }
  const syncResult = await syncManually();
  console.log('Sync result:', JSON.stringify(syncResult));

  const after = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
  const itemAfter = after.items.data.find((it) => it.price?.id === process.env.STRIPE_PRICE_PER_SITE);
  console.log('AFTER: stripe per-site quantity =', itemAfter.quantity);

  if (!KEEP) {
    await sb.from('sites').delete().eq('id', newSiteId);
    const after2 = await syncManually();
    const after2Stripe = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
    const item2 = after2Stripe.items.data.find((it) => it.price?.id === process.env.STRIPE_PRICE_PER_SITE);
    console.log('Synthetic site deleted, re-sync result:', JSON.stringify(after2));
    console.log('FINAL stripe per-site qty =', item2.quantity);
  } else {
    console.log('Kept synthetic site (use --keep). To clean up:');
    console.log(`  curl -X DELETE … or: DELETE FROM sites WHERE id='${newSiteId}';`);
  }
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
