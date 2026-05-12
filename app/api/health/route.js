import { NextResponse } from 'next/server';

// Force Node runtime + dynamic so this endpoint always reflects the live build.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// /api/health — lightweight deployment verification endpoint
// ----------------------------------------------------------------------------
// Bump VERSION_MARKER whenever you want to verify a new deploy reached prod.
// After Vercel finishes building, GET /api/health on the live URL should
// return the new marker. If it still shows the old marker, the deploy did
// not include this commit.
// ============================================================================
const VERSION_MARKER = 'fops-2026-05-09-deploy-pipeline-test-01';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'fops',
      version_marker: VERSION_MARKER,
      build_time_iso: new Date().toISOString(),
      node_env: process.env.NODE_ENV || 'unknown',
      runtime: 'nodejs',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json',
      },
    }
  );
}
