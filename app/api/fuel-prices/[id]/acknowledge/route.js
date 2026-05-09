import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/fuel-prices/[id]/acknowledge - Staff acknowledges price change
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { staffUserId } = body;

    if (!staffUserId) {
      return NextResponse.json(
        { error: 'Staff user ID required' },
        { status: 400 }
      );
    }

    // Verify staff has access to this price change's site
    const { data: priceChange } = await supabase
      .from('fuel_price_changes')
      .select('site_id')
      .eq('id', id)
      .single();

    if (!priceChange) {
      return NextResponse.json(
        { error: 'Price change not found' },
        { status: 404 }
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
        { status: 403 }
      );
    }

    // Check if already acknowledged
    const { data: existing } = await supabase
      .from('fuel_price_acknowledgements')
      .select('*')
      .eq('price_change_id', id)
      .eq('staff_user_id', staffUserId)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Already acknowledged',
        acknowledgement: existing
      });
    }

    // Create acknowledgement
    const { data: acknowledgement, error: insertError } = await supabase
      .from('fuel_price_acknowledgements')
      .insert({
        price_change_id: id,
        staff_user_id: staffUserId
      })
      .select(`
        *,
        staff:users!staff_user_id(id, name, email)
      `)
      .single();

    if (insertError) throw insertError;

    // Check if all staff have acknowledged
    const { data: allStaff } = await supabase
      .from('staff_site_assignments')
      .select('staff_user_id')
      .eq('site_id', priceChange.site_id);

    const { data: allAcknowledgements } = await supabase
      .from('fuel_price_acknowledgements')
      .select('staff_user_id')
      .eq('price_change_id', id);

    const staffIds = allStaff?.map(s => s.staff_user_id) || [];
    const acknowledgedIds = allAcknowledgements?.map(a => a.staff_user_id) || [];

    // If all staff acknowledged, update status and resolve escalations
    if (staffIds.length > 0 && staffIds.every(sid => acknowledgedIds.includes(sid))) {
      await supabase
        .from('fuel_price_changes')
        .update({ status: 'acknowledged' })
        .eq('id', id);

      // Resolve any pending escalations
      await supabase
        .from('fuel_price_escalations')
        .update({ resolved_at: new Date().toISOString() })
        .eq('price_change_id', id)
        .is('resolved_at', null);
    }

    return NextResponse.json({
      success: true,
      message: 'Price change acknowledged',
      acknowledgement
    });
  } catch (error) {
    console.error('Error acknowledging price change:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
