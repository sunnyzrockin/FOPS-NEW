-- =====================================================================
-- P2a — Wet-stock Reconciliation
--
-- Additive only. No drops, no breaking changes. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Per-site wet-stock tolerance.
--    NULL  → use default 0.005 (0.5%) from lib/api/handlers/wetstock.js
--    Other → fraction (e.g. 0.01 for 1% per-site tolerance).
-- ---------------------------------------------------------------------
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS wetstock_tolerance_pct NUMERIC(6,4);

COMMENT ON COLUMN sites.wetstock_tolerance_pct IS
  'Wet-stock reconciliation tolerance as a fraction (e.g. 0.005 = 0.5%). '
  'NULL means use the global default in lib/api/handlers/wetstock.js. '
  'Variance below this is OK; between 1x and 3x is "watch"; above 3x is "alert".';
