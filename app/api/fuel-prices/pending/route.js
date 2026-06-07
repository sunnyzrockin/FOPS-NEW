import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '@/lib/api/cors';
import { verifyAuth } from '@/lib/auth-helpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/fuel-prices/pending - Get pending price changes for a user
//
// Auth (Fix 5): previously unauthenticated; any caller could pass
// ?userId=<anyone>&role=operator and read another operator's pending
// price-change pipeline. Now requires a Bearer token, and the userId
// query param MUST match the authenticated user (any mismatch -> 403).
// We continue to accept the param (rather than infer from JWT) only to
// avoid changing the existing request shape from the frontend.
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'userId and role required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Identity-spoof guard: the caller can only ask about themselves.
    if (userId !== auth.user.id || role !== auth.user.role) {
      return NextResponse.json(
        { error: 'You can only request your own pending price changes.' },
        { status: 403, headers: corsHeaders }
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
            operator_acked_by:users!operator_user_id(id, name, email),
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
          // Show pending, notified, escalated, AND operator_accepted (keep visible
          // with "Accepted" badge for the last 14 days so operator can see history)
          .in('status', ['pending', 'notified', 'escalated', 'operator_accepted'])
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
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
            operator_acked_by:users!operator_user_id(id, name, email),
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
