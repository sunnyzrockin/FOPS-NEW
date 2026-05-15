-- ============================================================================
--  FOPS — Phase 3 (Live Fuel Prices): DB schema for live-pricing intelligence
-- ============================================================================
--  Adds three tables to support real-time competitor / market pricing:
--    1. fuel_prices_live       — current cache, 1 row per (owned-site,
--                                competitor-station, fuel-type). Updated by
--                                the QLD FPM provider every 15 minutes.
--    2. fuel_prices_history    — append-only snapshot, one row per
--                                (owned-site, fuel-type, sampled_at). Used
--                                for the 7-day trend chart.
--    3. fuel_price_sync_meta   — per-site sync bookkeeping: last_fetched,
--                                next_refresh, last_error, retry_count.
--
--  Backfills lat/long for the 5 Sunstate QLD sites so the provider has
--  somewhere to centre the radius search. Idempotent throughout.
--
--  HOW TO RUN
--    Supabase Dashboard → SQL Editor → New query → paste this file → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Backfill site coordinates (idempotent)
-- ----------------------------------------------------------------------------
UPDATE public.sites SET latitude = -27.4705, longitude = 153.0268
  WHERE id = 'site-001' AND (latitude IS NULL OR longitude IS NULL);
UPDATE public.sites SET latitude = -28.0028, longitude = 153.4314
  WHERE id = 'site-002' AND (latitude IS NULL OR longitude IS NULL);
UPDATE public.sites SET latitude = -26.7964, longitude = 153.0966
  WHERE id = 'site-003' AND (latitude IS NULL OR longitude IS NULL);
UPDATE public.sites SET latitude = -27.5598, longitude = 151.9507
  WHERE id = 'site-004' AND (latitude IS NULL OR longitude IS NULL);
UPDATE public.sites SET latitude = -16.8766, longitude = 145.7781
  WHERE id = 'site-005' AND (latitude IS NULL OR longitude IS NULL);

-- ----------------------------------------------------------------------------
-- STEP 2 — fuel_prices_live (current cache, refreshed every ~15 min)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_prices_live (
  id                  TEXT         PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,

  -- The owned site this row is "near". Used for fast lookups by site_id.
  site_id             TEXT         NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  -- Standard fuel type code. We use the canonical QLD FPM short names:
  -- 'ULP91', 'U95', 'U98', 'Diesel', 'E10', 'LPG'. Extensible.
  fuel_type           TEXT         NOT NULL,

  -- Competitor / market station details. station_id is the upstream
  -- provider's site ID (QLD FPM uses an integer; we store as TEXT for
  -- portability).
  station_id          TEXT         NOT NULL,
  station_name        TEXT,
  station_brand       TEXT,
  station_address     TEXT,
  station_latitude    NUMERIC(10,7),
  station_longitude   NUMERIC(10,7),

  -- Distance in km from the owned site (computed by the provider service).
  distance_km         NUMERIC(8,3),

  -- Price in cents/L (e.g. 1847 = $1.847). Native unit for QLD FPM.
  price_cents         INT          NOT NULL,
  -- Convenience generated column for dollars-per-litre.
  price_aud           NUMERIC(6,3) GENERATED ALWAYS AS (price_cents::NUMERIC / 100) STORED,

  -- Time the upstream provider reported this price (NOT our cache time).
  provider_updated_at TIMESTAMPTZ,

  -- When we cached this row locally.
  cached_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- True when this row is being served past its TTL (provider was
  -- unreachable on last sync). The provider service flips this on.
  is_stale            BOOLEAN      NOT NULL DEFAULT false,

  -- Which provider produced this row ('qld_fpm', 'nsw_fuelcheck', 'mock').
  provider            TEXT         NOT NULL DEFAULT 'qld_fpm',

  -- Each (site, station, fuel) combo has exactly one current cache row.
  UNIQUE (site_id, station_id, fuel_type)
);

CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_site_fuel
  ON public.fuel_prices_live (site_id, fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_cached_at
  ON public.fuel_prices_live (cached_at DESC);

-- ----------------------------------------------------------------------------
-- STEP 3 — fuel_prices_history (append-only, drives 7-day trend chart)
-- ----------------------------------------------------------------------------
-- We aggregate per (owned-site, fuel-type, sampled_at) so the chart is
-- cheap to render. Three scalars per snapshot:
--   own_price   — the operator's posted price for that site/fuel (from the
--                 existing fuel_price_entries table; can be NULL if unset)
--   market_avg  — arithmetic mean of competitor prices within radius
--   market_low  — cheapest competitor price within radius
CREATE TABLE IF NOT EXISTS public.fuel_prices_history (
  id                  TEXT         PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  site_id             TEXT         NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  fuel_type           TEXT         NOT NULL,
  sampled_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  own_price_cents     INT,
  market_avg_cents    INT,
  market_low_cents    INT,

  -- How many competitor stations contributed to this snapshot.
  station_count       INT          NOT NULL DEFAULT 0,

  provider            TEXT         NOT NULL DEFAULT 'qld_fpm'
);

CREATE INDEX IF NOT EXISTS idx_fuel_prices_history_site_fuel_time
  ON public.fuel_prices_history (site_id, fuel_type, sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_history_sampled_at
  ON public.fuel_prices_history (sampled_at DESC);

-- ----------------------------------------------------------------------------
-- STEP 4 — fuel_price_sync_meta (per-site sync bookkeeping)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_price_sync_meta (
  site_id             TEXT         PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  last_fetched_at     TIMESTAMPTZ,
  next_refresh_at     TIMESTAMPTZ,
  last_status         TEXT         NOT NULL DEFAULT 'never',  -- 'ok' | 'error' | 'stale' | 'never'
  last_error          TEXT,
  retry_count         INT          NOT NULL DEFAULT 0,
  station_count       INT          NOT NULL DEFAULT 0,
  provider            TEXT         NOT NULL DEFAULT 'qld_fpm'
);

-- ----------------------------------------------------------------------------
-- STEP 5 — RLS DISABLED (match existing operational tables; API enforces)
-- ----------------------------------------------------------------------------
ALTER TABLE public.fuel_prices_live      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_prices_history   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_sync_meta  DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STEP 6 — Verify
-- ----------------------------------------------------------------------------
SELECT id, name, latitude, longitude
  FROM public.sites
 WHERE id IN ('site-001','site-002','site-003','site-004','site-005')
 ORDER BY id;

SELECT table_name, COUNT(*) AS column_count
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('fuel_prices_live', 'fuel_prices_history', 'fuel_price_sync_meta')
 GROUP BY table_name
 ORDER BY table_name;

-- Expected:
--   site-001..site-005 each with a populated latitude/longitude
--   fuel_prices_live      → ~17 columns
--   fuel_prices_history   → ~9 columns
--   fuel_price_sync_meta  → ~8 columns
