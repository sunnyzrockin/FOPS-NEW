/**
 * POST /api/stripe/checkout
 *
 * Body: { tier: 'starter' | 'growth' | 'enterprise' }
 * Returns: { url: <stripe checkout url> }
 *
 * Creates (or reuses) a Stripe Customer for the authenticated owner,
 * then mints a Checkout Session for the requested plan. The actual
 * subscription row is created later by the webhook handler when
 * Stripe sends `checkout.session.completed`.
 */
import { NextResponse } from 'next/server';
import { stripe, priceIdForTier, PLAN_CATALOG } from '@/lib/stripe';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this server' },
      { status: 503 }
    );
  }

  // Only owners can subscribe.
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;
  const owner = auth.user;

  let body;
  try {
    body = await request.json();
  } catch (_) {
    body = {};
  }
  const tier = (body?.tier || '').toString();

  if (!PLAN_CATALOG.find((p) => p.tier === tier)) {
    return NextResponse.json(
      { error: `Unknown plan tier '${tier}'`, validTiers: PLAN_CATALOG.map((p) => p.tier) },
      { status: 400 }
    );
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `Stripe Price ID not configured for tier '${tier}'`,
        hint: `Set ${PLAN_CATALOG.find((p) => p.tier === tier).priceEnvVar} in your environment.`,
      },
      { status: 503 }
    );
  }

  // -----------------------------------------------------------------
  // Ensure the owner has a Stripe Customer.
  // -----------------------------------------------------------------
  let stripeCustomerId = null;
  const { data: existing } = await supabaseAdmin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', owner.id)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    stripeCustomerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: owner.email,
      name: owner.name,
      metadata: { user_id: owner.id, role: owner.role },
    });
    stripeCustomerId = customer.id;
    await supabaseAdmin.from('stripe_customers').upsert(
      {
        user_id: owner.id,
        stripe_customer_id: stripeCustomerId,
        email: owner.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  }

  // -----------------------------------------------------------------
  // Build success/cancel URLs from the request origin so this works
  // in preview, dev, and prod without hardcoding.
  // -----------------------------------------------------------------
  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/app?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?tab=billing&checkout=cancelled`,
      subscription_data: {
        metadata: { user_id: owner.id, tier },
      },
      metadata: { user_id: owner.id, tier },
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (err) {
    
    console.error('[stripe/checkout] create session failed:', err);
    return NextResponse.json(
      { error: 'Failed to create checkout session', detail: err.message },
      { status: 500 }
    );
  }
}
