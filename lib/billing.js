/**
 * lib/billing.js — server-side subscription tier helpers.
 *
 * Reads the authenticated user's current subscription tier from the
 * subscriptions table (populated by /api/stripe/webhook) and provides
 * gates for premium features.
 *
 * Plan tiers (lib/stripe.js PLAN_CATALOG):
 *   starter    — 2 sites,  basic features only
 *   growth     — 10 sites, premium features (margin, wetstock, integrations)
 *   enterprise — unlimited
 */
import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { corsHeaders } from '@/lib/api/cors';

// Tier ordering: higher = more powerful. Use for >= comparisons.
export const TIER_RANK = { starter: 1, growth: 2, enterprise: 3 };
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/**
 * Resolve the OWNER user for a given user (operator/staff users inherit their
 * owner's subscription). For an owner, this returns the owner themselves.
 *
 * Operators / staff don't have a direct owner_id column on users, so we
 * resolve via the sites they're assigned to → sites.owner_id.
 */
async function resolveOwnerUserId(user) {
  if (!user) return null;
  if (user.role === 'owner') return user.id;
  // Explicit owner_id on the user row wins if present
  if (user.owner_id) return user.owner_id;

  const db = supabaseAdmin || supabase;
  try {
    if (user.role === 'operator') {
      const { data: asn } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!asn?.site_id) return null;
      const { data: site } = await db
        .from('sites')
        .select('owner_id')
        .eq('id', asn.site_id)
        .maybeSingle();
      return site?.owner_id || null;
    }
    if (user.role === 'staff') {
      const { data: asn } = await db
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!asn?.site_id) return null;
      const { data: site } = await db
        .from('sites')
        .select('owner_id')
        .eq('id', asn.site_id)
        .maybeSingle();
      return site?.owner_id || null;
    }
  } catch (e) {
    console.warn('[billing.resolveOwnerUserId] failed:', e?.message);
  }
  return null;
}

/**
 * Returns { tier: 'starter'|'growth'|'enterprise'|null, status, subscription }
 * for the user (resolving via their owner). Returns tier=null if no
 * active subscription exists.
 */
export async function getPlanForUser(user) {
  const ownerId = await resolveOwnerUserId(user);
  if (!ownerId) return { tier: null, status: null, subscription: null };

  const db = supabaseAdmin || supabase;
  const { data, error } = await db
    .from('subscriptions')
    .select('id, plan_tier, status, current_period_end, cancel_at_period_end')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { tier: null, status: null, subscription: null };
  if (!ACTIVE_STATUSES.has(data.status)) {
    return { tier: null, status: data.status, subscription: data };
  }
  return { tier: data.plan_tier, status: data.status, subscription: data };
}

/**
 * Gate a request behind a minimum plan tier. Returns null when allowed,
 * or a NextResponse 403 when denied.
 *
 * Usage:
 *   const gate = await requirePlan(auth.user, 'growth');
 *   if (gate) return gate;
 */
export async function requirePlan(user, minimumTier) {
  const required = TIER_RANK[minimumTier];
  if (!required) throw new Error(`Unknown tier: ${minimumTier}`);

  const { tier, status, subscription } = await getPlanForUser(user);
  const currentRank = tier ? TIER_RANK[tier] || 0 : 0;
  if (currentRank >= required) return null; // allowed

  return NextResponse.json(
    {
      error: 'Subscription required',
      code: 'subscription_required',
      currentTier: tier,
      currentStatus: status,
      minimumTier,
      upgradeUrl: '/app?tab=billing',
      detail: tier
        ? `Your current plan (${tier}) does not include this feature. Upgrade to ${minimumTier} or higher.`
        : 'This feature requires an active subscription. Open Billing to choose a plan.',
    },
    { status: 403, headers: corsHeaders }
  );
}
