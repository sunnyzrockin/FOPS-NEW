import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// DELETE /api/fuel-prices/:id  -> remove a price change
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const client = supabaseAdmin || supabase;

    // Cascade delete dependent rows first (notifications, acknowledgements)
    await client.from('fuel_price_acknowledgements').delete().eq('price_change_id', id);
    await client.from('fuel_price_notifications').delete().eq('price_change_id', id);
    await client.from('fuel_price_escalations').delete().eq('price_change_id', id);

    const { error } = await client
      .from('fuel_price_changes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to delete price change', message: e?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH /api/fuel-prices/:id  -> update status or notes
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const updates = await request.json();
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('fuel_price_changes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to update price change', message: e?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
