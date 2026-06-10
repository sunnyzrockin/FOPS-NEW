/**
 * GET /api/fuel-grades  — list of grade codes (used by Record Delivery form)
 * POST /api/fuel-grades — owner only; add a new grade.
 */
import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { corsHeaders } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const db = supabaseAdmin || supabase;
    const { data, error } = await db
      .from('fuel_grades')
      .select('code, label, active, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ grades: data || [] }, { headers: corsHeaders });
  } catch (err) {
    console.error('[fuel-grades.GET] failed:', err);
    return NextResponse.json(
      { error: 'Failed to load fuel grades', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return auth.response;

    let body;
    try { body = await request.json(); } catch (_) { body = {}; }

    const code = (body.code || '').toString().trim();
    const label = (body.label || '').toString().trim();
    if (!code) return bad('code is required (e.g. "AdBlue")');
    if (!label) return bad('label is required (e.g. "AdBlue 32.5%")');
    if (code.length > 30) return bad('code too long (max 30 chars)');

    const db = supabaseAdmin || supabase;
    const { data, error } = await db
      .from('fuel_grades')
      .upsert(
        { code, label, active: body.active !== false, sort_order: Number(body.sort_order) || 100 },
        { onConflict: 'code' }
      )
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ grade: data }, { status: 201, headers: corsHeaders });
  } catch (err) {
    console.error('[fuel-grades.POST] failed:', err);
    return NextResponse.json(
      { error: 'Failed to add fuel grade', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

function bad(msg) {
  return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders });
}
