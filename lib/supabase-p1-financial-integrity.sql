-- =====================================================================
-- P1 — Financial Integrity — schema additions
--
-- Additive only. No drops, no breaking changes. Safe to re-run.
-- After applying, /app/lib/financials.js becomes the single source of
-- truth and these columns mirror its outputs for fast querying.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Per-row reconciliation flag + reason
--    Set by reports.js on insert/update. Read by the Data Integrity
--    owner view.
-- ---------------------------------------------------------------------
ALTER TABLE shift_reports
  ADD COLUMN IF NOT EXISTS reconciles BOOLEAN DEFAULT TRUE;

ALTER TABLE shift_reports
  ADD COLUMN IF NOT EXISTS reconciliation_reason TEXT;

-- ---------------------------------------------------------------------
-- 2) Audit trail — original values the submitter typed in.
--    Per user request: "preserve the original entered values so we can
--    see what changed."
--
--    Shape: { fuel_sales, shop_sales, total_sales, total_revenue,
--             total_litres, submitted_at }
-- ---------------------------------------------------------------------
ALTER TABLE shift_reports
  ADD COLUMN IF NOT EXISTS submitted_totals JSONB;

-- ---------------------------------------------------------------------
-- 3) Per-site tolerance override.
--    NULL → use DEFAULT_TOLERANCE_PCT (0.01 = 1%) from lib/financials.js
--    Otherwise → fraction (e.g. 0.025 for 2.5%).
-- ---------------------------------------------------------------------
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS reconcile_tolerance_pct NUMERIC(5,4);

COMMENT ON COLUMN sites.reconcile_tolerance_pct IS
  'Per-site reconciliation tolerance as a fraction (e.g. 0.01 = 1%). NULL means use the global default in lib/financials.js.';

-- ---------------------------------------------------------------------
-- 4) Useful partial index — list flagged reports fast.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shift_reports_unreconciled
  ON shift_reports (site_id, date DESC)
  WHERE reconciles = FALSE;

-- ---------------------------------------------------------------------
-- 5) Verification (run after migration)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'P1 financial-integrity schema applied:';
  RAISE NOTICE '  shift_reports.reconciles            -> %', (
    SELECT data_type FROM information_schema.columns
    WHERE table_name='shift_reports' AND column_name='reconciles'
  );
  RAISE NOTICE '  shift_reports.reconciliation_reason -> %', (
    SELECT data_type FROM information_schema.columns
    WHERE table_name='shift_reports' AND column_name='reconciliation_reason'
  );
  RAISE NOTICE '  shift_reports.submitted_totals      -> %', (
    SELECT data_type FROM information_schema.columns
    WHERE table_name='shift_reports' AND column_name='submitted_totals'
  );
  RAISE NOTICE '  sites.reconcile_tolerance_pct       -> %', (
    SELECT data_type FROM information_schema.columns
    WHERE table_name='sites' AND column_name='reconcile_tolerance_pct'
  );
END $$;
