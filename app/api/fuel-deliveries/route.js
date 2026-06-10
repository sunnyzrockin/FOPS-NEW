/**
 * GET / POST  /api/fuel-deliveries
 *
 * Source of truth for fuel bought IN, WITH COST. Operators and owners can
 * record deliveries; the margin engine consumes these as the cost basis.
 *
 * The form accepts EITHER total_cost_dollars OR unit_cost_cpl (or both —
 * cpl wins). All amounts are EX-GST (per owner sign-off).
 *
 * Gated to Growth+ / Enterprise via lib/billing.js requirePlan('growth').
 */
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { corsHeaders } from '@/lib/api/cors';
import { deriveDeliveryCost } from '@/lib/margin';
import { requirePlan } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    if (!['owner', 'operator'].includes(auth.user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: corsHeaders }
      );
    }
    const gate = await requirePlan(auth.user, 'growth');
    if (gate) return gate;

    const url = new URL(request.url);
    const siteIdsRaw = url.searchParams.get('siteIds') || '';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const grade = url.searchParams.get('grade');
    const limitRaw = parseInt(url.searchParams.get('limit') || '500', 10);
    const limit = Math.min(Math.max(limitRaw, 1), 2000);

    const requested = siteIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = await getAllowedSiteIds(auth.user);
    const siteIds = requested.length
      ? requested.filter((id) => allowed.includes(id))
      : allowed;
    if (!siteIds.length) {
      return NextResponse.json({ deliveries: [] }, { headers: corsHeaders });
    }

    const db = supabaseAdmin || supabase;
    let q = db
      .from('fuel_deliveries')
      .select('*')
      .in('site_id', siteIds)
      .order('delivered_at', { ascending: false })
      .limit(limit);
    if (startDate) q = q.gte('delivered_at', startDate);
    if (endDate) q = q.lte('delivered_at', endDate);
    if (grade) q = q.eq('grade', grade);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ deliveries: data || [] }, { headers: corsHeaders });
  } catch (err) {
    console.error('[fuel-deliveries.GET] failed:', err);
    return NextResponse.json(
      { error: 'Failed to load deliveries', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await requireRole(request, ['owner', 'operator']);
    if (!auth.ok) return auth.response;
    const gate = await requirePlan(auth.user, 'growth');
    if (gate) return gate;

    let body;
    try { body = await request.json(); } catch (_) { body = {}; }

    const site_id = (body.site_id || '').toString().trim();
    const grade = (body.grade || '').toString().trim();
    const delivered_at = (body.delivered_at || '').toString().trim(); // YYYY-MM-DD
    const litres = Number(body.litres);
    const supplier = body.supplier ? String(body.supplier).slice(0, 200) : null;
    const invoice_ref = body.invoice_ref ? String(body.invoice_ref).slice(0, 200) : null;
    const notes = body.notes ? String(body.notes).slice(0, 1000) : null;

    if (!site_id) return badReq('site_id is required');
    if (!grade) return badReq('grade is required');
    if (!delivered_at) return badReq('delivered_at is required (YYYY-MM-DD)');
    if (!Number.isFinite(litres) || litres <= 0) return badReq('litres must be a positive number');

    // Tenant check — site must be in the user's allowed set
    const allowed = await getAllowedSiteIds(auth.user);
    if (!allowed.includes(site_id)) {
      return NextResponse.json(
        { error: 'Forbidden: site not in your allowed set' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Grade must exist in the fuel_grades lookup
    const db = supabaseAdmin || supabase;
    const { data: gradeRow } = await db
      .from('fuel_grades')
      .select('code, active')
      .eq('code', grade)
      .maybeSingle();
    if (!gradeRow) return badReq(`grade "${grade}" is not registered. Add it via /api/fuel-grades or use one of the seeded codes (ULP, Diesel, Premium, E10, LPG).`);
    if (gradeRow.active === false) return badReq(`grade "${grade}" is inactive.`);

    const { unit_cost_cpl, total_cost_dollars } = deriveDeliveryCost({
      total_cost_dollars: Number(body.total_cost_dollars),
      unit_cost_cpl: Number(body.unit_cost_cpl),
      litres,
    });
    if (!Number.isFinite(unit_cost_cpl) || unit_cost_cpl <= 0) {
      return badReq('Provide either total_cost_dollars or unit_cost_cpl (ex-GST).');
    }

    const row = {
      id: uuidv4(),
      site_id,
      grade,
      delivered_at,
      litres,
      total_cost_dollars,
      unit_cost_cpl,
      supplier,
      invoice_ref,
      notes,
      created_by_user_id: auth.user.id,
    };

    const { data, error } = await db.from('fuel_deliveries').insert([row]).select().single();
    if (error) throw error;

    return NextResponse.json({ delivery: data }, { status: 201, headers: corsHeaders });
  } catch (err) {
    console.error('[fuel-deliveries.POST] failed:', err);
    return NextResponse.json(
      { error: 'Failed to record delivery', detail: err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

function badReq(msg) {
  return NextResponse.json({ error: msg }, { status: 400, headers: corsHeaders });
}
