/**
 * scripts/inspect-stripe-sub.js
 * Read-only inspector — dumps a Stripe subscription so we can decide
 * how to migrate it onto the v2 base + per-site line items.
 *
 * Usage:
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/inspect-stripe-sub.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@fopsapp.com';

  const { data: owner } = await sb.from('users').select('id, email').eq('email', OWNER_EMAIL).maybeSingle();
  const { data: sub } = await sb.from('subscriptions').select('id').eq('user_id', owner.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  console.log('Configured prices:');
  console.log('  base    :', process.env.STRIPE_PRICE_BASE);
  console.log('  per_site:', process.env.STRIPE_PRICE_PER_SITE);
  console.log('---');

  const fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price.product'] });
  console.log('Stripe sub:', fullSub.id, 'status=', fullSub.status, 'customer=', fullSub.customer);
  for (const it of fullSub.items.data) {
    console.log('  item:', it.id);
    console.log('    price:    ', it.price?.id);
    console.log('    quantity: ', it.quantity);
    console.log('    unit_amount:', it.price?.unit_amount, it.price?.currency);
    console.log('    recurring:  ', JSON.stringify(it.price?.recurring));
    console.log('    product:    ', it.price?.product?.id || it.price?.product, '-', it.price?.product?.name);
    console.log('    nickname:   ', it.price?.nickname);
  }

  // Inspect the configured prices to see if they exist & are usable
  console.log('---');
  for (const pid of [process.env.STRIPE_PRICE_BASE, process.env.STRIPE_PRICE_PER_SITE]) {
    try {
      const p = await stripe.prices.retrieve(pid, { expand: ['product'] });
      console.log('configured price:', pid, 'amount=', p.unit_amount, p.currency, 'recurring=', JSON.stringify(p.recurring), 'product=', p.product?.name || p.product);
    } catch (e) {
      console.log('configured price MISSING:', pid, '-', e.message);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
