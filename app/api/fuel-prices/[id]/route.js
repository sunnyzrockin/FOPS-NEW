import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// -------------------------------------------------------------------------
// Shared guard (Fix 2): caller must be owner|operator AND own the target.
// -------------------------------------------------------------------------
async function guard(request, id) {
  const auth = await requireRole(request, ['owner', 'operator']);
  if (!auth.ok) {
    const r = auth.response;
    Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
    return { ok: false, response: r };
  }
  const client = supabaseAdmin || supabase;
  const { data: row, error } = await client
    .from('fuel_price_changes')
    .select('id, site_id')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders }) };
  }
  if (!row) {
    return { ok: false, response: NextResponse.json({ error: 'Price change not found' }, { status: 404, headers: corsHeaders }) };
  }
  const allowed = await getAllowedSiteIds(auth.user);
  if (!allowed.includes(row.site_id)) {
    return { ok: false, response: NextResponse.json({ error: 'You are not authorised to modify this price change.' }, { status: 403, headers: corsHeaders }) };
  }
  return { ok: true, client, row, user: auth.user };
}

// DELETE /api/fuel-prices/:id  -> remove a price change
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const g = await guard(request, id);
    if (!g.ok) return g.response;
    const { client } = g;

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
    const g = await guard(request, id);
    if (!g.ok) return g.response;
    const { client } = g;
    const updates = await request.json();
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
