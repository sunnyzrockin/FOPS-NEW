-- =====================================================
-- FOPS — Shift Report custom field persistence
-- =====================================================
-- Until now, operator-defined "extra" fields on the shift report (e.g.
-- PARKRIDGE's ACCOUNT, BANKING, Fuel Cards, etc.) would silently fail to
-- save because the backend tried to insert them as columns on the
-- shift_reports table. PostgREST returned errors like:
--   Could not find the 'account' column of 'shift_reports' in the schema cache
--
-- Fix: add a JSONB `custom_values` column. Any form key that doesn't
-- correspond to a real shift_reports column now lands here, keyed by the
-- field's `key` from site_field_configs. The /api/reports POST handler
-- splits known from unknown keys, and GET /api/reports re-spreads the
-- JSONB into the response so the operator/owner UI sees a flat object.
--
-- Apply via Supabase SQL Editor → Run. Idempotent.
-- =====================================================

ALTER TABLE public.shift_reports
  ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.shift_reports.custom_values IS
  'Per-shift values for operator-defined custom fields (category=sales) that '
  'aren''t hard-coded as columns on this table. Keyed by site_field_configs.key. '
  'Example: { "account": 145.50, "banking": 3300.00, "fuel_cards": 1800.00 }.';

CREATE INDEX IF NOT EXISTS shift_reports_custom_values_gin_idx
  ON public.shift_reports USING gin (custom_values);

DO $$
DECLARE
  total INT;
BEGIN
  SELECT count(*) INTO total FROM public.shift_reports;
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Shift Report custom_values migration complete.';
  RAISE NOTICE '  shift_reports.custom_values  -> added (default ''{}'')';
  RAISE NOTICE '  existing rows unaffected     : % rows', total;
  RAISE NOTICE '==========================================';
END $$;
