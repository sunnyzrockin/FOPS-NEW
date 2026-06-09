/**
 * Fuel-price escalation sweep — pure business logic, no HTTP / auth.
 *
 * The cron endpoint at /api/cron/escalate (gated by CRON_SECRET) is the
 * ONLY way to trigger this in production. The previous client-side
 * polling path (formerly POST /api/fuel-prices/escalate) was removed in
 * the scaling sprint.
 *
 * Algorithm:
 *   - For every price_change that's been notified but not all-acknowledged:
 *       * 15 min → create 'urgent' escalation (status flip to 'escalated')
 *       * 30 min → create 'operator' escalation
 *       * every 15 min after the first operator escalation → repeat
 *   - If every staff member has acknowledged → resolve all escalations
 *     and flip status to 'acknowledged'.
 *
 * Idempotent: re-running within the same minute is safe (each branch
 * checks for an existing active escalation of the same type before
 * creating a new one).
 */

import { supabaseAdmin } from '@/lib/supabase';

export async function runEscalationSweep() {
  if (!supabaseAdmin) {
    throw new Error('supabaseAdmin not configured');
  }
  const now = new Date();

  // Pull every price change still in the pipeline.
  const { data: priceChanges } = await supabaseAdmin
    .from('fuel_price_changes')
    .select(`
      *,
      site:sites(id, name),
      notifications:fuel_price_notifications(id, staff_notified_at),
      acknowledgements:fuel_price_acknowledgements(id, staff_user_id),
      escalations:fuel_price_escalations(id, escalation_level, escalation_type, escalated_at, resolved_at)
    `)
    .in('status', ['notified', 'escalated']);

  const escalations = [];

  for (const pc of priceChanges || []) {
    const notifiedAt = pc.notifications?.[0]?.staff_notified_at;
    if (!notifiedAt) continue;

    const notifiedTime = new Date(notifiedAt);
    const minutesElapsed = (now - notifiedTime) / (1000 * 60);

    // All staff for this site
    const { data: allStaff } = await supabaseAdmin
      .from('staff_site_assignments')
      .select('staff_user_id')
      .eq('site_id', pc.site_id);

    const staffIds = (allStaff || []).map((s) => s.staff_user_id);
    const acknowledgedIds = (pc.acknowledgements || []).map((a) => a.staff_user_id);

    const allAcknowledged = staffIds.length > 0 &&
      staffIds.every((sid) => acknowledgedIds.includes(sid));

    if (allAcknowledged) {
      await supabaseAdmin
        .from('fuel_price_escalations')
        .update({ resolved_at: now.toISOString() })
        .eq('price_change_id', pc.id)
        .is('resolved_at', null);

      await supabaseAdmin
        .from('fuel_price_changes')
        .update({ status: 'acknowledged' })
        .eq('id', pc.id);

      continue;
    }

    const activeEscalations = (pc.escalations || []).filter((e) => !e.resolved_at);

    // 15 min → urgent
    if (minutesElapsed >= 15) {
      const hasUrgent = activeEscalations.some((e) => e.escalation_type === 'urgent');
      if (!hasUrgent) {
        const { data: newEscalation } = await supabaseAdmin
          .from('fuel_price_escalations')
          .insert({ price_change_id: pc.id, escalation_level: 1, escalation_type: 'urgent' })
          .select().single();

        escalations.push({
          priceChange: pc, escalation: newEscalation, type: 'urgent',
          message: `Urgent: Price change for ${pc.site?.name} - ${pc.fuel_type} not acknowledged after 15 minutes`,
        });

        await supabaseAdmin
          .from('fuel_price_changes')
          .update({ status: 'escalated' })
          .eq('id', pc.id);
      }
    }

    // 30 min → operator
    if (minutesElapsed >= 30) {
      const hasOperator = activeEscalations.some((e) => e.escalation_type === 'operator');
      if (!hasOperator) {
        const { data: newEscalation } = await supabaseAdmin
          .from('fuel_price_escalations')
          .insert({ price_change_id: pc.id, escalation_level: 2, escalation_type: 'operator' })
          .select().single();

        escalations.push({
          priceChange: pc, escalation: newEscalation, type: 'operator',
          message: `Critical: Price change for ${pc.site?.name} - ${pc.fuel_type} not acknowledged after 30 minutes. Escalated to operator.`,
        });
      }
    }

    // Every 15 min after first operator escalation → repeat
    const operatorEscalation = activeEscalations.find((e) => e.escalation_type === 'operator');
    if (operatorEscalation && minutesElapsed >= 45) {
      const lastEscalationTime = new Date(operatorEscalation.escalated_at);
      const minutesSinceEscalation = (now - lastEscalationTime) / (1000 * 60);
      const operatorCount = activeEscalations.filter((e) => e.escalation_type === 'operator').length;
      const shouldRepeat = Math.floor(minutesSinceEscalation / 15) > operatorCount - 1;

      if (shouldRepeat) {
        const level = operatorCount + 1;
        const { data: newEscalation } = await supabaseAdmin
          .from('fuel_price_escalations')
          .insert({ price_change_id: pc.id, escalation_level: level, escalation_type: 'operator' })
          .select().single();

        escalations.push({
          priceChange: pc, escalation: newEscalation, type: 'operator_repeat',
          message: `Repeated escalation (${level}): Price change for ${pc.site?.name} - ${pc.fuel_type} still not acknowledged`,
        });
      }
    }
  }

  return {
    success: true,
    sweptAt: now.toISOString(),
    candidates: (priceChanges || []).length,
    escalationsCreated: escalations.length,
    escalations,
  };
}
