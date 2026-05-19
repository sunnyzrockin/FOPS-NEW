/**
 * /api/dips handlers — Phase 3 Fuel Inventory tracking.
 *
 * Extracted out of the 3,500-line catch-all so the dips feature is a
 * single browsable module. Each handler is `export`-ed and called by a
 * thin route.js wrapper in /app/app/api/dips/.
 *
 * Handlers DO NOT touch CORS — the route wrapper attaches headers via
 * jsonWithCors / attachCors.
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { jsonWithCors, attachCors } from '@/lib/api/cors';
import { getAllowedSiteIds } from '@/lib/api/site-access';

export async function handleGetDips(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const url = new URL(request.url);
    const siteIdParam = url.searchParams.get('site_id');
    const siteIdsParam = url.searchParams.get('site_ids');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam, 10) || 500, 1000);

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (allowedSiteIds.length === 0) return jsonWithCors([]);

    let requested = null;
    if (siteIdParam) requested = [siteIdParam];
    else if (siteIdsParam) requested = siteIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

    const finalSiteIds = requested
      ? requested.filter((id) => allowedSiteIds.includes(id))
      : allowedSiteIds;
    if (finalSiteIds.length === 0) return jsonWithCors([]);

    let query = admin
      .from('dip_readings')
      .select('*')
      .in('site_id', finalSiteIds)
      .order('reading_time', { ascending: false })
      .limit(limit);
    if (from) query = query.gte('reading_time', new Date(from).toISOString());
    if (to) query = query.lte('reading_time', new Date(to).toISOString());

    const { data, error } = await query;
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('Get dips error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch dip readings', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleGetDipsCurrent(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (allowedSiteIds.length === 0) return jsonWithCors([]);

    const { data, error } = await admin
      .from('dip_readings')
      .select('*')
      .in('site_id', allowedSiteIds)
      .order('reading_time', { ascending: false })
      .limit(allowedSiteIds.length * 5);
    if (error) throw error;

    const bySite = new Map();
    for (const row of data || []) {
      const arr = bySite.get(row.site_id) || [];
      if (arr.length < 2) arr.push(row);
      bySite.set(row.site_id, arr);
    }

    const fuels = ['ulp', 'diesel', 'premium'];
    const result = allowedSiteIds.map((siteId) => {
      const [current, previous] = bySite.get(siteId) || [];
      const consumption = {};
      for (const f of fuels) {
        const cur = current?.[`${f}_litres`];
        const prev = previous?.[`${f}_litres`];
        const deliveries = Number(current?.[`deliveries_${f}_litres`] || 0);
        if (cur != null && prev != null) {
          consumption[f] = Number(prev) - Number(cur) + deliveries;
        } else {
          consumption[f] = null;
        }
      }
      return {
        site_id: siteId,
        current: current || null,
        previous: previous || null,
        consumption_since_previous: consumption,
      };
    });

    return jsonWithCors(result);
  } catch (error) {
    console.error('Get current dips error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch current dips', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleGetDipsTrends(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const url = new URL(request.url);
    const siteIdParam = url.searchParams.get('site_id');
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get('days'), 10) || 7, 90));

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (allowedSiteIds.length === 0) return jsonWithCors({ days, sites: [] });

    const siteIds = siteIdParam
      ? (allowedSiteIds.includes(siteIdParam) ? [siteIdParam] : [])
      : allowedSiteIds;
    if (siteIds.length === 0) return jsonWithCors({ days, sites: [] });

    const since = new Date();
    since.setDate(since.getDate() - (days + 1));
    const { data, error } = await admin
      .from('dip_readings')
      .select('*')
      .in('site_id', siteIds)
      .gte('reading_time', since.toISOString())
      .order('reading_time', { ascending: true });
    if (error) throw error;

    const fuels = ['ulp', 'diesel', 'premium'];
    const groupedBySite = new Map();
    for (const row of data || []) {
      const day = new Date(row.reading_time).toISOString().slice(0, 10);
      const siteMap = groupedBySite.get(row.site_id) || new Map();
      const dayArr = siteMap.get(day) || [];
      dayArr.push(row);
      siteMap.set(day, dayArr);
      groupedBySite.set(row.site_id, siteMap);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    const sites = siteIds.map((siteId) => {
      const siteMap = groupedBySite.get(siteId) || new Map();
      const daily = dayKeys.map((day) => {
        const readings = (siteMap.get(day) || []).slice().sort((a, b) =>
          new Date(a.reading_time) - new Date(b.reading_time)
        );
        const consumption = { ulp: null, diesel: null, premium: null };
        if (readings.length >= 2) {
          const first = readings[0];
          const last = readings[readings.length - 1];
          for (const f of fuels) {
            const startVal = first[`${f}_litres`];
            const endVal = last[`${f}_litres`];
            if (startVal != null && endVal != null) {
              const deliveriesInDay = readings.slice(1).reduce(
                (acc, r) => acc + Number(r[`deliveries_${f}_litres`] || 0),
                0
              );
              consumption[f] = Number(startVal) - Number(endVal) + deliveriesInDay;
            }
          }
        }
        return { date: day, consumption, reading_count: readings.length };
      });
      const avg = { ulp: null, diesel: null, premium: null };
      for (const f of fuels) {
        const vals = daily.map((d) => d.consumption[f]).filter((v) => v != null);
        if (vals.length > 0) avg[f] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      return { site_id: siteId, daily, average_consumption: avg };
    });

    return jsonWithCors({ days, sites });
  } catch (error) {
    console.error('Get dip trends error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch dip trends', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleCreateDip(request) {
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const body = await request.json();
    const {
      site_id,
      reading_label = null,
      reading_time = null,
      ulp_litres = null,
      diesel_litres = null,
      premium_litres = null,
      deliveries_ulp_litres = 0,
      deliveries_diesel_litres = 0,
      deliveries_premium_litres = 0,
      notes = null,
    } = body || {};

    if (!site_id) return jsonWithCors({ error: 'site_id is required' }, { status: 400 });

    const anyLevel = [ulp_litres, diesel_litres, premium_litres].some((v) => v != null && v !== '');
    const anyDelivery = [deliveries_ulp_litres, deliveries_diesel_litres, deliveries_premium_litres]
      .some((v) => Number(v) > 0);
    if (!anyLevel && !anyDelivery) {
      return jsonWithCors(
        { error: 'Provide at least one tank level or one delivery value.' },
        { status: 400 }
      );
    }

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (!allowedSiteIds.includes(site_id)) {
      return jsonWithCors({ error: 'You are not assigned to this site.' }, { status: 403 });
    }

    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const toNumZero = (v) => (v === '' || v == null ? 0 : Number(v));

    const row = {
      id: uuidv4(),
      site_id,
      operator_user_id: currentUser.id,
      reading_label: reading_label || null,
      reading_time: reading_time ? new Date(reading_time).toISOString() : new Date().toISOString(),
      ulp_litres: toNum(ulp_litres),
      diesel_litres: toNum(diesel_litres),
      premium_litres: toNum(premium_litres),
      deliveries_ulp_litres: toNumZero(deliveries_ulp_litres),
      deliveries_diesel_litres: toNumZero(deliveries_diesel_litres),
      deliveries_premium_litres: toNumZero(deliveries_premium_litres),
      notes: notes || null,
    };

    const { data, error } = await admin
      .from('dip_readings')
      .insert([row])
      .select()
      .single();
    if (error) throw error;

    return jsonWithCors(data);
  } catch (error) {
    console.error('Create dip error:', error);
    return jsonWithCors(
      { error: 'Failed to create dip reading', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleUpdateDip(id, request) {
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const { data: existing, error: getErr } = await admin
      .from('dip_readings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !existing) {
      return jsonWithCors({ error: 'Dip reading not found' }, { status: 404 });
    }

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (!allowedSiteIds.includes(existing.site_id)) {
      return jsonWithCors({ error: 'You do not have access to this reading.' }, { status: 403 });
    }

    if (currentUser.role === 'operator') {
      if (existing.operator_user_id !== currentUser.id) {
        return jsonWithCors(
          { error: 'Operators can only edit their own readings.' },
          { status: 403 }
        );
      }
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return jsonWithCors(
          { error: 'Edit window expired (>24h). Submit a new reading instead.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const editable = [
      'reading_label', 'reading_time',
      'ulp_litres', 'diesel_litres', 'premium_litres',
      'deliveries_ulp_litres', 'deliveries_diesel_litres', 'deliveries_premium_litres',
      'notes',
    ];
    const patch = {};
    for (const k of editable) {
      if (k in body) {
        if (k === 'reading_time' && body[k]) {
          patch[k] = new Date(body[k]).toISOString();
        } else if (k.endsWith('_litres')) {
          const isDelivery = k.startsWith('deliveries_');
          const v = body[k];
          if (v === '' || v == null) patch[k] = isDelivery ? 0 : null;
          else patch[k] = Number(v);
        } else {
          patch[k] = body[k] || null;
        }
      }
    }

    const { data, error } = await admin
      .from('dip_readings')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return jsonWithCors(data);
  } catch (error) {
    console.error('Update dip error:', error);
    return jsonWithCors(
      { error: 'Failed to update dip reading', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleDeleteDip(id, request) {
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const { data: existing, error: getErr } = await admin
      .from('dip_readings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !existing) {
      return jsonWithCors({ error: 'Dip reading not found' }, { status: 404 });
    }

    const allowedSiteIds = await getAllowedSiteIds(currentUser);
    if (!allowedSiteIds.includes(existing.site_id)) {
      return jsonWithCors({ error: 'You do not have access to this reading.' }, { status: 403 });
    }
    if (currentUser.role === 'operator') {
      if (existing.operator_user_id !== currentUser.id) {
        return jsonWithCors(
          { error: 'Operators can only delete their own readings.' },
          { status: 403 }
        );
      }
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return jsonWithCors(
          { error: 'Delete window expired (>24h).' },
          { status: 403 }
        );
      }
    }

    const { error } = await admin
      .from('dip_readings')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return jsonWithCors({ success: true });
  } catch (error) {
    console.error('Delete dip error:', error);
    return jsonWithCors(
      { error: 'Failed to delete dip reading', message: error?.message },
      { status: 500 }
    );
  }
}
