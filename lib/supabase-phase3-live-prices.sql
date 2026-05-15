-- ============================================================================
--  FOPS — Phase 3 (Live Fuel Prices, v2): QLD-wide live pricing schema
-- ============================================================================
--  v2 simplifications vs original plan:
--    * No per-site comparison card → no need for site-keyed cache
--    * No 7-day history chart      → no fuel_prices_history table
--    * Single map view of ALL QLD stations with live prices + filters
--
--  Tables:
--    1. fuel_stations           — master metadata for every QLD station
--                                 we've ever seen (siteId, brand, address,
--                                 lat/long, region). Upserted on sync.
--    2. fuel_prices_live        — 1 row per (station_id, fuel_type). Updated
--                                 on every sync. The map reads from this.
--    3. fuel_price_sync_meta    — single global bookkeeping row tracking
--                                 the last successful sync timestamp,
--                                 status, station/price counts.
--
--  Lat/long backfill for the 5 Sunstate sites is kept (harmless,
--  idempotent) in case future work re-introduces an owned-site comparison.
--
--  HOW TO RUN
--    Supabase Dashboard → SQL Editor → New query → paste this file → Run.
--    "Run without RLS" — same pattern as the rest of the operational tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Backfill site coordinates (idempotent; safe to re-run)
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
-- STEP 2 — fuel_stations: master metadata for QLD stations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_stations (
  -- The upstream provider's station ID. QLD FPM uses int8; we store as
  -- TEXT for portability across providers (NSW, NSW, mock, etc.).
  station_id   TEXT         PRIMARY KEY,
  provider     TEXT         NOT NULL DEFAULT 'qld_fpm',

  name         TEXT         NOT NULL,
  brand        TEXT,
  address      TEXT,
  region       TEXT,             -- "Brisbane", "Gold Coast", "Cairns", ...
  postcode     TEXT,

  latitude     NUMERIC(10,7) NOT NULL,
  longitude    NUMERIC(10,7) NOT NULL,

  is_open      BOOLEAN      NOT NULL DEFAULT true,

  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_stations_region ON public.fuel_stations (region);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_brand  ON public.fuel_stations (brand);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_geo    ON public.fuel_stations (latitude, longitude);

-- ----------------------------------------------------------------------------
-- STEP 3 — fuel_prices_live: current price per (station, fuel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_prices_live (
  id                  TEXT         PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,

  station_id          TEXT         NOT NULL REFERENCES public.fuel_stations(station_id) ON DELETE CASCADE,
  fuel_type           TEXT         NOT NULL,  -- 'ULP91','U95','U98','Diesel','E10','LPG'

  -- Price in cents/L. 1847 = $1.847.
  price_cents         INT          NOT NULL,
  price_aud           NUMERIC(6,3) GENERATED ALWAYS AS (price_cents::NUMERIC / 100) STORED,

  provider_updated_at TIMESTAMPTZ,
  cached_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_stale            BOOLEAN      NOT NULL DEFAULT false,
  provider            TEXT         NOT NULL DEFAULT 'qld_fpm',

  UNIQUE (station_id, fuel_type)
);

CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_fuel       ON public.fuel_prices_live (fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_cached_at  ON public.fuel_prices_live (cached_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_station    ON public.fuel_prices_live (station_id);

-- ----------------------------------------------------------------------------
-- STEP 4 — fuel_price_sync_meta: single-row global bookkeeping
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_price_sync_meta (
  id                 TEXT         PRIMARY KEY DEFAULT 'global',
  provider           TEXT         NOT NULL DEFAULT 'qld_fpm',
  last_fetched_at    TIMESTAMPTZ,
  next_refresh_at    TIMESTAMPTZ,
  last_status        TEXT         NOT NULL DEFAULT 'never',  -- 'ok'|'error'|'stale'|'never'
  last_error         TEXT,
  retry_count        INT          NOT NULL DEFAULT 0,
  station_count      INT          NOT NULL DEFAULT 0,
  price_count        INT          NOT NULL DEFAULT 0
);

-- Seed the single global row so upsert-by-id logic just works.
INSERT INTO public.fuel_price_sync_meta (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- STEP 5 — RLS DISABLED (match existing operational tables; API enforces)
-- ----------------------------------------------------------------------------
ALTER TABLE public.fuel_stations         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_prices_live      DISABLE ROW LEVEL SECURITY;
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
   AND table_name IN ('fuel_stations', 'fuel_prices_live', 'fuel_price_sync_meta')
 GROUP BY table_name
 ORDER BY table_name;

SELECT * FROM public.fuel_price_sync_meta;

-- Expected:
--   site-001..site-005 all with populated lat/long
--   fuel_stations         → ~12 columns
--   fuel_prices_live      → ~9 columns
--   fuel_price_sync_meta  → ~9 columns
--   fuel_price_sync_meta has exactly 1 row with id='global', last_status='never'
