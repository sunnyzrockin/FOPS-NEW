import { NextResponse } from 'next/server';

// Force Node runtime + dynamic so this endpoint always reflects the live build.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// /api/health — lightweight liveness + deploy verification endpoint
// ----------------------------------------------------------------------------
// Returns basic build info, useful for confirming which commit is live in
// production and for uptime probes. No auth required.
// ============================================================================
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'fops',
      // Vercel injects this automatically on deployed builds; locally it's
      // undefined which is fine.
      commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      git_branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      vercel_env: process.env.VERCEL_ENV || null,
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
