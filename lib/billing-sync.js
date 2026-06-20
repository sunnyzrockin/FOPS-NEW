/**
 * lib/billing-sync.js — keep Stripe subscription quantity in sync with
 * the owner's active site count.
 *
 * Call after any site create/delete or anywhere that materially changes
 * the count. Safe to call when no subscription exists yet (no-ops).
 *
 * IMPORTANT (Bug #1 fix): callers MUST `await` the result of this
 * function. Fire-and-forget on serverless platforms gets killed when
 * the parent request returns, so the Stripe update never lands and the
 * webhook never fires, leaving DB quantity stuck at 1.
 */
import { stripe, BILLING_CONFIG } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

const log = (...args) => console.log('[billing-sync]', ...args);
const warn = (...args) => console.warn('[billing-sync]', ...args);

export async function activeSiteCountForOwner(ownerId) {
  const { count, error } = await supabaseAdmin
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('status', 'active');
  if (error) {
    warn('activeSiteCountForOwner: count query failed', error.message);
    return 1;
  }
  return Math.max(1, count || 1); // Stripe requires qty >= 1
}

export async function syncQuantityForOwner(ownerId, { prorate = true } = {}) {
  // Be more specific than the bare `stripe_not_configured` — when the
  // sync no-ops on prod, the reason field should tell ops which env var
  // is actually missing so the fix is a Vercel one-liner, not a hunt.
  //
  // ALSO shape-validate the values: a previous prod incident set
  // STRIPE_SECRET_KEY to a Stripe product id (prod_…) instead of an
  // sk_ secret. Presence-only checks reported `set` and the call failed
  // downstream with 401 Invalid API Key. Catch that shape error here so
  // billing_env in /api/billing/status surfaces the bad-shape diagnosis
  // BEFORE we attempt the network call.
  const hasStripe = !!stripe;
  const hasPerSite = !!BILLING_CONFIG.perSitePriceId;
  const hasBase = !!BILLING_CONFIG.basePriceId;
  const secretRaw = process.env.STRIPE_SECRET_KEY || '';
  const secretShapeOk = /^sk_(test|live)_/.test(secretRaw);
  const perSiteShapeOk = !hasPerSite || /^price_/.test(BILLING_CONFIG.perSitePriceId);
  const baseShapeOk = !hasBase || /^price_/.test(BILLING_CONFIG.basePriceId);

  let reason = null;
  if (!hasStripe) reason = 'stripe_secret_missing';
  else if (!secretShapeOk) reason = 'stripe_secret_bad_shape';
  else if (!hasPerSite) reason = 'per_site_price_missing';
  else if (!perSiteShapeOk) reason = 'per_site_price_bad_shape';
  else if (!baseShapeOk) reason = 'base_price_bad_shape';

  if (reason) {
    warn('sync skipped —', reason, {
      STRIPE_SECRET_KEY_present: hasStripe,
      STRIPE_SECRET_KEY_shape_ok: secretShapeOk,
      STRIPE_PRICE_PER_SITE_present: hasPerSite,
      STRIPE_PRICE_PER_SITE_shape_ok: perSiteShapeOk,
      STRIPE_PRICE_BASE_present: hasBase,
      STRIPE_PRICE_BASE_shape_ok: baseShapeOk,
    });
    // For STRIPE_SECRET_KEY we redact aggressively — only first 4 chars +
    // length — so the diagnostic helps spot a prod_… vs sk_… mistake
    // without leaking the secret to anyone with read access to the API.
    const redactedSecret = secretRaw ? `${secretRaw.slice(0, 4)}***(${secretRaw.length} chars)` : 'MISSING';
    return {
      ok: false,
      reason,
      env: {
        STRIPE_SECRET_KEY: hasStripe ? (secretShapeOk ? 'set (sk_*)' : `set (BAD shape: ${redactedSecret})`) : 'MISSING',
        STRIPE_PRICE_PER_SITE: hasPerSite ? (perSiteShapeOk ? 'set (price_*)' : 'set (BAD shape)') : 'MISSING',
        STRIPE_PRICE_BASE: hasBase ? (baseShapeOk ? 'set (price_*)' : 'set (BAD shape)') : 'MISSING',
      },
    };
  }

  const { data: sub, error: subErr } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status, raw')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) {
    warn('sync failed — db lookup', subErr.message);
    return { ok: false, reason: 'db_error', detail: subErr.message };
  }
  if (!sub) {
    log('sync no-op — no_subscription for owner', ownerId);
    return { ok: false, reason: 'no_subscription' };
  }

  const desired = await activeSiteCountForOwner(ownerId);

  let fullSub;
  try {
    fullSub = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  } catch (e) {
    warn('sync failed — stripe.subscriptions.retrieve', e?.message);
    return { ok: false, reason: 'stripe_retrieve_failed', detail: e?.message };
  }

  const perSiteItem = fullSub.items.data.find(
    (it) => it.price?.id === BILLING_CONFIG.perSitePriceId,
  );
  if (!perSiteItem) {
    warn('sync failed — per_site_item_missing on stripe sub', {
      subscriptionId: sub.id,
      configuredPriceId: BILLING_CONFIG.perSitePriceId,
      onStripe: fullSub.items.data.map((it) => it.price?.id),
    });
    return { ok: false, reason: 'per_site_item_missing', subscriptionId: sub.id };
  }

  if (perSiteItem.quantity === desired) {
    log('sync unchanged', { ownerId, qty: desired, subscriptionId: sub.id });
    return { ok: true, unchanged: true, quantity: desired, subscriptionId: sub.id };
  }

  try {
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: perSiteItem.id, quantity: desired }],
      proration_behavior: prorate ? 'always_invoice' : 'none',
    });
  } catch (e) {
    warn('sync failed — stripe.subscriptions.update', e?.message);
    return { ok: false, reason: 'stripe_update_failed', detail: e?.message };
  }

  // OPTIMISTIC LOCAL WRITE — the webhook will overwrite this with the
  // canonical row, but writing it inline means /api/billing/status
  // returns the correct quantity even before Stripe's webhook lands.
  try {
    await supabaseAdmin
      .from('subscriptions')
      .update({ quantity: desired, updated_at: new Date().toISOString() })
      .eq('id', sub.id);
  } catch (e) {
    warn('sync: optimistic local update failed (non-fatal)', e?.message);
  }

  log('sync applied', {
    ownerId,
    subscriptionId: sub.id,
    previous: perSiteItem.quantity,
    quantity: desired,
  });
  return { ok: true, quantity: desired, previous: perSiteItem.quantity, subscriptionId: sub.id };
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
