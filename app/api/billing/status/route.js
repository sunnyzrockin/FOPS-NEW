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
 *
 * Bug #1 prod-defence: when this endpoint detects quantity drift
 * (Stripe-billed quantity != live active site count) for a real owner,
 * it AUTO-RECONCILES by firing the same syncQuantityForOwner call that
 * the create/delete paths fire. This is intentionally redundant — if
 * the create/delete sync path fails for any reason on serverless
 * (cold-start race, dynamic-import resolution, tree-shaking, env-var
 * mismatch), the very next BillingGate poll heals the drift. Cheap:
 * runs at most one Stripe API call per poll, and only when there IS
 * drift.
 *
 * Minor finding fix: staff/operators no longer see the cents-amount
 * config block — only the owner gets pricing detail. They still get
 * phase/lock/days-remaining so the BillingGate continues to work.
 */
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helpers';
import { getSubscriptionForUser, resolveOwnerUserId, BILLING_CONFIG } from '@/lib/billing';
import { activeSiteCountForOwner, syncQuantityForOwner } from '@/lib/billing-sync';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAuth(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;
  let result = await getSubscriptionForUser(user);
  let sub = result.subscription;

  // Compute the live owner site_count, detect drift, and AUTO-RECONCILE
  // when drift is real. Demo users skip this entirely.
  let siteCount = null;
  let quantityDrift = false;
  let autoReconciled = null; // diagnostic so we can confirm in prod logs
  if (!user.is_demo) {
    try {
      const ownerId = await resolveOwnerUserId(user);
      if (ownerId) {
        siteCount = await activeSiteCountForOwner(ownerId);
        if (sub?.quantity != null && siteCount != null) {
          quantityDrift = Number(sub.quantity) !== Number(siteCount);
        }
        if (quantityDrift) {
          // Self-healing reconcile. Idempotent (the sync helper short-
          // circuits when already in sync), proration_behavior in the
          // helper is 'always_invoice' which matches the create/delete
          // semantics. Only attempt if we have a real subscription —
          // skip during trial-with-no-card states.
          try {
            const syncResult = await syncQuantityForOwner(ownerId);
            autoReconciled = syncResult;
            console.log(
              '[billing/status] auto-reconcile fired',
              JSON.stringify({ ownerId, before: sub?.quantity, after: syncResult?.quantity, reason: syncResult?.reason })
            );
            // Re-read the subscription so the response reflects post-
            // reconcile state. Avoids a follow-up poll cycle.
            if (syncResult?.ok && syncResult.quantity != null) {
              result = await getSubscriptionForUser(user);
              sub = result.subscription;
              if (sub?.quantity != null && siteCount != null) {
                quantityDrift = Number(sub.quantity) !== Number(siteCount);
              }
            }
          } catch (e) {
            console.warn('[billing/status] auto-reconcile threw:', e?.message);
            autoReconciled = { ok: false, reason: 'exception', detail: e?.message };
          }
        }
      }
    } catch (e) {
      console.warn('[billing/status] site count probe failed:', e?.message);
    }
  }

  let daysRemaining = null;
  let phase = 'unknown';
  if (result.demo === true || user?.is_demo) {
    phase = 'demo';
  } else if (sub?.status === 'trialing' && sub.trial_end) {
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

  // Minor finding: staff/operators must NOT see cents-amount pricing.
  // They still need phase/days/lock info for the BillingGate to render
  // the trial / grace / locked banner correctly, but they should not
  // see the per-site dollar value or the billed quantity.
  const isOwner = user.role === 'owner';
  const payload = {
    role: user.role,
    is_demo: !!user.is_demo,
    status: result.status,
    locked: result.locked,
    lockReason: result.lockReason,
    phase,
    daysRemaining,
    trial_end: sub?.trial_end || null,
    grace_ends_at: sub?.grace_ends_at || null,
  };
  if (isOwner) {
    payload.quantity = sub?.quantity || null;
    payload.site_count = siteCount;
    payload.quantity_drift = quantityDrift;
    payload.auto_reconciled = autoReconciled;
    // When auto-reconcile fails because Stripe env vars are missing in
    // the deployed runtime, surface that diagnostic so prod verification
    // doesn't need to grep server logs.
    if (autoReconciled && autoReconciled.ok === false && autoReconciled.env) {
      payload.billing_env = autoReconciled.env;
    }
    payload.config = {
      base_amount_cents: BILLING_CONFIG.baseAmountCents,
      per_site_amount_cents: BILLING_CONFIG.perSiteAmountCents,
      currency: BILLING_CONFIG.currency,
      trial_days: BILLING_CONFIG.trialDays,
      grace_days: BILLING_CONFIG.graceDays,
    };
  }
  return NextResponse.json(payload);
}

export const OPTIONS = optionsHandler;
