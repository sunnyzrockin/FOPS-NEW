import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { createClient } from '@supabase/supabase-js';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ============================================================================
// POST /api/fuel-prices/[id]/acknowledge
//
// SECURED — Bearer token REQUIRED. The acting user is taken from the JWT,
// NOT from the request body. Body fields like staffUserId/operatorUserId are
// IGNORED for security (previously this was spoofable).
//
// Branch logic, derived from JWT role:
//   • role=staff           → staff acknowledgement
//   • role=operator|owner  → operator acknowledgement
//
// Optional body: { as: 'operator' | 'staff' } can override the default for
// 'owner' callers who want to ack a site as either path. Owners default to
// operator-style ack.
// ============================================================================
export async function POST(request, { params }) {
  try {
    // 1) Auth REQUIRED
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const asOverride = body?.as; // 'operator' | 'staff' | undefined

    // 2) Decide branch from JWT role (NOT from body user IDs)
    let branch;
    if (me.role === 'staff') {
      branch = 'staff';
    } else if (me.role === 'operator') {
      branch = 'operator';
    } else if (me.role === 'owner') {
      branch = asOverride === 'staff' ? 'staff' : 'operator';
    } else {
      return NextResponse.json(
        { error: `Role '${me.role}' cannot acknowledge price changes` },
        { status: 403, headers: corsHeaders }
      );
    }

    // ----- Operator ack branch -------------------------------------------
    if (branch === 'operator') {
      const operatorUserId = me.id;

      const { data: priceChange, error: pcErr } = await supabase
        .from('fuel_price_changes')
        .select('id, site_id, status, operator_acked_at, operator_user_id')
        .eq('id', id)
        .single();
      if (pcErr || !priceChange) {
        return NextResponse.json(
          { error: 'Price change not found', id },
          { status: 404, headers: corsHeaders }
        );
      }

      // If operator (not owner), ensure they're assigned to this site
      if (me.role === 'operator') {
        const { data: assignment } = await supabase
          .from('operator_site_assignments')
          .select('site_id')
          .eq('operator_user_id', operatorUserId)
          .eq('site_id', priceChange.site_id)
          .maybeSingle();
        if (!assignment) {
          return NextResponse.json(
            { error: 'Operator is not assigned to this site' },
            { status: 403, headers: corsHeaders }
          );
        }
      }

      // Idempotent check
      if (priceChange.operator_acked_at && priceChange.operator_user_id === operatorUserId) {
        return NextResponse.json({
          success: true,
          already_acknowledged: true,
          price_change_id: id,
          operator: { id: me.id, name: me.name },
          operator_acked_at: priceChange.operator_acked_at,
          status: priceChange.status,
        }, { headers: corsHeaders });
      }

      const nowIso = new Date().toISOString();

      const { error: updErr } = await supabase
        .from('fuel_price_changes')
        .update({
          operator_acked_at: nowIso,
          operator_user_id: operatorUserId,
        })
        .eq('id', id);
      if (updErr) throw updErr;

      // Audit insert (non-fatal)
      const { data: ackRow } = await supabase
        .from('fuel_price_acknowledgements')
        .insert({
          price_change_id: id,
          operator_user_id: operatorUserId,
          role: 'operator',
          acknowledged_at: nowIso,
        })
        .select()
        .single();

      // Resolve open operator-level escalations
      try {
        await supabase
          .from('fuel_price_escalations')
          .update({ resolved_at: nowIso })
          .eq('price_change_id', id)
          .eq('escalation_type', 'operator')
          .is('resolved_at', null);
      } catch (e) {
        console.warn('Operator ack: escalation resolve failed:', e?.message);
      }

      return NextResponse.json({
        success: true,
        already_acknowledged: false,
        price_change_id: id,
        operator: { id: me.id, name: me.name },
        operator_acked_at: nowIso,
        status: priceChange.status,
        audit_row_id: ackRow?.id || null,
      }, { headers: corsHeaders });
    }

    // ----- Staff ack branch ----------------------------------------------
    const staffUserId = me.id;

    const { data: priceChange } = await supabase
      .from('fuel_price_changes')
      .select('site_id')
      .eq('id', id)
      .single();

    if (!priceChange) {
      return NextResponse.json(
        { error: 'Price change not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Staff must be assigned to the site
    if (me.role === 'staff') {
      const { data: assignment } = await supabase
        .from('staff_site_assignments')
        .select('*')
        .eq('staff_user_id', staffUserId)
        .eq('site_id', priceChange.site_id)
        .single();

      if (!assignment) {
        return NextResponse.json(
          { error: 'Staff not assigned to this site' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // Idempotent: if already acknowledged, return existing
    const { data: existing } = await supabase
      .from('fuel_price_acknowledgements')
      .select('*')
      .eq('price_change_id', id)
      .eq('staff_user_id', staffUserId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Already acknowledged',
        acknowledgement: existing,
      }, { headers: corsHeaders });
    }

    // Create acknowledgement
    const { data: acknowledgement, error: insertError } = await supabase
      .from('fuel_price_acknowledgements')
      .insert({
        price_change_id: id,
        staff_user_id: staffUserId,
        role: 'staff',
      })
      .select(`*, staff:users!staff_user_id(id, name, email)`)
      .single();

    if (insertError) throw insertError;

    // If all assigned staff have acknowledged → mark status acknowledged + resolve escalations
    const { data: allStaff } = await supabase
      .from('staff_site_assignments')
      .select('staff_user_id')
      .eq('site_id', priceChange.site_id);

    const { data: allAcknowledgements } = await supabase
      .from('fuel_price_acknowledgements')
      .select('staff_user_id')
      .eq('price_change_id', id)
      .not('staff_user_id', 'is', null);

    const staffIds = allStaff?.map((s) => s.staff_user_id) || [];
    const acknowledgedIds = allAcknowledgements?.map((a) => a.staff_user_id) || [];

    if (staffIds.length > 0 && staffIds.every((sid) => acknowledgedIds.includes(sid))) {
      await supabase
        .from('fuel_price_changes')
        .update({ status: 'acknowledged' })
        .eq('id', id);

      await supabase
        .from('fuel_price_escalations')
        .update({ resolved_at: new Date().toISOString() })
        .eq('price_change_id', id)
        .is('resolved_at', null);
    }

    return NextResponse.json({
      success: true,
      message: 'Price change acknowledged',
      acknowledgement,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error acknowledging price change:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
