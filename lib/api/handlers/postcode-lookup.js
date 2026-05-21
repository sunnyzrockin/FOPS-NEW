/**
 * /api/fuel-prices-live/postcode-lookup
 *
 * Resolves a search string (postcode, suburb, or postcode prefix) against
 * our existing `fuel_stations` table and returns a centroid + bounds the
 * map can fly to. No external geocoder needed — the stations themselves
 * are the geocoder, which is fine because the only thing the user wants
 * to do with a postcode here is jump to where the prices are.
 *
 * Search modes (tried in order):
 *   1. exact 4-digit postcode      → stations WHERE postcode = '4000'
 *   2. 3-digit postcode prefix     → stations WHERE postcode LIKE '400%'
 *   3. suburb / town fuzzy match   → stations WHERE name ILIKE '%capalaba%'
 *                                    OR address ILIKE '%capalaba%'
 *
 * Returns { ok, mode, query, center:[lat,lng], bounds:[[s,w],[n,e]],
 *           stationCount, sampleSuburb }
 */

import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/auth-helpers';
import { jsonWithCors, attachCors } from '@/lib/api/cors';

function _computeCentroid(rows) {
  if (!rows.length) return null;
  let sLat = 0, sLng = 0, minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  let suburbCounts = {};
  for (const r of rows) {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    sLat += lat; sLng += lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    // Try to derive a suburb name from `name` or `address`. Whatever
    // shows up most often becomes the display label.
    const seed = (r.address || r.name || '').split(',')[0].trim();
    if (seed) suburbCounts[seed] = (suburbCounts[seed] || 0) + 1;
  }
  const sampleSuburb = Object.entries(suburbCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    center: [sLat / rows.length, sLng / rows.length],
    bounds: [[minLat, minLng], [maxLat, maxLng]],
    sampleSuburb,
  };
}

export async function handleGetPostcodeLookup(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return attachCors(auth.response);

    const url = new URL(request.url);
    const qRaw = (url.searchParams.get('q') || '').trim();
    if (!qRaw) {
      return jsonWithCors({ ok: false, error: 'q query param is required (postcode or suburb)' }, { status: 400 });
    }

    const isDigits = /^\d{1,4}$/.test(qRaw);
    const isFullPostcode = /^\d{4}$/.test(qRaw);
    let mode = null;
    let rows = [];

    if (isFullPostcode) {
      mode = 'exact_postcode';
      const { data, error } = await supabaseAdmin
        .from('fuel_stations')
        .select('latitude, longitude, postcode, name, address')
        .eq('postcode', qRaw)
        .range(0, 499);
      if (error) throw error;
      rows = data || [];
    }

    if (rows.length === 0 && isDigits) {
      mode = 'postcode_prefix';
      const { data, error } = await supabaseAdmin
        .from('fuel_stations')
        .select('latitude, longitude, postcode, name, address')
        .like('postcode', `${qRaw}%`)
        .range(0, 999);
      if (error) throw error;
      rows = data || [];
    }

    if (rows.length === 0) {
      mode = 'suburb_fuzzy';
      // Use OR to match either name or address — Supabase JS does this
      // via .or('name.ilike.%term%,address.ilike.%term%').
      const safe = qRaw.replace(/[%,()]/g, '');
      const { data, error } = await supabaseAdmin
        .from('fuel_stations')
        .select('latitude, longitude, postcode, name, address')
        .or(`name.ilike.%${safe}%,address.ilike.%${safe}%`)
        .range(0, 499);
      if (error) throw error;
      rows = data || [];
    }

    if (rows.length === 0) {
      return jsonWithCors(
        { ok: false, mode, query: qRaw, error: 'No stations matched that postcode or suburb.' },
        { status: 404 }
      );
    }

    const result = _computeCentroid(rows);
    if (!result) {
      return jsonWithCors(
        { ok: false, mode, query: qRaw, error: 'Stations matched but had no usable coordinates.' },
        { status: 500 }
      );
    }

    return jsonWithCors({
      ok: true,
      mode,
      query: qRaw,
      stationCount: rows.length,
      ...result,
    });
  } catch (e) {
    console.error('postcode-lookup error:', e);
    return jsonWithCors({ ok: false, error: 'Lookup failed', message: e?.message }, { status: 500 });
  }
}
