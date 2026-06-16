-- ============================================================================
-- Wet-stock Tier 1 — Daily Tank Reconciliation
--
-- Adds two new tables to enable per-tank, per-day fuel-loss detection:
--
--   1. `tanks`                — tank registry per site (grade, capacity,
--                                tolerance). Operator-managed.
--   2. `tank_reconciliation`  — one snapshot row per tank per day produced
--                                by the reconciliation engine on shift submit.
--
-- This migration is PURELY ADDITIVE. Nothing existing is dropped, renamed,
-- or altered. Apply it in Supabase SQL editor.
--
-- After applying, verify with the queries at the bottom.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tanks table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tanks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  grade           TEXT NOT NULL,                    -- e.g. "ULP", "DIESEL", "PRE98"
  capacity_litres NUMERIC(10,2) NOT NULL CHECK (capacity_litres > 0),
  tolerance_pct   NUMERIC(5,3)  NOT NULL DEFAULT 0.5
                                  CHECK (tolerance_pct >= 0 AND tolerance_pct <= 10),
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tanks_site_grade_unique UNIQUE (site_id, grade)
);

CREATE INDEX IF NOT EXISTS idx_tanks_site_active
  ON public.tanks(site_id, active);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.tanks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tanks_updated_at ON public.tanks;
CREATE TRIGGER trg_tanks_updated_at
  BEFORE UPDATE ON public.tanks
  FOR EACH ROW EXECUTE FUNCTION public.tanks_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Tank reconciliation snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tank_reconciliation (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date               DATE NOT NULL,
  tank_id            UUID NOT NULL REFERENCES public.tanks(id) ON DELETE CASCADE,
  site_id            UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  -- Inputs (litres)
  opening_litres     NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_litres    NUMERIC(10,2) NOT NULL DEFAULT 0,
  sales_litres       NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_closing     NUMERIC(10,2),                          -- dip reading

  -- Computed
  expected_closing   NUMERIC(10,2),                          -- opening + delivery - sales
  variance_litres    NUMERIC(10,2),                          -- actual - expected
  variance_pct       NUMERIC(8,4),                           -- variance / NULLIF(sales,0) * 100

  -- Classification
  status             TEXT NOT NULL DEFAULT 'green'
                                  CHECK (status IN ('green', 'amber', 'red', 'no_data', 'broken_chain')),
  chain_broken       BOOLEAN NOT NULL DEFAULT false,         -- true when prior-day closing missing
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tank_reconciliation_tank_date_unique UNIQUE (tank_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tank_reconciliation_site_date
  ON public.tank_reconciliation(site_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tank_reconciliation_status
  ON public.tank_reconciliation(status)
  WHERE status IN ('red', 'amber');

DROP TRIGGER IF EXISTS trg_tank_reconciliation_updated_at ON public.tank_reconciliation;
CREATE TRIGGER trg_tank_reconciliation_updated_at
  BEFORE UPDATE ON public.tank_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.tanks_set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Verification
-- ----------------------------------------------------------------------------
-- Expect: 2 rows. tanks + tank_reconciliation.
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns c
         WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS col_count
  FROM information_schema.tables t
 WHERE t.table_schema = 'public'
   AND t.table_name IN ('tanks', 'tank_reconciliation')
 ORDER BY 1;
