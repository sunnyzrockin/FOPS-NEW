/**
 * POST /api/rls-fix
 *
 * Legacy maintenance endpoint from the early-Supabase migration. Kept for
 * backward compatibility — historically this would drop and recreate the
 * recursive RLS policies on `sites`. Today we use the SECURITY DEFINER
 * helper functions in /app/lib/supabase-rls-security-definer.sql so this is
 * effectively a no-op that just acknowledges the request.
 *
 * Extracted from /app/app/api/[[...path]]/route.js (Phase 2 cleanup).
 */

import { NextResponse } from 'next/server';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST() {
  return NextResponse.json(
    {
      message: 'RLS fix applied - using application-level filtering for sites',
      success: true,
      note: 'Sites filtering is handled in application logic via SECURITY DEFINER helpers to avoid RLS recursion.',
    },
    { headers: corsHeaders }
  );
}
