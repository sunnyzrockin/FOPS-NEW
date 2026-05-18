-- ============================================================================
--  FOPS — Phase 3 (Banking ↔ Form Fields wiring): show_in_banking flag
-- ============================================================================
--  Adds a `show_in_banking` column to site_field_configs so operators can
--  explicitly choose which fields appear in the Banking Formula Builder's
--  "Available Fields" palette.
--
--  Default rule:
--    * Auto-seeded CORE fields (fuel_sales, shop_sales, eftpos, motorpass,
--      cash, accounts, beverages, hot_food, drive_offs, dips, total_litres)
--      start HIDDEN from banking. Operators turn them on per site if they
--      want them in a formula.
--    * Custom fields the operator manually creates are SHOWN by default.
--
--  HOW TO RUN
--    Supabase SQL Editor → paste → Run. Idempotent.
-- ============================================================================

-- STEP 1 — Add the column with sensible default
ALTER TABLE public.site_field_configs
  ADD COLUMN IF NOT EXISTS show_in_banking BOOLEAN NOT NULL DEFAULT true;

-- STEP 2 — Backfill: core fields default to FALSE so existing sites get the
-- clean "only my custom fields show in banking" UX immediately.
UPDATE public.site_field_configs
   SET show_in_banking = false
 WHERE is_core = true
   AND show_in_banking = true;

-- STEP 3 — Verify
SELECT site_id,
       COUNT(*) FILTER (WHERE show_in_banking) AS banking_visible,
       COUNT(*) FILTER (WHERE NOT show_in_banking) AS banking_hidden,
       COUNT(*) AS total
  FROM public.site_field_configs
 GROUP BY site_id
 ORDER BY site_id
 LIMIT 20;
