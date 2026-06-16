/**
 * lib/billing-sync.js — keep Stripe subscription quantity in sync with
 * the owner's active site count.
 *
 * Call after any site create/delete or anywhere that materially changes
 * the count. Safe to call when no subscription exists yet (no-ops).
 */
import { stripe, BILLING_CONFIG } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

async function activeSiteCount(ownerId) {
  const { count } = await supabaseAdmin
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('status', 'active');
  return Math.max(1, count || 1); // never go below 1 (Stripe requires qty >= 1)
}

export async function syncQuantityForOwner(ownerId, { prorate = true } = {}) {
  if (!stripe || !BILLING_CONFIG.perSitePriceId) return { ok: false, reason: 'stripe_not_configured' };

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, raw')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return { ok: false, reason: 'no_subscription' };

  const desired = await activeSiteCount(ownerId);

  // Find the per-site item on the Stripe subscription.
  const fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  const perSiteItem = fullSub.items.data.find(
    (it) => it.price?.id === BILLING_CONFIG.perSitePriceId,
  );
  if (!perSiteItem) return { ok: false, reason: 'per_site_item_missing', subscriptionId: sub.id };

  if (perSiteItem.quantity === desired) {
    return { ok: true, unchanged: true, quantity: desired };
  }

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: perSiteItem.id, quantity: desired }],
    proration_behavior: prorate ? 'always_invoice' : 'none',
  });

  return { ok: true, quantity: desired, previous: perSiteItem.quantity };
}

/**
 * Build a proration preview WITHOUT mutating the subscription. Used by
 * the "Adding a site is +$X/mo, $Y today" confirmation in the UI.
 */
export async function previewQuantityChange(ownerId, newQuantity) {
  if (!stripe || !BILLING_CONFIG.perSitePriceId) return { ok: false, reason: 'stripe_not_configured' };

  const { data: sub } = await supabaseAdmin
    .from('subscriptions').select('id').eq('user_id', ownerId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return { ok: false, reason: 'no_subscription' };

  const fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  const perSiteItem = fullSub.items.data.find((it) => it.price?.id === BILLING_CONFIG.perSitePriceId);
  if (!perSiteItem) return { ok: false, reason: 'per_site_item_missing' };

  const upcoming = await stripe.invoices.createPreview({
    customer: fullSub.customer,
    subscription: sub.id,
    subscription_details: {
      items: [{ id: perSiteItem.id, quantity: Math.max(1, newQuantity) }],
      proration_behavior: 'always_invoice',
    },
  });

  // Pluck just the proration lines for the cleanest preview.
  const lines = (upcoming.lines?.data || []).map((l) => ({
    description: l.description,
    amount_cents: l.amount,
    currency: l.currency,
    quantity: l.quantity,
    proration: !!l.proration,
    period_end: l.period?.end ? new Date(l.period.end * 1000).toISOString() : null,
  }));

  return {
    ok: true,
    currency: upcoming.currency,
    total_cents: upcoming.total,
    amount_due_cents: upcoming.amount_due,
    next_period_total_cents: upcoming.amount_due,
    lines,
  };
}
