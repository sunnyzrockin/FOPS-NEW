import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/fuel-prices - List all fuel price changes with filters
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const role = searchParams.get('role');

    let query = supabase
      .from('fuel_price_changes')
      .select(`
        *,
        site:sites(id, name, code),
        created_by:users!created_by_user_id(id, name, email, role),
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
        escalations:fuel_price_escalations(
          id,
          escalation_level,
          escalation_type,
          escalated_at,
          resolved_at
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by site if provided
    if (siteId) {
      query = query.eq('site_id', siteId);
    }

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data: priceChanges, error } = await query;

    if (error) throw error;

    // Filter based on role
    let filteredChanges = priceChanges;
    if (role === 'operator' && userId) {
      // Get operator's sites
      const { data: operatorSites } = await supabase
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', userId);
      
      const siteIds = operatorSites?.map(s => s.site_id) || [];
      filteredChanges = priceChanges.filter(pc => siteIds.includes(pc.site_id));
    } else if (role === 'staff' && userId) {
      // Get staff's sites
      const { data: staffSites } = await supabase
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', userId);
      
      const siteIds = staffSites?.map(s => s.site_id) || [];
      filteredChanges = priceChanges.filter(pc => siteIds.includes(pc.site_id));
    }

    return NextResponse.json(filteredChanges);
  } catch (error) {
    console.error('Error fetching fuel prices:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/fuel-prices - Create new fuel price change (Owner only)
export async function POST(request) {
  try {
    const body = await request.json();
    const { siteId, fuelType, oldPrice, newPrice, effectiveDatetime, createdByUserId, notes } = body;

    // Validation
    if (!siteId || !fuelType || !newPrice || !effectiveDatetime || !createdByUserId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!['ULP', 'PULP', 'Diesel'].includes(fuelType)) {
      return NextResponse.json(
        { error: 'Invalid fuel type. Must be ULP, PULP, or Diesel' },
        { status: 400 }
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
