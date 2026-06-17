import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/fuel-prices — Bearer-required, role-scoped list of fuel price changes
export async function GET(request) {
  try {
    // 1) Auth REQUIRED — Bearer token
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;

    const { searchParams } = new URL(request.url);
    const reqSiteId = searchParams.get('siteId');
    const status = searchParams.get('status');

    // 2) Resolve which sites this caller can see from their JWT role
    let scopedSiteIds = [];
    if (me.role === 'owner') {
      const { data, error } = await supabase
        .from('sites')
        .select('id')
        .eq('owner_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((s) => s.id);
    } else if (me.role === 'operator') {
      const { data, error } = await supabase
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else if (me.role === 'staff') {
      const { data, error } = await supabase
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else {
      return NextResponse.json(
        { error: `Unknown role: ${me.role}` },
        { status: 403, headers: corsHeaders }
      );
    }

    // 3) Optional siteId filter (must be in scope)
    if (reqSiteId) {
      if (!scopedSiteIds.includes(reqSiteId)) {
        return NextResponse.json([], { headers: corsHeaders });
      }
      scopedSiteIds = [reqSiteId];
    }
    if (!scopedSiteIds.length) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    let query = supabase
      .from('fuel_price_changes')
      .select(`
        *,
        site:sites(id, name, code),
        created_by:users!created_by_user_id(id, name, email, role),
        operator_acked_by:users!operator_user_id(id, name, email),
        notifications:fuel_price_notifications(
          id,
          operator:users!operator_user_id(id, name, email),
          notified_at,
          staff_notified_at
        ),
        acknowledgements:fuel_price_acknowledgements(
          id,
          staff:users!staff_user_id(id, name, email),
          acknowledged_at
        ),
        latest_escalation:fuel_price_escalations(
          id,
          escalation_level,
          escalation_type,
          escalated_at,
          resolved_at
        )
      `)
      .in('site_id', scopedSiteIds)
      .order('created_at', { ascending: false })
      .limit(50)
      // Trim escalations to the most recent 5 only; some rows have 180+
      // escalation history records that bloat the payload to MBs and
      // freeze the UI for several seconds while React parses them.
      .order('escalated_at', { foreignTable: 'latest_escalation', ascending: false })
      .limit(5, { foreignTable: 'latest_escalation' });

    if (status) query = query.eq('status', status);

    const { data: priceChanges, error } = await query;
    if (error) throw error;

    return NextResponse.json(priceChanges || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching fuel prices:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/fuel-prices — Bearer-required, owner role only
export async function POST(request) {
  try {
    // 1) Auth REQUIRED
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;
    if (me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can create fuel price changes', role: me.role },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { siteId, fuelType, oldPrice, newPrice, effectiveDatetime, notes } = body;
    // createdByUserId is taken from JWT, NOT from body (security)
    const createdByUserId = me.id;

    // Validation
    if (!siteId || !fuelType || !newPrice || !effectiveDatetime) {
      return NextResponse.json(
        { error: 'Missing required fields: siteId, fuelType, newPrice, effectiveDatetime' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['ULP', 'PULP', 'Diesel'].includes(fuelType)) {
      return NextResponse.json(
        { error: 'Invalid fuel type. Must be ULP, PULP, or Diesel' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Bug #11: range-check the price. The system accepts price in EITHER
    // dollars/L (e.g. 1.85) OR cents/L (e.g. 185), normalised on read via
    // the lib/financials.js <10 → ×100 heuristic. Plausible bands:
    //   dollars: 0.50 ≤ x ≤ 5.00
    //   cents  : 50   ≤ x ≤ 500
    // Anything else (the implausible middle zone 5–50, near-zero, or
    // huge numbers) is almost certainly a units mix-up — reject it
    // explicitly so we never store nonsense like 1.85¢/L.
    const inPlausibleBand = (n) =>
      Number.isFinite(n) && ((n >= 0.5 && n <= 5) || (n >= 50 && n <= 500));
    const newPriceNum = Number(newPrice);
    const oldPriceNum = oldPrice == null || oldPrice === '' ? null : Number(oldPrice);
    if (!inPlausibleBand(newPriceNum)) {
      return NextResponse.json(
        {
          error: 'newPrice out of range',
          detail: `Expected price either as dollars/L (0.50–5.00) or cents/L (50–500); got ${newPrice}.`,
          hint: 'Enter the dollar value (e.g. 1.85 for $1.85/L) or the cents value (e.g. 185 for 185¢/L).',
        },
        { status: 400, headers: corsHeaders }
      );
    }
    if (oldPriceNum != null && !inPlausibleBand(oldPriceNum)) {
      return NextResponse.json(
        {
          error: 'oldPrice out of range',
          detail: `Expected price either as dollars/L (0.50–5.00) or cents/L (50–500); got ${oldPrice}.`,
          hint: 'Enter the dollar value (e.g. 1.85 for $1.85/L) or the cents value (e.g. 185 for 185¢/L).',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify user is owner
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', createdByUserId)
      .single();

    if (!user || user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can create price changes' },
        { status: 403 }
      );
    }

    // Create price change
    const { data: priceChange, error: insertError } = await supabase
      .from('fuel_price_changes')
      .insert({
        site_id: siteId,
        fuel_type: fuelType,
        old_price: oldPrice,
        new_price: newPrice,
        effective_datetime: effectiveDatetime,
        created_by_user_id: createdByUserId,
        status: 'pending',
        notes
      })
      .select(`
        *,
        site:sites(id, name, code),
        created_by:users!created_by_user_id(id, name, email)
      `)
      .single();

    if (insertError) throw insertError;

    // Get operators for this site and create notifications
    const { data: operators } = await supabase
      .from('operator_site_assignments')
      .select('operator_user_id')
      .eq('site_id', siteId);

    if (operators && operators.length > 0) {
      const notifications = operators.map(op => ({
        price_change_id: priceChange.id,
        operator_user_id: op.operator_user_id
      }));

      await supabase
        .from('fuel_price_notifications')
        .insert(notifications);

      // Update status to notified
      await supabase
        .from('fuel_price_changes')
        .update({ status: 'notified' })
        .eq('id', priceChange.id);
    }

    return NextResponse.json(priceChange, { status: 201 });
  } catch (error) {
    console.error('Error creating fuel price change:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
