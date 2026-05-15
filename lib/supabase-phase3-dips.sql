-- ============================================================================
--  FOPS — Phase 3: Fuel Inventory Tracking (Dip Readings)
-- ============================================================================
--  Adds a new table `dip_readings` that operators use to log tank levels
--  (in litres) and any deliveries received between readings, ~2x per day.
--
--  Consumption formula (computed in API, NOT stored):
--     consumption = previous_reading - current_reading + deliveries_received
--
--  All three fuel-grade columns (ULP / Diesel / Premium) are nullable so
--  sites that don't sell a particular grade can omit it. Additional
--  grades (e.g. E10, AdBlue) can be added later as new columns.
--
--  IMPORTANT: sites.id and users.id are TEXT in this database (not UUID),
--  so we match that. The id of dip_readings is a TEXT column carrying a
--  v4 UUID string (same pattern as other tables — see supabase-schema.sql).
--
--  HOW TO RUN
--    Supabase Dashboard → SQL Editor → New query → paste this whole file →
--    Run. Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Create the dip_readings table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dip_readings (
  id                         TEXT         PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  site_id                    TEXT         NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  operator_user_id           TEXT         NOT NULL REFERENCES public.users(id),

  -- Free-text label for when the reading was taken (e.g. "Morning", "PM",
  -- "After delivery"). User asked for free-text not strict AM/PM.
  reading_label              TEXT,

  -- The wall-clock moment of the reading. Defaults to now() on insert if
  -- not provided by the client.
  reading_time               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Current tank levels (litres). Nullable per fuel grade so sites can
  -- skip grades they don't sell.
  ulp_litres                 NUMERIC(10,2),
  diesel_litres              NUMERIC(10,2),
  premium_litres             NUMERIC(10,2),

  -- Deliveries received since the previous reading (litres). Defaults to
  -- zero so the consumption math is well-defined when no delivery happened.
  deliveries_ulp_litres      NUMERIC(10,2) NOT NULL DEFAULT 0,
  deliveries_diesel_litres   NUMERIC(10,2) NOT NULL DEFAULT 0,
  deliveries_premium_litres  NUMERIC(10,2) NOT NULL DEFAULT 0,

  notes                      TEXT,

  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- STEP 2 — Indexes for trend queries & site-scoped lookups
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dip_readings_site_time
  ON public.dip_readings (site_id, reading_time DESC);

CREATE INDEX IF NOT EXISTS idx_dip_readings_operator
  ON public.dip_readings (operator_user_id);

CREATE INDEX IF NOT EXISTS idx_dip_readings_created_at
  ON public.dip_readings (created_at DESC);

-- ----------------------------------------------------------------------------
-- STEP 3 — updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_dip_readings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dip_readings_updated_at ON public.dip_readings;
CREATE TRIGGER trg_dip_readings_updated_at
  BEFORE UPDATE ON public.dip_readings
  FOR EACH ROW EXECUTE FUNCTION public.set_dip_readings_updated_at();

-- ----------------------------------------------------------------------------
-- STEP 4 — RLS DISABLED (matches existing app pattern; authz is in the API)
-- ----------------------------------------------------------------------------
-- The rest of the operational tables in this DB run with RLS disabled and
-- enforce role/site access inside the Next.js API layer using verifyAuth().
-- We follow the same pattern here so we don't reintroduce the infinite-
-- recursion bug that was deferred in Phase 2.
ALTER TABLE public.dip_readings DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- STEP 5 — Verify
-- ----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'dip_readings'
 ORDER BY ordinal_position;

-- Expected 14 rows: id, site_id, operator_user_id, reading_label,
-- reading_time, ulp_litres, diesel_litres, premium_litres,
-- deliveries_ulp_litres, deliveries_diesel_litres,
-- deliveries_premium_litres, notes, created_at, updated_at.
