/**
 * /api/fuel-prices/verify-schema  —  DELETED (Fix 5)
 *
 * This was an unauthenticated info-disclosure endpoint that reported which
 * fuel-pricing tables exist in the database. Removed entirely; the file is
 * kept as a stub so any stray client call gets a clean 410 Gone with no
 * payload rather than a confusing 404 from the catch-all.
 */

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function gone() {
  return NextResponse.json(
    { error: 'Endpoint removed for security' },
    { status: 410, headers: corsHeaders }
  );
}

export async function GET() { return gone(); }
export async function POST() { return gone(); }
