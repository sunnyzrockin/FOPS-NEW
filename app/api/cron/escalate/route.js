import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { runEscalationSweep } from '@/lib/api/handlers/escalations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * /api/cron/escalate  —  CRON_SECRET-gated escalation sweep.
 *
 * This is the SOLE path that runs the fuel-price escalation algorithm in
 * production. Vercel Cron is configured (in vercel.json) to GET this
 * route every 15 minutes; Vercel-Cron invocations automatically include
 * `Authorization: Bearer ${CRON_SECRET}` on the Pro plan and a
 * `x-vercel-cron` header on every plan.
 *
 * Security:
 *   - Gated ONLY by CRON_SECRET — there is no user-auth fallback. There
 *     is no second escalate path; the old POST /api/fuel-prices/escalate
 *     was deleted in the scaling sprint.
 *   - If CRON_SECRET is not set, the endpoint is hard-locked (returns
 *     503) so we never expose an open back door on misconfigured envs.
 *
 * Returns the same shape as the old endpoint for easy log inspection:
 *   { success, sweptAt, candidates, escalationsCreated, escalations }
 */

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // hard-lock when not configured

  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>` on Pro plans.
  const auth = request.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;

  // Fallback: same secret can be sent as ?secret= for manual / external
  // schedulers. Header is preferred and used by Vercel Cron itself.
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('secret') === secret) return true;
  } catch (_) { /* malformed url — fall through to 401 */ }

  return false;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

async function handle(request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on this deployment' },
      { status: 503, headers: corsHeaders }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: corsHeaders }
    );
  }
  try {
    const result = await runEscalationSweep();
    return NextResponse.json(result, { headers: corsHeaders });
  } catch (err) {
    console.error('[cron/escalate] sweep failed:', err);
    return NextResponse.json(
      { error: 'escalation sweep failed', message: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export const GET = handle;   // Vercel Cron uses GET
export const POST = handle;  // Manual triggers can use POST
