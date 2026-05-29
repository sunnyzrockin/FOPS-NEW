import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ============================================================================
// GET /api/fuel-prices/history
// ----------------------------------------------------------------------------
// Auth: REQUIRED — Bearer JWT.
//
// Role-scoped:
//   owner    → all price changes for sites they own
//   operator → price changes for sites in operator_site_assignments
//   staff    → price changes for sites in staff_site_assignments
//
// Query params:
//   days    (optional) — how far back, defaults to 14, max 90
//   siteId  (optional) — narrow to one site (must be in caller's scope)
//
// Response:
// [{
//   id, site_id, site_name, site_code,
//   fuel_type, old_price, new_price, effective_datetime, status, notes,
//   created_at, created_by_user_id, created_by: {id, name, role},
//   operator_acked_at, operator_user_id, operator_acked_by: {id, name},
//   staff_acknowledgments: [{ staff_user_id, staff_name, acknowledged_at }],
//   acknowledgment_summary: "✅ Accepted by Sarah Johnson on 9 May, 14:30"
//                         | "⏳ Pending operator acceptance"
//                         | "🚨 Escalated, no operator response"
// }, ...]
//
// Sorted by created_at DESC.
// ============================================================================
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;

    const url = new URL(request.url);
    const daysParam = parseInt(url.searchParams.get('days') || '14', 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 14;
    const reqSiteId = url.searchParams.get('siteId');

    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const db = supabaseAdmin || supabase;

    // -------- Resolve scope from JWT role --------
    let scopedSiteIds = [];
    if (me.role === 'owner') {
      const { data, error } = await db.from('sites').select('id').eq('owner_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((s) => s.id);
    } else if (me.role === 'operator') {
      const { data, error } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else if (me.role === 'staff') {
      const { data, error } = await db
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else {
      return NextResponse.json(
        { error: `Unknown role: ${me.role}` },
        { status: 403, headers: corsHeaders }
      );
    }

    // Apply optional siteId filter (must be in scope)
    if (reqSiteId) {
      if (!scopedSiteIds.includes(reqSiteId)) {
        return NextResponse.json([], { headers: corsHeaders });
      }
      scopedSiteIds = [reqSiteId];
    }

    if (!scopedSiteIds.length) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    // -------- Fetch price changes + related data in parallel --------
    const [pcRes, sitesRes, usersRes] = await Promise.all([
      db
        .from('fuel_price_changes')
        .select(
          'id, site_id, fuel_type, old_price, new_price, effective_datetime, status, notes, ' +
            'created_at, created_by_user_id, operator_acked_at, operator_user_id'
        )
        .in('site_id', scopedSiteIds)
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('sites').select('id, name, code').in('id', scopedSiteIds),
      db.from('users').select('id, name, email, role'),
    ]);
    if (pcRes.error) throw pcRes.error;
    if (sitesRes.error) throw sitesRes.error;
    if (usersRes.error) throw usersRes.error;

    const priceChanges = pcRes.data || [];
    if (!priceChanges.length) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    // Build lookup maps
    const sitesById = new Map((sitesRes.data || []).map((s) => [s.id, s]));
    const usersById = new Map((usersRes.data || []).map((u) => [u.id, u]));

    // Fetch acknowledgments for these price changes
    const pcIds = priceChanges.map((p) => p.id);
    const { data: acks, error: acksErr } = await db
      .from('fuel_price_acknowledgements')
      .select('id, price_change_id, staff_user_id, operator_user_id, role, acknowledged_at')
      .in('price_change_id', pcIds);
    if (acksErr) throw acksErr;

    // Group acks by price_change_id
    const acksByPc = new Map();
    for (const a of acks || []) {
      if (!acksByPc.has(a.price_change_id)) acksByPc.set(a.price_change_id, []);
      acksByPc.get(a.price_change_id).push(a);
    }

    const formatDateTime = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    };

    const enriched = priceChanges.map((pc) => {
      const site = sitesById.get(pc.site_id) || {};
      const creator = usersById.get(pc.created_by_user_id) || null;
      const operator = pc.operator_user_id ? usersById.get(pc.operator_user_id) || null : null;
      const pcAcks = (acksByPc.get(pc.id) || []).slice().sort(
        (a, b) =>
          new Date(a.acknowledged_at || 0).getTime() -
          new Date(b.acknowledged_at || 0).getTime()
      );
      const staffAcks = pcAcks
        .filter((a) => a.staff_user_id)
        .map((a) => ({
          ack_id: a.id,
          staff_user_id: a.staff_user_id,
          staff_name: usersById.get(a.staff_user_id)?.name || null,
          acknowledged_at: a.acknowledged_at,
          acknowledged_at_formatted: formatDateTime(a.acknowledged_at),
        }));

      // Build human-readable summary line
      let summary = '⏳ Pending operator acceptance';
      if (pc.operator_acked_at) {
        const name = operator?.name || 'Operator';
        summary = `✅ Accepted by ${name} on ${formatDateTime(pc.operator_acked_at)}`;
      } else if (pc.status === 'escalated') {
        summary = '🚨 Escalated — no operator response yet';
      }

      return {
        id: pc.id,
        site_id: pc.site_id,
        site_name: site.name || null,
        site_code: site.code || null,
        fuel_type: pc.fuel_type,
        old_price: pc.old_price,
        new_price: pc.new_price,
        price_change: pc.old_price != null && pc.new_price != null
          ? Math.round((Number(pc.new_price) - Number(pc.old_price)) * 10) / 10
          : null,
        effective_datetime: pc.effective_datetime,
        status: pc.status,
        notes: pc.notes,
        created_at: pc.created_at,
        created_by_user_id: pc.created_by_user_id,
        created_by: creator
          ? { id: creator.id, name: creator.name, role: creator.role }
          : null,
        operator_acked_at: pc.operator_acked_at,
        operator_acked_at_formatted: pc.operator_acked_at
          ? formatDateTime(pc.operator_acked_at)
          : null,
        operator_user_id: pc.operator_user_id,
        operator_acked_by: operator ? { id: operator.id, name: operator.name } : null,
        staff_acknowledgments: staffAcks,
        staff_ack_count: staffAcks.length,
        acknowledgment_summary: summary,
      };
    });

    return NextResponse.json(enriched, { headers: corsHeaders });
  } catch (error) {
    console.error('GET /api/fuel-prices/history error:', error);
    return NextResponse.json(
      { error: 'Failed to load price change history', detail: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
