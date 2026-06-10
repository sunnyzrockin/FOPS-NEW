-- =====================================================================
-- P2b — Fuel Margin per Litre
--
-- Additive only. No drops, no breaking changes. Safe to re-run.
--
-- Why this matters: the existing `fuel_price_entries` table captures the
-- SELL price per (site, date, grade), but the system has never captured
-- the COST of fuel bought in. Without cost, margin per litre is undefined
-- and the dashboards cannot show "are we making money on fuel".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fuel grade lookup table (extensible per owner decision 2).
--    Replaces the frozen CHECK constraint on fuel_price_entries with a
--    soft lookup. New grades are added by INSERT; we don't drop the
--    existing CHECK because that would be a breaking migration.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_grades (
  code         TEXT PRIMARY KEY,           -- e.g. 'ULP', 'Diesel', 'AdBlue'
  label        TEXT NOT NULL,              -- human label e.g. 'Unleaded 91'
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INT NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 5 grades that fuel_price_entries already allows.
INSERT INTO fuel_grades (code, label, sort_order) VALUES
  ('ULP',     'Unleaded 91',  10),
  ('E10',     'E10',          15),
  ('Premium', 'Premium 95/98', 20),
  ('Diesel',  'Diesel',       30),
  ('LPG',     'LPG / Autogas', 40)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) fuel_deliveries — SOURCE OF TRUTH for fuel bought IN, WITH COST.
--    Operators record deliveries here so the margin engine can compute
--    cost_cpl via moving weighted-average.
--
--    Either `total_cost_dollars` or `unit_cost_cpl` may be provided; the
--    API derives the missing one. Both stored ex-GST per owner sign-off.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_deliveries (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  grade                 TEXT NOT NULL REFERENCES fuel_grades(code),
  delivered_at          DATE NOT NULL,
  litres                NUMERIC(12,2) NOT NULL CHECK (litres > 0),
  total_cost_dollars    NUMERIC(12,2),     -- ex-GST
  unit_cost_cpl         NUMERIC(10,4) NOT NULL CHECK (unit_cost_cpl >= 0),
  supplier              TEXT,
  invoice_ref           TEXT,
  notes                 TEXT,
  created_by_user_id    TEXT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_deliveries_site_date
  ON fuel_deliveries (site_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_deliveries_site_grade_date
  ON fuel_deliveries (site_id, grade, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_deliveries_created_at
  ON fuel_deliveries (created_at DESC);

-- ---------------------------------------------------------------------
-- 3) updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_fuel_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_deliveries_updated_at ON fuel_deliveries;
CREATE TRIGGER trg_fuel_deliveries_updated_at
  BEFORE UPDATE ON fuel_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_fuel_deliveries_updated_at();

-- ---------------------------------------------------------------------
-- 4) Per-site margin thresholds (per owner decision 5 — configurable).
--    NULL means use the global default (8c healthy / 3c amber).
-- ---------------------------------------------------------------------
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS margin_healthy_cpl NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS margin_amber_cpl   NUMERIC(6,2);

COMMENT ON COLUMN sites.margin_healthy_cpl IS
  'Per-site healthy fuel-margin threshold (cents per litre). NULL = use lib/margin.js DEFAULT_HEALTHY_CPL (8.0).';
COMMENT ON COLUMN sites.margin_amber_cpl IS
  'Per-site amber fuel-margin threshold (cents per litre). NULL = use lib/margin.js DEFAULT_AMBER_CPL (3.0).';

-- ---------------------------------------------------------------------
-- 5) RLS \u2014 see supabase-p2b-fuel-margin-rls.sql for tenant-scoped policies.
--    fuel_deliveries is a sensitive cost book and gets full RLS in that file.
--    NOTE: the original draft DISABLED RLS here; that decision was reversed
--    on owner review and is now handled in the companion -rls.sql file.
-- ---------------------------------------------------------------------
