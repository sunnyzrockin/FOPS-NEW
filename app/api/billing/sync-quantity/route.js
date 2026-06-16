/**
 * GET  /api/billing/quantity-preview?quantity=N
 *   → returns a proration preview if the owner changed their site count to N.
 *
 * POST /api/billing/sync-quantity
 *   → idempotently updates the Stripe subscription quantity to match the
 *     OWNER's current active site count. Called internally by site
 *     create/delete handlers; also exposed for the UI to force a resync.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { syncQuantityForOwner, previewQuantityChange } from '@/lib/billing-sync';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const q = Number(searchParams.get('quantity') || 0);
  if (!Number.isInteger(q) || q < 1) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }
  const preview = await previewQuantityChange(auth.user.id, q);
  return NextResponse.json(preview);
}

export async function POST(request) {
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) return auth.response;
  const result = await syncQuantityForOwner(auth.user.id);
  return NextResponse.json(result);
}

export const OPTIONS = optionsHandler;
