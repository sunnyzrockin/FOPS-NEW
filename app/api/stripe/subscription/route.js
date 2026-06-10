/**
 * GET /api/stripe/subscription
 *
 * Returns the authenticated owner's current subscription row (or null
 * if they haven't subscribed yet), enriched with our plan catalog
 * details.
 *
 * Used by the Billing UI to render current plan + management buttons.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';
import { PLAN_CATALOG, tierForPriceId } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;
  const owner = auth.user;

  const { data: sub, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', owner.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load subscription', detail: error.message },
      { status: 500 }
    );
  }

  // Decorate with plan details so the UI can render labels/limits
  // without re-reading the catalog separately.
  let plan = null;
  if (sub) {
    const tier = sub.plan_tier || tierForPriceId(sub.price_id);
    plan = PLAN_CATALOG.find((p) => p.tier === tier) || null;
  }

  return NextResponse.json({
    subscription: sub || null,
    plan,
    catalog: PLAN_CATALOG.map((p) => ({
      tier: p.tier,
      name: p.name,
      description: p.description,
      siteLimit: p.siteLimit,
      monthlyPriceDisplay: p.monthlyPriceDisplay,
      features: p.features,
      highlight: p.highlight || false,
      priceConfigured: !!process.env[p.priceEnvVar],
    })),
  });
}
