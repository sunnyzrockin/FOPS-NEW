-- ============================================================================
--  FOPS — Phase 1: Form Fields & Banking Formulas migration
-- ============================================================================
--  Adds two columns to site_field_configs to match the new spec:
--    1. visibility (text enum: 'all' | 'staff_only' | 'owner_only')
--         Controls who sees the field on the shift report form.
--           all          → everyone sees the field (default)
--           staff_only   → only staff sees it (owners/operators don't)
--           owner_only   → only owner/operator sees it; staff can't (e.g. Cash)
--    2. is_mandatory (boolean)
--         Whether the field is required when submitting a shift report.
--         Backfills from is_core for legacy rows.
--
--  Also adds a partial sanity-check CHECK constraint so junk values can't
--  be inserted.
--
--  HOW TO RUN
--    Supabase Dashboard → SQL Editor → New query → paste this whole file →
--    Run. Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Add `visibility` column with check constraint
-- ----------------------------------------------------------------------------
ALTER TABLE public.site_field_configs
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'all';

-- Add the CHECK constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_field_configs_visibility_check'
  ) THEN
    ALTER TABLE public.site_field_configs
      ADD CONSTRAINT site_field_configs_visibility_check
      CHECK (visibility IN ('all', 'staff_only', 'owner_only'));
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- STEP 2 — Add `is_mandatory` column, backfill from is_core
-- ----------------------------------------------------------------------------
ALTER TABLE public.site_field_configs
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT false;

-- Backfill is_mandatory from legacy is_core column (one-time)
UPDATE public.site_field_configs
   SET is_mandatory = COALESCE(is_core, false)
 WHERE is_mandatory = false
   AND COALESCE(is_core, false) = true;


-- ----------------------------------------------------------------------------
-- STEP 3 — Verify columns are present
-- ----------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'site_field_configs'
  AND column_name IN ('visibility', 'is_mandatory')
ORDER BY column_name;

-- Expected: 2 rows
--   is_mandatory | boolean | false  | NO
--   visibility   | text    | 'all'  | NO


-- ----------------------------------------------------------------------------
-- STEP 4 — (Optional) Spot-check existing fields
-- ----------------------------------------------------------------------------
SELECT id, site_id, key, label, visibility, is_mandatory, is_core, is_enabled
FROM public.site_field_configs
ORDER BY site_id, display_order
LIMIT 50;
