-- =====================================================
-- FOPS — Custom Fuel Tank Dip Fields (Phase 3 extension)
-- =====================================================
-- Lets the operator add extra fuel grades (E10, U95, U98, LPG, AdBlue, ...)
-- to a site's shift report. Each custom grade gets a tank-level input and
-- an optional delivery input on the staff form.
--
-- Two changes, both backwards-compatible:
--   1. site_field_configs.category — splits fields into 'sales' (default,
--      existing behaviour) and 'dip' (new tank-grade fields).
--   2. dip_readings.custom_values — JSONB blob keyed by the field's `key`
--      and shaped { [key]: { level: number, delivery: number } }.
--
-- The existing ulp_litres / diesel_litres / premium_litres columns stay
-- intact and continue to power the dashboards. Custom grades are purely
-- additive.
--
-- Apply via Supabase SQL Editor → Run. Idempotent.
-- =====================================================

-- 1) Tag every existing field_config row + every new one with a category.
ALTER TABLE public.site_field_configs
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sales';

-- Helpful index for the staff form's per-category fetch.
CREATE INDEX IF NOT EXISTS site_field_configs_site_category_idx
  ON public.site_field_configs (site_id, category);

-- Hard-narrow the allowed values so typos don't silently land in DB.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'site_field_configs_category_chk'
  ) THEN
    ALTER TABLE public.site_field_configs
      ADD CONSTRAINT site_field_configs_category_chk
      CHECK (category IN ('sales', 'dip'));
  END IF;
END $$;

-- 2) Per-reading JSON blob for custom grade levels/deliveries.
ALTER TABLE public.dip_readings
  ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dip_readings.custom_values IS
  'Per-shift level + delivery for custom fuel grades, keyed by site_field_configs.key. '
  'Shape: { "<key>": { "level": number|null, "delivery": number } }.';

-- 3) Confirmation banner.
DO $$
DECLARE
  field_total INT;
  reading_total INT;
BEGIN
  SELECT count(*) INTO field_total FROM public.site_field_configs;
  SELECT count(*) INTO reading_total FROM public.dip_readings;
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Custom tank-dip fields migration complete.';
  RAISE NOTICE '  site_field_configs.category      -> added (default ''sales'')';
  RAISE NOTICE '  dip_readings.custom_values       -> added (default ''{}'')';
  RAISE NOTICE '  existing field_configs tagged    : % rows', field_total;
  RAISE NOTICE '  existing dip_readings untouched  : % rows', reading_total;
  RAISE NOTICE '==========================================';
END $$;
