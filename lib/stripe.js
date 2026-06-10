/**
 * Server-side Stripe client.
 *
 * IMPORTANT:
 *  - Never import this from a 'use client' component.
 *  - All keys come from process.env. Test-mode keys live in /app/.env;
 *    Vercel holds live-mode keys.
 *  - We pin apiVersion so behaviour stays stable across SDK bumps.
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
      appInfo: {
        name: 'fops-billing',
        version: '1.0.0',
      },
    })
  : null;

/**
 * Static plan catalogue. The Stripe Price IDs come from env vars so
 * we can rotate them without redeploying code (and so test-mode vs
 * live-mode keys/prices stay isolated).
 *
 * 2 sites for Starter aligns with the rollout plan ("2 sites to start").
 */
export const PLAN_CATALOG = [
  {
    tier: 'starter',
    name: 'Starter',
    description: 'For single operators getting started.',
    priceEnvVar: 'STRIPE_PRICE_STARTER',
    siteLimit: 2,
    monthlyPriceDisplay: '$49',
    features: [
      'Up to 2 sites',
      'Daily shift reports & banking',
      'Fuel inventory & dips',
      'Notifications & escalations',
      'Excel + PDF export',
    ],
  },
  {
    tier: 'growth',
    name: 'Growth',
    description: 'For multi-site operators scaling up.',
    priceEnvVar: 'STRIPE_PRICE_GROWTH',
    siteLimit: 10,
    monthlyPriceDisplay: '$149',
    features: [
      'Up to 10 sites',
      'Everything in Starter',
      'Analytics Explorer',
      'QLD live competitor prices',
      'Priority email support',
    ],
    highlight: true,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For networks and franchise groups.',
    priceEnvVar: 'STRIPE_PRICE_ENTERPRISE',
    siteLimit: null, // unlimited
    monthlyPriceDisplay: 'Custom',
    features: [
      'Unlimited sites',
      'Everything in Growth',
      'SLAs & onboarding support',
      'Custom integrations',
      'Dedicated account manager',
    ],
  },
];

/**
 * Look up the Stripe Price ID for a given plan tier. Returns null if the
 * tier is unknown or the env var hasn't been set yet (Sprint 1 boot path).
 */
export function priceIdForTier(tier) {
  const plan = PLAN_CATALOG.find((p) => p.tier === tier);
  if (!plan) return null;
  return process.env[plan.priceEnvVar] || null;
}

/**
 * Reverse map: given a Stripe Price ID (e.g. price_xxx), return the
 * plan tier label. Used by the webhook to label the subscription row.
 */
export function tierForPriceId(priceId) {
  if (!priceId) return null;
  for (const plan of PLAN_CATALOG) {
    if (process.env[plan.priceEnvVar] === priceId) return plan.tier;
  }
  return null;
}
