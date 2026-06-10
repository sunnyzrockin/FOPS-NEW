/**
 * POST /api/stripe/webhook
 *
 * Stripe will POST signed events here. We verify the signature against
 * STRIPE_WEBHOOK_SECRET, then upsert the corresponding subscription /
 * customer rows. Every event id is recorded in stripe_webhook_events for
 * idempotency — Stripe will retry on any non-2xx, so writes MUST be safe
 * to replay.
 *
 * IMPORTANT: This route reads the raw body (no JSON parsing) because
 * Stripe's signature is computed over the exact bytes that were sent.
 */
import { NextResponse } from 'next/server';
import { stripe, tierForPriceId } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
// Don't let Next.js parse the body — Stripe needs the raw bytes.
export const runtime = 'nodejs';

async function recordEvent(event) {
  // Idempotency log: ignore if we've already processed this event.
  const { data: existing } = await supabaseAdmin
    .from('stripe_webhook_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (existing) return { duplicate: true };

  await supabaseAdmin.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: event,
  });
  return { duplicate: false };
}

async function upsertSubscription(sub) {
  // Resolve our internal user_id. Three options in priority order:
  //   1) Stripe metadata.user_id we attached on checkout
  //   2) Lookup via stripe_customers table
  //   3) Lookup via stripe.customers.retrieve().metadata.user_id
  let userId = sub?.metadata?.user_id || null;
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

  if (!userId && customerId) {
    const { data: cust } = await supabaseAdmin
      .from('stripe_customers')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    userId = cust?.user_id || null;
  }

  if (!userId && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      userId = customer?.metadata?.user_id || null;
      if (userId && customer.email) {
        await supabaseAdmin.from('stripe_customers').upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            email: customer.email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      }
    } catch (_) {
      // ignore — we'll just skip the upsert below
    }
  }

  if (!userId) {
    
    console.warn('[stripe/webhook] could not resolve user_id for sub', sub.id);
    return;
  }

  const item = sub?.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const productId = item?.price?.product || null;
  const planTier =
    sub?.metadata?.tier ||
    tierForPriceId(priceId) ||
    null;

  const row = {
    id: sub.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: sub.status,
    price_id: priceId,
    product_id: productId,
    plan_tier: planTier,
    quantity: item?.quantity ?? 1,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    trial_end: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    canceled_at: sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null,
    raw: sub,
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin.from('subscriptions').upsert(row, { onConflict: 'id' });
}

export async function POST(request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this server' },
      { status: 503 }
    );
  }
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not set on this server' },
      { status: 503 }
    );
  }

  // Read raw body for signature verification
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err) {
    
    console.error('[stripe/webhook] signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature', detail: err.message },
      { status: 400 }
    );
  }

  try {
    const { duplicate } = await recordEvent(event);
    if (duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        // The subscription object is created here. Fetch the full sub
        // (the session only has the id) so we can persist all fields.
        const session = event.data.object;
        if (session?.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const fullSub = await stripe.subscriptions.retrieve(subId, {
            expand: ['items.data.price'],
          });
          // Carry session metadata onto the sub for user_id resolution.
          if (session.metadata?.user_id && !fullSub.metadata?.user_id) {
            fullSub.metadata = {
              ...(fullSub.metadata || {}),
              ...session.metadata,
            };
          }
          await upsertSubscription(fullSub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await upsertSubscription(event.data.object);
        break;
      }
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        if (inv?.subscription) {
          const subId =
            typeof inv.subscription === 'string'
              ? inv.subscription
              : inv.subscription.id;
          const fullSub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription(fullSub);
        }
        break;
      }
      default:
        // Recorded in stripe_webhook_events but no business action.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    
    console.error('[stripe/webhook] handler error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed', detail: err.message },
      { status: 500 }
    );
  }
}
