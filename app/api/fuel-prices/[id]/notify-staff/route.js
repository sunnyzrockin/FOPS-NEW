import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/fuel-prices/[id]/notify-staff - Operator notifies staff
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { operatorUserId } = body;

    if (!operatorUserId) {
      return NextResponse.json(
        { error: 'Operator user ID required' },
        { status: 400 }
      );
    }

    // Verify operator has access to this price change's site
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
      .from('operator_site_assignments')
      .select('*')
      .eq('operator_user_id', operatorUserId)
      .eq('site_id', priceChange.site_id)
      .single();

    if (!assignment) {
      return NextResponse.json(
        { error: 'Operator not assigned to this site' },
        { status: 403 }
      );
    }

    // Update notification record
    const { error: updateError } = await supabase
      .from('fuel_price_notifications')
      .update({ staff_notified_at: new Date().toISOString() })
      .eq('price_change_id', id)
      .eq('operator_user_id', operatorUserId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: 'Staff notified' });
  } catch (error) {
    console.error('Error notifying staff:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
