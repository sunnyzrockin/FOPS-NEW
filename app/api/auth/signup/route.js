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
import { rateLimit, clientIp } from '@/lib/auth-helpers';
import { validatePasswordPolicy } from '@/lib/auth-password-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function POST(request) {
  try {
    // ── Rate limit FIRST (before parsing body) ──────────────────────────
    // Best-effort: per-instance in-memory. Primary protection is the
    // Supabase platform sign-up rate limit (Part A3). See
    // memory/auth-hardening-followups.md for the strategy decision.
    const ip = clientIp(request);
    const rl = rateLimit(
      { key: `signup:${ip}`, limit: 5, windowMs: 60_000 },
      request,
    );
    if (!rl.ok) return rl.response;

    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 },
      );
    }

    // ── Server-side password policy (B1) ─────────────────────────────────
    // The client form does its own check but a JSON client could bypass
    // it. This is the authoritative gate. Defence in depth on top of the
    // Supabase dashboard policy from Part A.
    const pwCheck = validatePasswordPolicy(password);
    if (!pwCheck.ok) {
      return NextResponse.json(
        {
          error: 'Password does not meet policy',
          detail: pwCheck.message,
          errors: pwCheck.errors,
        },
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

    // 3) Create Stripe Customer (rollback-tracked).
    //
    // From here onward, if ANYTHING throws we must roll back the
    // auth.users + public.users + (possibly) stripe_customers rows,
    // otherwise the email is "stuck taken" (users.email is UNIQUE) and
    // the user can't retry. The old code returned the generic 500
    // catch-all without any rollback and left orphaned half-accounts —
    // confirmed by the prior signup failures on prod.
    let customer = null;
    let stripeCustomerRowInserted = false;
    try {
      customer = await stripe.customers.create({
        email, name,
        metadata: { user_id: user.id, role },
      });
      await supabaseAdmin.from('stripe_customers').upsert({
        user_id: user.id,
        stripe_customer_id: customer.id,
        email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      stripeCustomerRowInserted = true;

      // 4) Mint Checkout Session
      const origin = request.headers.get('origin')
        || process.env.NEXT_PUBLIC_BASE_URL
        || 'http://localhost:3000';

      // STRIPE RULE: a Checkout Session cannot have BOTH
      // `allow_promotion_codes: true` AND a `discounts`/coupon on the
      // session — Stripe rejects the API call with "You cannot specify
      // both allow_promotion_codes and discounts on the same session."
      // When an intro coupon is configured (env BILLING_INTRO_DISCOUNT_COUPON)
      // we MUST send the discount on `session.discounts` and suppress
      // allow_promotion_codes; otherwise we enable promo codes so users
      // can self-apply Stripe-issued ones.
      //
      // Note: the coupon is attached at the SESSION level (`discounts`),
      // not under `subscription_data` (the latter is not a valid param
      // — the prior code's `subscription_data.discount` would have
      // 400-ed every signup attempt that had a coupon set in env).
      const hasIntroCoupon = !!BILLING_CONFIG.introDiscountCoupon;
      const sessionParams = {
        mode: 'subscription',
        customer: customer.id,
        line_items: buildLineItems({ siteQuantity: 1 }),
        // CARD UPFRONT during trial — this is the entire atomic-gate point.
        payment_method_collection: 'always',
        subscription_data: {
          trial_period_days: BILLING_CONFIG.trialDays,
          metadata: { user_id: user.id },
        },
        success_url: `${origin}/app?signup=complete&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${origin}/signup?cancelled=1`,
        metadata: { user_id: user.id, flow: 'signup_trial_v2' },
      };
      if (hasIntroCoupon) {
        sessionParams.discounts = [{ coupon: BILLING_CONFIG.introDiscountCoupon }];
      } else {
        sessionParams.allow_promotion_codes = true;
      }
      const session = await stripe.checkout.sessions.create(sessionParams);

      return NextResponse.json({
        user,
        checkoutUrl: session.url,
        sessionId: session.id,
        message: 'Account created. Redirect the user to checkoutUrl to start the 14-day trial.',
      });
    } catch (stripeErr) {
      // ROLLBACK: undo everything we just created so the email isn't
      // stuck "taken". Each delete is best-effort — we always return
      // the original error to the caller so they see why signup failed.
      console.error('[signup] stripe phase failed, rolling back:', stripeErr?.message);
      try {
        if (stripeCustomerRowInserted) {
          await supabaseAdmin.from('stripe_customers').delete().eq('user_id', user.id);
        }
        if (customer?.id) {
          // Detach the stripe customer too (test mode safe). Delete > archive
          // because the auth.users id is what indexes everything; we want a
          // clean slate.
          try { await stripe.customers.del(customer.id); } catch (_) { /* non-fatal */ }
        }
        await supabaseAdmin.from('users').delete().eq('id', user.id);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        console.log('[signup] rollback complete for', email);
      } catch (rollbackErr) {
        console.error('[signup] rollback ALSO failed (manual cleanup needed):', rollbackErr?.message);
      }
      // Surface the real Stripe error so the user sees what to fix.
      return NextResponse.json(
        {
          error: 'Stripe checkout setup failed',
          detail: stripeErr?.message,
          rolled_back: true,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('[signup] unexpected:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred', detail: error?.message },
      { status: 500 },
    );
  }
}

export const OPTIONS = optionsHandler;
