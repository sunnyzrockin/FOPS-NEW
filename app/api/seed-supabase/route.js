/**
 * POST /api/seed-supabase
 *
 * One-shot maintenance endpoint. Seeds the Supabase database with demo data
 * (sites, users, sample reports). Lazy-imports the heavy seed module so the
 * default bundle stays small.
 *
 * Extracted from /app/app/api/[[...path]]/route.js (Phase 2 cleanup).
 */

import { NextResponse } from 'next/server';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const OPTIONS = optionsHandler;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST() {
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
