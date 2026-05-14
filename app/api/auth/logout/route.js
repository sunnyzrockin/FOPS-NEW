import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// POST /api/auth/logout
// Server-side acknowledgement endpoint. The Supabase session lives in the
// browser, so actual signOut() happens client-side in handleLogout. This
// endpoint exists so the client can fire-and-forget and audit if needed.
export async function POST() {
  return NextResponse.json({ status: 'ok' }, { status: 200, headers: corsHeaders });
}
