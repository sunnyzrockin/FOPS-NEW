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

// POST /api/fuel-prices/escalate - Check and create escalations for unacknowledged price changes
//
// Auth (Fix 3): this endpoint is invoked from the authenticated app (a 5-min
// poller on the operator/staff dashboards in /app/app/page.js triggers it).
// Choice: gate behind verifyAuth rather than a cron secret. Any logged-in
// user can trigger the idempotent sweep; this is safe because the work it
// performs is bounded (process pending escalations only) and the side-effect
// is purely to update internal escalation state.
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const now = new Date();
    
    // Get all price changes that are notified but not fully acknowledged
    const { data: priceChanges } = await supabase
      .from('fuel_price_changes')
      .select(`
        *,
        site:sites(id, name),
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
      .in('status', ['notified', 'escalated']);

    const escalations = [];

    for (const pc of priceChanges || []) {
      // Skip if no staff notified yet
      const notifiedAt = pc.notifications?.[0]?.staff_notified_at;
      if (!notifiedAt) continue;

      const notifiedTime = new Date(notifiedAt);
      const minutesElapsed = (now - notifiedTime) / (1000 * 60);

      // Get all staff for this site
      const { data: allStaff } = await supabase
        .from('staff_site_assignments')
        .select('staff_user_id')
        .eq('site_id', pc.site_id);

      const staffIds = allStaff?.map(s => s.staff_user_id) || [];
      const acknowledgedIds = pc.acknowledgements?.map(a => a.staff_user_id) || [];

      // Check if all staff have acknowledged
      const allAcknowledged = staffIds.length > 0 && 
        staffIds.every(sid => acknowledgedIds.includes(sid));

      if (allAcknowledged) {
        // Resolve all escalations and update status
        await supabase
          .from('fuel_price_escalations')
          .update({ resolved_at: now.toISOString() })
          .eq('price_change_id', pc.id)
          .is('resolved_at', null);

        await supabase
          .from('fuel_price_changes')
          .update({ status: 'acknowledged' })
          .eq('id', pc.id);

        continue;
      }

      // Get active (unresolved) escalations
      const activeEscalations = pc.escalations?.filter(e => !e.resolved_at) || [];

      // 15 min: urgent alert (if no urgent escalation exists)
      if (minutesElapsed >= 15) {
        const hasUrgent = activeEscalations.some(e => e.escalation_type === 'urgent');
        
        if (!hasUrgent) {
          const { data: newEscalation } = await supabase
            .from('fuel_price_escalations')
            .insert({
              price_change_id: pc.id,
              escalation_level: 1,
              escalation_type: 'urgent'
            })
            .select()
            .single();

          escalations.push({
            priceChange: pc,
            escalation: newEscalation,
            type: 'urgent',
            message: `Urgent: Price change for ${pc.site?.name} - ${pc.fuel_type} not acknowledged after 15 minutes`
          });

          await supabase
            .from('fuel_price_changes')
            .update({ status: 'escalated' })
            .eq('id', pc.id);
        }
      }

      // 30 min: escalate to operator (if no operator escalation exists)
      if (minutesElapsed >= 30) {
        const hasOperator = activeEscalations.some(e => e.escalation_type === 'operator');
        
        if (!hasOperator) {
          const { data: newEscalation } = await supabase
            .from('fuel_price_escalations')
            .insert({
              price_change_id: pc.id,
              escalation_level: 2,
              escalation_type: 'operator'
            })
            .select()
            .single();

          escalations.push({
            priceChange: pc,
            escalation: newEscalation,
            type: 'operator',
            message: `Critical: Price change for ${pc.site?.name} - ${pc.fuel_type} not acknowledged after 30 minutes. Escalated to operator.`
          });
        }
      }

      // Check for repeated escalations every 15 minutes after first operator escalation
      const operatorEscalation = activeEscalations.find(e => e.escalation_type === 'operator');
      if (operatorEscalation && minutesElapsed >= 45) {
        const lastEscalationTime = new Date(operatorEscalation.escalated_at);
        const minutesSinceEscalation = (now - lastEscalationTime) / (1000 * 60);
        
        // Create repeated escalation every 15 minutes
        const shouldRepeat = Math.floor(minutesSinceEscalation / 15) > activeEscalations.filter(e => e.escalation_type === 'operator').length - 1;
        
        if (shouldRepeat) {
          const level = activeEscalations.filter(e => e.escalation_type === 'operator').length + 1;
          
          const { data: newEscalation } = await supabase
            .from('fuel_price_escalations')
            .insert({
              price_change_id: pc.id,
              escalation_level: level,
              escalation_type: 'operator'
            })
            .select()
            .single();

          escalations.push({
            priceChange: pc,
            escalation: newEscalation,
            type: 'operator_repeat',
            message: `Repeated escalation (${level}): Price change for ${pc.site?.name} - ${pc.fuel_type} still not acknowledged`
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      escalationsCreated: escalations.length,
      escalations
    });
  } catch (error) {
    console.error('Error processing escalations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
