/**
 * POST /api/seed-supabase
 *
 * One-shot maintenance endpoint. Seeds the Supabase database with demo data
 * (sites, users, sample reports).
 *
 * SECURITY: Triple-gated.
 *   (1) process.env.SEED_ENABLED must equal the literal string 'true'.
 *       This is the master kill-switch. If unset (default) → 403.
 *   (2) Caller must present a valid Bearer JWT (verifyAuth).
 *   (3) Caller's role must be 'owner' (requireRole). Operators / staff /
 *       founders cannot run the seeder.
 *
 * Lazy-imports the heavy seed module so the default bundle stays small.
 */

import { NextResponse } from 'next/server';
import { optionsHandler, corsHeaders } from '@/lib/api/cors';
import { requireRole } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const OPTIONS = optionsHandler;

export async function POST(request) {
  // ---- Gate 1: master kill-switch ---------------------------------------
  if (process.env.SEED_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error: 'Seeding is disabled in this environment',
        hint: 'Set SEED_ENABLED=true in the environment to enable.',
      },
      { status: 403, headers: corsHeaders }
    );
  }

  // ---- Gate 2 & 3: authenticated + owner-only ---------------------------
  const auth = await requireRole(request, ['owner']);
  if (!auth.ok) {
    const r = auth.response;
    for (const [k, v] of Object.entries(corsHeaders)) r.headers.set(k, v);
    return r;
  }

  // ---- Run the seeder ---------------------------------------------------
  try {
    const { seedDatabase } = await import('@/lib/supabase-seed');
    const result = await seedDatabase();

    if (result.success) {
      return NextResponse.json(
        { message: 'Supabase database seeded successfully!', success: true },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Seeding failed', details: result.error },
      { status: 500, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Seeding failed', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
