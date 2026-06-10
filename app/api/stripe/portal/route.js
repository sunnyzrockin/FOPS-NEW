/**
 * POST /api/stripe/portal
 *
 * Returns: { url: <stripe customer-portal url> }
 *
 * Allows an owner with an existing Stripe Customer to manage their
 * subscription (upgrade / downgrade / cancel / update card). The portal
 * UI is hosted by Stripe — we just mint a one-time login link.
 */
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this server' },
      { status: 503 }
    );
  }

  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;
  const owner = auth.user;

  const { data: customerRow } = await supabaseAdmin
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', owner.id)
    .maybeSingle();

  if (!customerRow?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer on file. Please start a checkout first.' },
      { status: 404 }
    );
  }

  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000';

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: `${origin}/app?tab=billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    
    console.error('[stripe/portal] create session failed:', err);
    return NextResponse.json(
      { error: 'Failed to create portal session', detail: err.message },
      { status: 500 }
    );
  }
}
