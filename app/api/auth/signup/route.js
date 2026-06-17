/**
 * POST /api/auth/signup
 *
 * SIGNUP v2 — Owner-default + 14-day card-upfront trial.
 *
 * Flow (atomic gate):
 *   1. Validate body. Role is HARD-CODED to 'owner' (no privilege escalation).
 *   2. Create Supabase auth user + users row (role=owner, status=active).
 *   3. Create a Stripe Customer.
 *   4. Mint a Stripe Checkout Session in SUBSCRIPTION mode with:
 *        - line_items: base + per-site (qty 1)
 *        - trial_period_days: 14
 *        - payment_method_collection: 'always'  → card on file, NOT charged
 *        - success_url / cancel_url back to /app
 *   5. Return { user, checkoutUrl } so the client can redirect immediately.
 *
 * Until the user completes Checkout, the subscription row doesn't exist;
 * the BillingGate on the app shell sees `no_subscription` and shows a
 * blocking 'Finish setup' card. They can't operate the tenant without
 * landing a 'trialing' subscription via webhook.
 *
 * Server-only secrets (STRIPE_SECRET_KEY, SERVICE_ROLE_KEY) never leave
 * this handler.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { optionsHandler } from '@/lib/api/cors';
import { stripe, BILLING_CONFIG, buildLineItems, billingConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 },
      );
    }

    if (!billingConfigured()) {
      return NextResponse.json(
        { error: 'Billing is not configured on this server. Contact support.' },
        { status: 503 },
      );
    }

    // Hard-coded server-side. Never trust the client.
    const role = 'owner';

    // 1) Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name, role },
    });
    if (authError) {
      console.error('[signup] auth create failed:', authError);
      return NextResponse.json({ error: authError.message || 'Failed to create account' }, { status: 400 });
    }

    // 2) Create users row
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name, email, role,
      status: 'active',
      first_login: true,
      is_demo: false,
      is_demo_source: false,
    };

    // Hard-guard: a signup MUST NEVER land on the demo source tenant.
    // This is belt-and-braces — uuidv4() can't produce the seed id like
    // 'owner-001' in practice, but if someone ever bypasses or seeds
    // manually we still refuse.
    try {
      const { assertSignupNotDemoSource } = await import('@/lib/demo-source');
      await assertSignupNotDemoSource(newUser);
    } catch (guardErr) {
      console.error('[signup] demo-source guard:', guardErr.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Signup blocked', detail: guardErr.message }, { status: 409 });
    }

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users').insert([newUser]).select().single();
    if (dbError) {
      console.error('[signup] users insert failed:', dbError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create user record', detail: dbError.message }, { status: 500 });
    }

    // 3) Create Stripe Customer
    const customer = await stripe.customers.create({
      email, name,
      metadata: { user_id: user.id, role },
    });
    await supabaseAdmin.from('stripe_customers').upsert({
      user_id: user.id,
      stripe_customer_id: customer.id,
      email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // 4) Mint Checkout Session
    const origin = request.headers.get('origin')
      || process.env.NEXT_PUBLIC_BASE_URL
      || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: buildLineItems({ siteQuantity: 1 }),
      // CARD UPFRONT during trial — this is the entire atomic-gate point.
      payment_method_collection: 'always',
      subscription_data: {
        trial_period_days: BILLING_CONFIG.trialDays,
        metadata: { user_id: user.id },
        // Apply intro discount if configured.
        ...(BILLING_CONFIG.introDiscountCoupon ? { discount: [{ coupon: BILLING_CONFIG.introDiscountCoupon }] } : {}),
      },
      allow_promotion_codes: true,
      success_url: `${origin}/app?signup=complete&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/signup?cancelled=1`,
      metadata: { user_id: user.id, flow: 'signup_trial_v2' },
    });

    return NextResponse.json({
      user,
      checkoutUrl: session.url,
      sessionId: session.id,
      message: 'Account created. Redirect the user to checkoutUrl to start the 14-day trial.',
    });
  } catch (error) {
    console.error('[signup] unexpected:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred', detail: error?.message },
      { status: 500 },
    );
  }
}

export const OPTIONS = optionsHandler;
