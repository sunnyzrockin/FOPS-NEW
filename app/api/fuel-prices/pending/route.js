import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/fuel-prices/pending - Get pending price changes for a user
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'userId and role required' },
        { status: 400 }
      );
    }

    let pendingChanges = [];

    if (role === 'operator') {
      // Get operator's sites
      const { data: operatorSites } = await supabase
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', userId);

      const siteIds = operatorSites?.map(s => s.site_id) || [];

      if (siteIds.length > 0) {
        // Get pending price changes for operator's sites
        const { data } = await supabase
          .from('fuel_price_changes')
          .select(`
            *,
            site:sites(id, name, code),
            created_by:users!created_by_user_id(id, name, email),
            notifications:fuel_price_notifications!inner(
              id,
              notified_at,
              staff_notified_at
            ),
            acknowledgements:fuel_price_acknowledgements(
              id,
              staff:users!staff_user_id(id, name),
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
          .in('site_id', siteIds)
          .in('status', ['notified', 'escalated'])
          .order('created_at', { ascending: false });

        pendingChanges = data || [];
      }
    } else if (role === 'staff') {
      // Get staff's sites
      const { data: staffSites } = await supabase
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', userId);

      const siteIds = staffSites?.map(s => s.site_id) || [];

      if (siteIds.length > 0) {
        // Get price changes that staff hasn't acknowledged yet
        const { data } = await supabase
          .from('fuel_price_changes')
          .select(`
            *,
            site:sites(id, name, code),
            created_by:users!created_by_user_id(id, name, email),
            notifications:fuel_price_notifications(
              id,
              staff_notified_at
            ),
            acknowledgements:fuel_price_acknowledgements(
              id,
              staff_user_id
            ),
            escalations:fuel_price_escalations(
              id,
              escalation_level,
              escalation_type,
              escalated_at,
              resolved_at
            )
          `)
          .in('site_id', siteIds)
          .neq('status', 'acknowledged')
          .order('created_at', { ascending: false });

        // Filter out already acknowledged by this staff member
        pendingChanges = (data || []).filter(pc => 
          !pc.acknowledgements?.some(ack => ack.staff_user_id === userId)
        );
      }
    }

    return NextResponse.json(pendingChanges);
  } catch (error) {
    console.error('Error fetching pending price changes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
