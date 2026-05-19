// Sync service: orchestrates pulling the current snapshot from the active
// provider, upserting it into Supabase, and recording bookkeeping in
// fuel_price_sync_meta.
//
// Lazy refresh strategy (Phase 3 Q5 = A):
//   * Every read-side endpoint calls maybeSync() first.
//   * If the cache is fresher than CACHE_TTL_MS, do nothing.
//   * If older, sync. On provider error, mark the cache row is_stale=true
//     and still serve the stale data so the UI degrades gracefully.
//
// One sync flight per process at a time (`_inFlight`) so concurrent owner
// page loads don't double-pull.

import { supabaseAdmin } from '@/lib/supabase';
import { getProvider, activeProviderLabel } from './providers';

const CACHE_TTL_MS = parseInt(process.env.FUEL_CACHE_TTL_SECONDS || '900', 10) * 1000;

let _inFlight = null;

async function _getMeta() {
  const { data } = await supabaseAdmin
    .from('fuel_price_sync_meta')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();
  return data || null;
}

function _isFresh(meta) {
  if (!meta || !meta.last_fetched_at || meta.last_status !== 'ok') return false;
  const age = Date.now() - new Date(meta.last_fetched_at).getTime();
  return age < CACHE_TTL_MS;
}

async function _markStaleAndRecordError(errMsg) {
  await supabaseAdmin
    .from('fuel_prices_live')
    .update({ is_stale: true })
    .eq('is_stale', false);
  await supabaseAdmin
    .from('fuel_price_sync_meta')
    .upsert({
      id: 'global',
      provider: activeProviderLabel(),
      last_status: 'error',
      last_error: String(errMsg).slice(0, 500),
      retry_count: 0,  // could increment; left simple for MVP
    });
}

async function _doSync() {
  const provider = getProvider();
  const snapshot = await provider.fetchSnapshot();
  const { stations, prices, provider_label } = snapshot;

  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error('Provider returned 0 stations');
  }

  // 1) Upsert stations master.
  // Supabase has a soft default batch limit ~1000 rows per upsert; QLD has
  // ~1700 stations so we chunk to be safe.
  const STATION_CHUNK = 500;
  for (let i = 0; i < stations.length; i += STATION_CHUNK) {
    const chunk = stations.slice(i, i + STATION_CHUNK).map((s) => ({
      ...s,
      provider: provider_label,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from('fuel_stations')
      .upsert(chunk, { onConflict: 'station_id' });
    if (error) throw new Error(`Upsert fuel_stations failed: ${error.message}`);
  }

  // 2) Upsert live prices. Same chunking discipline.
  const PRICE_CHUNK = 1000;
  const priceRows = prices.map((p) => ({
    station_id: p.station_id,
    fuel_type: p.fuel_type,
    price_cents: p.price_cents,
    provider_updated_at: p.provider_updated_at,
    cached_at: new Date().toISOString(),
    is_stale: false,
    provider: provider_label,
  }));
  // De-dupe: providers (esp. QLD FPM) can return multiple FuelId codes
  // that we collapse into one canonical type (e.g. FuelId 7+8 both → Diesel).
  // Postgres upsert with onConflict='station_id,fuel_type' rejects a batch
  // that contains the same conflict key twice, so collapse here keeping
  // the row with the most recent provider_updated_at.
  const dedupKey = (r) => `${r.station_id}::${r.fuel_type}`;
  const dedupMap = new Map();
  for (const r of priceRows) {
    const k = dedupKey(r);
    const prev = dedupMap.get(k);
    if (!prev) { dedupMap.set(k, r); continue; }
    const prevT = new Date(prev.provider_updated_at || 0).getTime();
    const curT = new Date(r.provider_updated_at || 0).getTime();
    if (curT >= prevT) dedupMap.set(k, r);
  }
  const dedupedPriceRows = Array.from(dedupMap.values());

  for (let i = 0; i < dedupedPriceRows.length; i += PRICE_CHUNK) {
    const chunk = dedupedPriceRows.slice(i, i + PRICE_CHUNK);
    const { error } = await supabaseAdmin
      .from('fuel_prices_live')
      .upsert(chunk, { onConflict: 'station_id,fuel_type' });
    if (error) throw new Error(`Upsert fuel_prices_live failed: ${error.message}`);
  }

  // 3) Bookkeeping.
  const next = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  await supabaseAdmin
    .from('fuel_price_sync_meta')
    .upsert({
      id: 'global',
      provider: provider_label,
      last_fetched_at: new Date().toISOString(),
      next_refresh_at: next,
      last_status: 'ok',
      last_error: null,
      retry_count: 0,
      station_count: stations.length,
      price_count: prices.length,
    });

  return { stations: stations.length, prices: prices.length, provider: provider_label };
}

/**
 * maybeSync({ force }): triggers a sync if cache is older than TTL.
 * Returns the latest sync_meta row.
 */
export async function maybeSync({ force = false } = {}) {
  if (!supabaseAdmin) throw new Error('Supabase admin client unavailable');

  const meta = await _getMeta();
  if (!force && _isFresh(meta)) {
    return meta;
  }

  if (_inFlight) {
    // Already syncing in this process — wait on the existing promise.
    await _inFlight.catch(() => {});
    return _getMeta();
  }

  _inFlight = (async () => {
    try {
      await _doSync();
    } catch (err) {
      console.error('[fuel-pricing] sync failed:', err);
      await _markStaleAndRecordError(err.message || String(err));
    } finally {
      _inFlight = null;
    }
  })();
  await _inFlight;
  return _getMeta();
}
