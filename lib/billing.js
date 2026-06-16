/**
 * lib/billing.js — v2 (per-site, no feature gating).
 *
 * Replaces the tier-based requirePlan() with a single
 * requireActiveSubscription() gate. Allowed statuses:
 *   trialing | active | past_due (while inside grace window).
 * Anything else — canceled, past_due past grace, unpaid,
 * incomplete_expired — is locked.
 *
 * Also exposes:
 *   - resolveOwnerUserId(user): walks operator/staff → owner.
 *   - getSubscriptionForUser(user): the owner's row + computed lock state.
 *   - assertNotDemo(user): write-rejection for the demo tenant.
 */
import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { corsHeaders } from '@/lib/api/cors';
import { BILLING_CONFIG } from '@/lib/stripe';

// Statuses that grant access UP TO the grace window.
const SOFT_OK = new Set(['trialing', 'active']);
const SOFT_LIMITED = new Set(['past_due', 'unpaid']);
const HARD_BLOCKED = new Set(['canceled', 'incomplete_expired', 'paused']);

async function resolveOwnerUserId(user) {
  if (!user) return null;
  if (user.role === 'owner') return user.id;
  if (user.owner_id) return user.owner_id;

  const db = supabaseAdmin || supabase;
  try {
    if (user.role === 'operator') {
      const { data: asn } = await db
        .from('operator_site_assignments')
        .select('site_id').eq('operator_user_id', user.id).limit(1).maybeSingle();
      if (!asn?.site_id) return null;
      const { data: site } = await db.from('sites')
        .select('owner_id').eq('id', asn.site_id).maybeSingle();
      return site?.owner_id || null;
    }
    if (user.role === 'staff') {
      const { data: asn } = await db
        .from('staff_site_assignments')
        .select('site_id').eq('staff_user_id', user.id).limit(1).maybeSingle();
      if (!asn?.site_id) return null;
      const { data: site } = await db.from('sites')
        .select('owner_id').eq('id', asn.site_id).maybeSingle();
      return site?.owner_id || null;
    }
  } catch (e) {
    console.warn('[billing.resolveOwnerUserId] failed:', e?.message);
  }
  return null;
}

export { resolveOwnerUserId };

/**
 * Returns { status, subscription, locked: boolean, lockReason }
 * The single source of truth for whether a tenant is usable.
 */
export async function getSubscriptionForUser(user) {
  const ownerId = await resolveOwnerUserId(user);
  if (!ownerId) return { status: null, subscription: null, locked: true, lockReason: 'no_owner' };

  const db = supabaseAdmin || supabase;
  const { data: sub } = await db
    .from('subscriptions')
    .select('id, status, quantity, trial_end, current_period_end, cancel_at_period_end, grace_ends_at')
    .eq('user_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return { status: null, subscription: null, locked: true, lockReason: 'no_subscription' };
  }

  if (SOFT_OK.has(sub.status)) {
    return { status: sub.status, subscription: sub, locked: false, lockReason: null };
  }
  if (SOFT_LIMITED.has(sub.status)) {
    const now = Date.now();
    const graceEnds = sub.grace_ends_at ? new Date(sub.grace_ends_at).getTime() : null;
    if (graceEnds && graceEnds > now) {
      return { status: sub.status, subscription: sub, locked: false, lockReason: 'grace' };
    }
    return { status: sub.status, subscription: sub, locked: true, lockReason: 'past_due_locked' };
  }
  if (HARD_BLOCKED.has(sub.status)) {
    return { status: sub.status, subscription: sub, locked: true, lockReason: 'canceled' };
  }
  // Unknown status — fail closed.
  return { status: sub.status, subscription: sub, locked: true, lockReason: 'unknown_status' };
}

/**
 * Gate: requires an active or trialing subscription (or past_due within
 * grace). Returns null when allowed, or a NextResponse 402 when blocked.
 *
 * The OWNER is gated; operator/staff users are gated by their owner's
 * subscription state too — they can't operate when the tenant is locked.
 */
export async function requireActiveSubscription(user) {
  const { status, locked, lockReason, subscription } = await getSubscriptionForUser(user);
  if (!locked) return null;
  return NextResponse.json(
    {
      error: 'Subscription required',
      code: 'subscription_locked',
      lockReason,
      status,
      hint: 'Open Billing to update payment or reactivate.',
      subscription: subscription ? { status: subscription.status, grace_ends_at: subscription.grace_ends_at } : null,
    },
    { status: 402, headers: corsHeaders }
  );
}

/**
 * Reject writes from the read-only demo tenant. Use on every POST/PUT/
 * PATCH/DELETE handler that mutates user data.
 */
export function assertNotDemo(user) {
  if (!user?.is_demo) return null;
  return NextResponse.json(
    {
      error: 'Demo mode is read-only',
      code: 'demo_readonly',
      hint: 'Sign up to create your own tenant and try real submissions.',
    },
    { status: 403, headers: corsHeaders }
  );
}

// ----- Legacy shims so old imports compile (no runtime gating now) -----
export const TIER_RANK = { starter: 1, growth: 2, enterprise: 3 };
export async function getPlanForUser(user) {
  const { status, subscription } = await getSubscriptionForUser(user);
  return { tier: status ? 'allinclusive' : null, status, subscription };
}
export async function requirePlan(user /* , minimumTier */) {
  // v2: there's only one plan. Treat 'has active sub' as sufficient.
  return requireActiveSubscription(user);
}
export { BILLING_CONFIG };
