/**
 * Server-side Stripe client + billing config.
 *
 * BILLING MODEL v2 (per-site, single plan)
 * ----------------------------------------
 * Every subscription is: ONE base price (flat) + ONE per-site price
 * whose quantity tracks the owner's active site count. We do NOT gate
 * features by tier — everything is included on every site (Tier 1
 * wet-stock, Analytics, competitor prices, etc.). The only billing
 * questions are: do they have an active subscription, and how many
 * sites is that subscription paying for.
 *
 * Old tier-based exports (PLAN_CATALOG, priceIdForTier, tierForPriceId)
 * are kept as thin shims so legacy imports don't break compile, but the
 * runtime no longer reads them.
 */
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('[lib/stripe] STRIPE_SECRET_KEY is not set — Stripe routes will 503.');
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: false,
      appInfo: { name: 'fops-billing', version: '2.0.0' },
    })
  : null;

export const BILLING_CONFIG = {
  basePriceId:        process.env.STRIPE_PRICE_BASE       || null,
  perSitePriceId:     process.env.STRIPE_PRICE_PER_SITE   || null,
  currency:          (process.env.BILLING_CURRENCY || 'aud').toLowerCase(),
  baseAmountCents:    Number(process.env.BILLING_BASE_AMOUNT_CENTS    || 2900),
  perSiteAmountCents: Number(process.env.BILLING_PER_SITE_AMOUNT_CENTS || 2900),
  trialDays:          Number(process.env.BILLING_TRIAL_DAYS  || 14),
  graceDays:          Number(process.env.BILLING_GRACE_DAYS || 7),
  introDiscountCoupon: process.env.BILLING_INTRO_DISCOUNT_COUPON || null,
};

export function billingConfigured() {
  return !!(stripe && BILLING_CONFIG.basePriceId && BILLING_CONFIG.perSitePriceId);
}

/**
 * Build the Checkout Session line_items for the v2 model:
 *   - base price, quantity 1
 *   - per-site price, quantity = current active site count (default 1)
 */
export function buildLineItems({ siteQuantity = 1 } = {}) {
  return [
    { price: BILLING_CONFIG.basePriceId,    quantity: 1 },
    { price: BILLING_CONFIG.perSitePriceId, quantity: Math.max(1, siteQuantity) },
  ];
}

// ---- LEGACY SHIMS — kept so old imports don't break. Do not extend. ----
export const PLAN_CATALOG = [];
export function priceIdForTier() { return null; }
export function tierForPriceId() { return null; }
