/**
 * POST /api/billing/portal
 *
 * Returns a Stripe Billing Portal URL for the authenticated owner. The
 * portal is where they update card, cancel, reactivate, view invoices,
 * etc. Used by the lock screen and the regular Billing tab.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;

  const { data: cust } = await supabaseAdmin
    .from('stripe_customers').select('stripe_customer_id').eq('user_id', auth.user.id).maybeSingle();
  if (!cust?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing customer on file' }, { status: 404 });
  }

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: cust.stripe_customer_id,
    return_url: `${origin}/app?tab=billing`,
  });
  return NextResponse.json({ url: session.url });
}

export const OPTIONS = optionsHandler;
