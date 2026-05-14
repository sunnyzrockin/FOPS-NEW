import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ============================================================================
// POST /api/fuel-prices/[id]/acknowledge
//
// Unified endpoint — handles BOTH staff and operator acknowledgments.
//
// Body (one of):
//   { staffUserId: "<uuid>" }     → staff ack (legacy flow)
//   { operatorUserId: "<uuid>" }  → operator ack (new flow)
//
// Staff ack flow (unchanged):
//   - Verifies staff is assigned to the price change's site
//   - Idempotent (returns existing record if already acked)
//   - If ALL assigned staff have acked → marks status='acknowledged' and
//     resolves all open escalations.
//
// Operator ack flow (new):
//   - Sets fuel_price_changes.operator_acked_at = NOW(), operator_user_id
//   - Advances status to 'operator_accepted' if currently pending/notified/escalated
//   - Idempotent (returns existing record if already acked by same operator)
//   - Inserts audit row in fuel_price_acknowledgements with role='operator'
//   - Resolves any open operator-level escalations.
// ============================================================================
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { staffUserId, operatorUserId } = body || {};

    if (!staffUserId && !operatorUserId) {
      return NextResponse.json(
        { error: 'staffUserId or operatorUserId required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // ----- Operator ack branch -------------------------------------------
    if (operatorUserId) {
      // Verify operator exists and has correct role
      const { data: operator, error: opErr } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('id', operatorUserId)
        .single();
      if (opErr || !operator) {
        return NextResponse.json(
          { error: 'Operator not found', operatorUserId },
          { status: 404, headers: corsHeaders }
        );
      }
      if (operator.role !== 'operator' && operator.role !== 'owner') {
        return NextResponse.json(
          { error: 'Only operators or owners can acknowledge as operator', role: operator.role },
          { status: 403, headers: corsHeaders }
        );
      }

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

      // Idempotent check
      if (priceChange.operator_acked_at && priceChange.operator_user_id === operatorUserId) {
        return NextResponse.json({
          success: true,
          already_acknowledged: true,
          price_change_id: id,
          operator: { id: operator.id, name: operator.name },
          operator_acked_at: priceChange.operator_acked_at,
          status: priceChange.status,
        }, { headers: corsHeaders });
      }

      const nowIso = new Date().toISOString();
      // Don't change `status` — the existing CHECK constraint doesn't allow
      // 'operator_accepted'. Operator ack is tracked separately via
      // operator_acked_at + operator_user_id, leaving the existing
      // pending → notified → escalated → acknowledged lifecycle intact
      // (acknowledged is reached when all staff ack).

      // Update the price change row
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
        operator: { id: operator.id, name: operator.name },
        operator_acked_at: nowIso,
        status: priceChange.status,
        audit_row_id: ackRow?.id || null,
      }, { headers: corsHeaders });
    }

    // ----- Staff ack branch (existing, unchanged behaviour) --------------
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

    // Check if already acknowledged
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

    // If all staff acknowledged, update status + resolve escalations
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
