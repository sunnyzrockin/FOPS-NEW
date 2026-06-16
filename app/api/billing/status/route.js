/**
 * GET /api/billing/status
 *
 * Returns the caller's effective subscription state. The BillingGate
 * component polls this on /app load to decide between:
 *   - normal app
 *   - trial banner (with days_remaining)
 *   - grace banner (past_due, days until lock)
 *   - lock screen (canceled or past_due_locked)
 *
 * Operators / staff inherit their owner's state.
 */
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helpers';
import { getSubscriptionForUser, BILLING_CONFIG } from '@/lib/billing';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;
  const result = await getSubscriptionForUser(user);
  const sub = result.subscription;

  let daysRemaining = null;
  let phase = 'unknown';
  if (sub?.status === 'trialing' && sub.trial_end) {
    daysRemaining = Math.max(0, Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / 86_400_000));
    phase = 'trial';
  } else if (sub?.status === 'active') {
    phase = 'active';
  } else if ((sub?.status === 'past_due' || sub?.status === 'unpaid') && sub.grace_ends_at) {
    daysRemaining = Math.max(0, Math.ceil((new Date(sub.grace_ends_at).getTime() - Date.now()) / 86_400_000));
    phase = result.locked ? 'past_due_locked' : 'past_due_grace';
  } else if (sub?.status === 'canceled') {
    phase = 'canceled';
  } else if (!sub) {
    phase = user.role === 'owner' ? 'no_subscription' : 'owner_no_subscription';
  }

  return NextResponse.json({
    role: user.role,
    is_demo: !!user.is_demo,
    status: result.status,
    locked: result.locked,
    lockReason: result.lockReason,
    phase,
    daysRemaining,
    quantity: sub?.quantity || null,
    trial_end: sub?.trial_end || null,
    grace_ends_at: sub?.grace_ends_at || null,
    config: {
      base_amount_cents: BILLING_CONFIG.baseAmountCents,
      per_site_amount_cents: BILLING_CONFIG.perSiteAmountCents,
      currency: BILLING_CONFIG.currency,
      trial_days: BILLING_CONFIG.trialDays,
      grace_days: BILLING_CONFIG.graceDays,
    },
  });
}

export const OPTIONS = optionsHandler;
