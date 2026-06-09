import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/fuel-prices/escalate  —  RETIRED.
 *
 * The fuel-price escalation sweep used to be triggered by client-side
 * polling against this endpoint. In the June-2026 scaling sprint that
 * pattern was replaced by a Vercel Cron at /api/cron/escalate gated by
 * CRON_SECRET. This route now returns 410 Gone so external test
 * harnesses (and any orphaned clients still polling) get an
 * unambiguous "this is gone, use the cron job" signal — and so we are
 * NOT leaving a second unauthenticated escalate path on the surface.
 */
function rejectAnon(request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }
  return null;
}

function gone(request) {
  // Anon callers get the standard 401 — same as every other authenticated
  // endpoint — so an outside observer can't tell this endpoint has been
  // retired (no information disclosure) and external security scanners
  // see the expected gate. Authenticated callers get a clear 410 with
  // migration guidance.
  const anonResponse = rejectAnon(request);
  if (anonResponse) return anonResponse;

  return NextResponse.json(
    {
      error: 'endpoint removed',
      reason: 'Escalations are now run by Vercel Cron at /api/cron/escalate every 15 minutes. The cron endpoint is gated by CRON_SECRET only — no user-auth fallback exists.',
    },
    { status: 410, headers: corsHeaders }
  );
}

export const GET = gone;
export const POST = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
// OPTIONS must remain unrestricted for CORS preflight.
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}
