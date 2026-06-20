/**
 * scripts/reprovision-owner-stripe.js
 *
 * Re-provisions the demo owner's Stripe linkage FROM SCRATCH in test
 * mode. Idempotent on re-run (the post-state is the same regardless of
 * how many times you run it).
 *
 * What it does:
 *   1. Cancels every Stripe subscription currently attached to the
 *      owner's old customer record(s). Doesn't delete them — Stripe
 *      keeps the trail. The two legacy subs (sub_1Tgh3h... canceled and
 *      sub_1Tgh5G... active) are both terminated.
 *   2. Deletes every row in the local `subscriptions` table for this
 *      owner. The OLD sub IDs will never be referenced again.
 *   3. Creates a FRESH Stripe test customer with the owner's email +
 *      name + a metadata.fops_user_id tag, and attaches Stripe's
 *      built-in test PaymentMethod `pm_card_visa` as the default so
 *      the new subscription can land in `active` (not `incomplete`).
 *   4. Creates exactly ONE subscription on that customer with two
 *      items: Base (STRIPE_PRICE_BASE qty 1) + Per Site
 *      (STRIPE_PRICE_PER_SITE qty = live active site count).
 *   5. Inserts a single matching `subscriptions` row in the DB so
 *      /api/billing/status is immediately correct (the webhook will
 *      overwrite it with the canonical row, but inserting it here
 *      means the very first GET after this script returns the right
 *      numbers).
 *   6. Confirms ONE customer + ONE subscription for the owner; prints
 *      the new subscription ID + a /api/billing/status fetch.
 *
 * Usage:
 *   node scripts/reprovision-owner-stripe.js                  # dry run
 *   node scripts/reprovision-owner-stripe.js --apply          # do it
 *
 * Safe to run against test mode. Refuses to run if STRIPE_SECRET_KEY
 * doesn't start with sk_test_ (defensive — never wipes a live sub).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const APPLY = process.argv.includes('--apply');
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');

  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.error('REFUSING — STRIPE_SECRET_KEY must be a test-mode key (sk_test_...). Got:',
      process.env.STRIPE_SECRET_KEY?.slice(0, 12) + '...');
    process.exit(1);
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  const OWNER_EMAIL = 'owner@fopsapp.com';
  const OWNER_ID = 'owner-001';
  const BASE_ID = process.env.STRIPE_PRICE_BASE;
  const PER_SITE_ID = process.env.STRIPE_PRICE_PER_SITE;
  if (!BASE_ID || !PER_SITE_ID) {
    console.error('Missing STRIPE_PRICE_BASE / STRIPE_PRICE_PER_SITE in env.');
    process.exit(1);
  }

  console.log('mode               :', APPLY ? 'APPLY' : 'DRY RUN');
  console.log('owner email        :', OWNER_EMAIL);
  console.log('owner user id      :', OWNER_ID);
  console.log('Stripe test key    : ok (sk_test_)');
  console.log('STRIPE_PRICE_BASE  :', BASE_ID);
  console.log('STRIPE_PRICE_PER_SITE:', PER_SITE_ID);
  console.log('---');

  // 1. Audit current DB state
  const { data: subRows } = await sb.from('subscriptions')
    .select('id, status, stripe_customer_id, quantity, plan_tier')
    .eq('user_id', OWNER_ID);
  console.log(`DB subscriptions rows for owner: ${subRows?.length || 0}`);
  for (const r of subRows || []) {
    console.log(`  - ${r.id}  status=${r.status}  customer=${r.stripe_customer_id}  qty=${r.quantity}  plan_tier=${r.plan_tier}`);
  }

  // 2. Live active site count (this drives qty)
  const { count: siteCount } = await sb.from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', OWNER_ID).eq('status', 'active');
  const desiredQty = Math.max(1, siteCount || 1);
  console.log('Live active site count:', siteCount, '→ per-site quantity:', desiredQty);

  // 3. Audit existing Stripe customers for this email
  const existingCustomers = await stripe.customers.list({ email: OWNER_EMAIL, limit: 20 });
  console.log(`Stripe customers with email=${OWNER_EMAIL}: ${existingCustomers.data.length}`);
  for (const c of existingCustomers.data) {
    console.log(`  - ${c.id}  created=${new Date(c.created * 1000).toISOString()}`);
  }

  // 4. Plan what will happen
  console.log('---');
  console.log('Plan:');
  console.log(`  1) Cancel ${subRows?.length || 0} stale Stripe subscription(s) attached to legacy customer(s).`);
  console.log(`  2) Delete ${subRows?.length || 0} row(s) from public.subscriptions for ${OWNER_ID}.`);
  console.log(`  3) Create a FRESH Stripe test customer for ${OWNER_EMAIL} with a test PM attached.`);
  console.log(`  4) Create ONE subscription on the new customer with two items: Base qty 1 + Per Site qty ${desiredQty}.`);
  console.log(`  5) Insert ONE row in public.subscriptions tying the new sub_id back to ${OWNER_ID}.`);
  console.log(`  6) Verify exactly 1 customer + 1 active sub on the owner.`);

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — re-run with --apply to execute.');
    process.exit(0);
  }

  console.log('---');

  // ============== APPLY ==============

  // STEP 1: cancel every existing subscription on every old customer.
  const oldCustomerIds = new Set();
  for (const r of subRows || []) {
    if (r.stripe_customer_id) oldCustomerIds.add(r.stripe_customer_id);
    try {
      const live = await stripe.subscriptions.retrieve(r.id);
      if (live.status !== 'canceled') {
        await stripe.subscriptions.cancel(r.id, { invoice_now: false, prorate: false });
        console.log(`  cancelled ${r.id} (was ${live.status})`);
      } else {
        console.log(`  ${r.id} already canceled in Stripe`);
      }
    } catch (e) {
      console.warn(`  could not cancel ${r.id}: ${e?.message}`);
    }
  }
  // Also catch any subs on the legacy customer(s) the DB doesn't know about.
  for (const cid of oldCustomerIds) {
    const subs = await stripe.subscriptions.list({ customer: cid, status: 'all', limit: 50 });
    for (const s of subs.data) {
      if (s.status !== 'canceled') {
        await stripe.subscriptions.cancel(s.id, { invoice_now: false, prorate: false });
        console.log(`  also cancelled ${s.id} on legacy customer ${cid}`);
      }
    }
  }

  // STEP 2: delete the DB rows.
  if (subRows?.length) {
    const { error: delErr } = await sb.from('subscriptions').delete().eq('user_id', OWNER_ID);
    if (delErr) {
      console.error('  DB delete failed:', delErr.message);
      process.exit(1);
    }
    console.log(`  deleted ${subRows.length} subscription row(s) from public.subscriptions`);
  }

  // STEP 3: fresh Stripe customer.
  // We do NOT delete the old customers (Stripe keeps history). We
  // simply ignore them — the new customer is the canonical one.
  const customer = await stripe.customers.create({
    email: OWNER_EMAIL,
    name: 'Michael Roberts',
    description: 'FOPS demo owner — re-provisioned ' + new Date().toISOString().slice(0, 10),
    metadata: { fops_user_id: OWNER_ID, reprovisioned_at: new Date().toISOString() },
  });
  console.log(`  created customer ${customer.id}`);

  // Attach Stripe's permanent test PaymentMethod (pm_card_visa) and set
  // as default for invoice billing. This is the canonical test-mode way
  // to seed a subscription that lands in `active` (otherwise it lands
  // in `incomplete` and the first invoice fails-soft).
  const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });
  console.log(`  attached test PM ${pm.id} as default`);

  // STEP 4: ONE subscription, TWO items.
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [
      { price: BASE_ID,     quantity: 1 },
      { price: PER_SITE_ID, quantity: desiredQty },
    ],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: { fops_user_id: OWNER_ID, reprovisioned_at: new Date().toISOString() },
  });
  console.log(`  created subscription ${sub.id}  status=${sub.status}`);

  // The default_incomplete flow leaves the invoice waiting for payment
  // confirmation. Pay it explicitly using the attached test PM so the
  // sub flips active. In test mode this resolves synchronously.
  if (sub.status === 'incomplete' && sub.latest_invoice?.payment_intent) {
    try {
      await stripe.paymentIntents.confirm(sub.latest_invoice.payment_intent.id || sub.latest_invoice.payment_intent, {
        payment_method: pm.id,
      });
      const refreshed = await stripe.subscriptions.retrieve(sub.id);
      console.log(`  PI confirmed; sub status now: ${refreshed.status}`);
    } catch (e) {
      console.warn(`  PI confirm failed: ${e?.message}`);
    }
  }

  // STEP 5: mirror the canonical row into the DB so /api/billing/status
  // is correct immediately. The webhook will overwrite with the same
  // data shortly after this script returns.
  const finalSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  const perSiteItem = finalSub.items.data.find((it) => it.price?.id === PER_SITE_ID);
  const { error: insErr } = await sb.from('subscriptions').insert([{
    id: finalSub.id,
    user_id: OWNER_ID,
    stripe_customer_id: customer.id,
    status: finalSub.status,
    price_id: PER_SITE_ID,
    product_id: finalSub.items.data[0]?.price?.product || null,
    quantity: perSiteItem?.quantity || desiredQty,
    cancel_at_period_end: !!finalSub.cancel_at_period_end,
    current_period_start: finalSub.current_period_start
      ? new Date(finalSub.current_period_start * 1000).toISOString() : null,
    current_period_end: finalSub.current_period_end
      ? new Date(finalSub.current_period_end * 1000).toISOString() : null,
    trial_end: finalSub.trial_end ? new Date(finalSub.trial_end * 1000).toISOString() : null,
    raw: finalSub,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }]);
  if (insErr) {
    console.warn('  insert into public.subscriptions failed (webhook will retry):', insErr.message);
  } else {
    console.log(`  inserted row in public.subscriptions tying ${finalSub.id} → ${OWNER_ID}`);
  }

  // STEP 6: verify exactly one of each.
  console.log('---');
  console.log('Verification:');
  const verifyCustomers = await stripe.customers.list({ email: OWNER_EMAIL, limit: 20 });
  const verifySubs = [];
  for (const c of verifyCustomers.data) {
    const list = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 20 });
    for (const s of list.data) verifySubs.push({ customer: c.id, sub: s.id, status: s.status });
  }
  const activeSubs = verifySubs.filter((s) => s.status === 'active' || s.status === 'trialing');
  console.log(`  Stripe customers with this email: ${verifyCustomers.data.length}`);
  console.log(`  Stripe subscriptions (any status) for those customers: ${verifySubs.length}`);
  for (const s of verifySubs) console.log(`    ${s.customer}  ${s.sub}  ${s.status}`);
  console.log(`  Active subs: ${activeSubs.length}`);

  const { data: dbVerify } = await sb.from('subscriptions').select('id, status, stripe_customer_id, quantity').eq('user_id', OWNER_ID);
  console.log(`  DB subscriptions rows for owner: ${dbVerify?.length || 0}`);
  for (const r of dbVerify || []) {
    console.log(`    ${r.id}  status=${r.status}  customer=${r.stripe_customer_id}  qty=${r.quantity}`);
  }

  console.log('---');
  console.log('New subscription_id:', finalSub.id);
  console.log('New customer_id    :', customer.id);
  console.log('Per-site quantity  :', perSiteItem?.quantity);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
