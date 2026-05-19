/**
 * /api/fuel-prices-live handlers — Phase 3b QLD-wide live pricing.
 *
 * Extracted from the catch-all so the live-pricing feature is a single
 * browsable module. All endpoints are owner-only and rely on the lazy
 * `maybeSync` cache from /app/lib/fuel-pricing/sync-service.js.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/auth-helpers';
import { maybeSync } from '@/lib/fuel-pricing/sync-service';
import { jsonWithCors, attachCors } from '@/lib/api/cors';

export async function handleGetLiveStations(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return attachCors(auth.response);

    let syncMeta = null;
    try { syncMeta = await maybeSync({ force: false }); }
    catch (syncErr) { console.error('[fuel-prices-live] maybeSync threw:', syncErr); }

    const url = new URL(request.url);
    const fuelType = url.searchParams.get('fuel_type');
    const region   = url.searchParams.get('region');
    const brand    = url.searchParams.get('brand');
    const maxPrice = url.searchParams.get('max_price');

    if (!fuelType) {
      return jsonWithCors(
        { error: 'fuel_type query param is required (e.g. ULP91, Diesel)' },
        { status: 400 }
      );
    }

    let q = supabaseAdmin
      .from('fuel_prices_live')
      .select(`
        price_cents, is_stale, provider_updated_at, cached_at,
        station:fuel_stations!inner (
          station_id, name, brand, address, region, postcode,
          latitude, longitude
        )
      `)
      .eq('fuel_type', fuelType)
      .range(0, 4999);

    if (region) q = q.eq('station.region', region);
    if (brand)  q = q.eq('station.brand', brand);
    if (maxPrice) {
      const cents = Math.round(parseFloat(maxPrice) * 100);
      if (!Number.isNaN(cents) && cents > 0) q = q.lte('price_cents', cents);
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || [])
      .filter((r) => r.station && r.station.latitude != null && r.station.longitude != null)
      .filter((r) => r.price_cents >= 50 && r.price_cents <= 500)
      .map((r) => ({
        station_id: r.station.station_id,
        name: r.station.name,
        brand: r.station.brand,
        address: r.station.address,
        region: r.station.region,
        postcode: r.station.postcode,
        latitude: Number(r.station.latitude),
        longitude: Number(r.station.longitude),
        fuel_type: fuelType,
        price_cents: r.price_cents,
        price_aud: r.price_cents / 100,
        is_stale: r.is_stale,
        provider_updated_at: r.provider_updated_at,
        cached_at: r.cached_at,
      }));

    return jsonWithCors({ count: rows.length, stations: rows, sync: syncMeta || null });
  } catch (error) {
    console.error('Get live stations error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch live stations', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleGetLiveFilters(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return attachCors(auth.response);

    try { await maybeSync({ force: false }); } catch (e) { console.error(e); }

    const { data, error } = await supabaseAdmin
      .from('fuel_stations')
      .select('region, brand')
      .range(0, 4999);
    if (error) throw error;

    const regions = Array.from(new Set((data || []).map((r) => r.region).filter(Boolean))).sort();
    const brands  = Array.from(new Set((data || []).map((r) => r.brand).filter(Boolean))).sort();
    const fuelTypes = ['ULP91', 'E10', 'U95', 'U98', 'Diesel', 'LPG'];

    return jsonWithCors({ regions, brands, fuel_types: fuelTypes });
  } catch (error) {
    console.error('Get live filters error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch filters', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handlePostLiveSync(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return attachCors(auth.response);

    const meta = await maybeSync({ force: true });
    return jsonWithCors({ ok: true, sync: meta || null });
  } catch (error) {
    console.error('Manual sync error:', error);
    return jsonWithCors(
      { ok: false, error: 'Sync failed', message: error?.message },
      { status: 500 }
    );
  }
}

export async function handleGetLiveStatus(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) return attachCors(auth.response);

    const { data } = await supabaseAdmin
      .from('fuel_price_sync_meta')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();
    return jsonWithCors(data || {});
  } catch (error) {
    console.error('Get live status error:', error);
    return jsonWithCors(
      { error: 'Failed to fetch sync status', message: error?.message },
      { status: 500 }
    );
  }
}
