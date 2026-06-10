-- =====================================================================
-- P2b \u2014 Row Level Security for fuel_deliveries (the cost book)
--
-- Replaces the earlier "RLS DISABLED" pragma. Per owner sign-off:
-- "The cost book is the most sensitive table \u2014 enforce RLS even if the
-- rest of the app relies on app-layer scoping."
--
-- This file is INDEPENDENT of and runs AFTER supabase-p2b-fuel-margin.sql.
-- Safe to re-run (idempotent: drop-policy-if-exists, create policy).
-- =====================================================================

-- ---------------------------------------------------------------------
-- fuel_deliveries \u2014 tenant-scoped RLS
--
--   Owner          \u2192 SELECT/INSERT/UPDATE/DELETE on sites they own
--                    (sites.owner_id linked through users.auth_user_id).
--   Operator       \u2192 SELECT/INSERT on sites they are explicitly assigned
--                    to via operator_site_assignments. NO update/delete \u2014
--                    they record deliveries, they can't quietly fix costs.
--   Staff          \u2192 No access (RLS denies; only an explicit policy grants).
--   Service role   \u2192 Bypasses RLS (used by Stripe webhook & admin paths).
-- ---------------------------------------------------------------------
ALTER TABLE fuel_deliveries ENABLE ROW LEVEL SECURITY;

-- ---- Owner: full access on owned sites --------------------------------
DROP POLICY IF EXISTS fd_owner_select ON fuel_deliveries;
CREATE POLICY fd_owner_select ON fuel_deliveries
  FOR SELECT
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      JOIN users u ON u.id = s.owner_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fd_owner_insert ON fuel_deliveries;
CREATE POLICY fd_owner_insert ON fuel_deliveries
  FOR INSERT
  WITH CHECK (
    site_id IN (
      SELECT s.id FROM sites s
      JOIN users u ON u.id = s.owner_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fd_owner_update ON fuel_deliveries;
CREATE POLICY fd_owner_update ON fuel_deliveries
  FOR UPDATE
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      JOIN users u ON u.id = s.owner_id
      WHERE u.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    site_id IN (
      SELECT s.id FROM sites s
      JOIN users u ON u.id = s.owner_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fd_owner_delete ON fuel_deliveries;
CREATE POLICY fd_owner_delete ON fuel_deliveries
  FOR DELETE
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      JOIN users u ON u.id = s.owner_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- ---- Operator: read + insert on assigned sites only -------------------
DROP POLICY IF EXISTS fd_operator_select ON fuel_deliveries;
CREATE POLICY fd_operator_select ON fuel_deliveries
  FOR SELECT
  USING (
    site_id IN (
      SELECT osa.site_id
      FROM operator_site_assignments osa
      JOIN users u ON u.id = osa.operator_user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS fd_operator_insert ON fuel_deliveries;
CREATE POLICY fd_operator_insert ON fuel_deliveries
  FOR INSERT
  WITH CHECK (
    site_id IN (
      SELECT osa.site_id
      FROM operator_site_assignments osa
      JOIN users u ON u.id = osa.operator_user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Deliberately NO operator UPDATE or DELETE policy. Operators record, owners correct.

-- ---------------------------------------------------------------------
-- fuel_grades \u2014 global lookup; readable by any authenticated user,
-- writable only by owners (any owner can add a new grade for everyone).
-- This is a shared dictionary, not per-tenant, so this is by design.
-- ---------------------------------------------------------------------
ALTER TABLE fuel_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fg_read_authed ON fuel_grades;
CREATE POLICY fg_read_authed ON fuel_grades
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS fg_owner_write_insert ON fuel_grades;
CREATE POLICY fg_owner_write_insert ON fuel_grades
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner')
  );

DROP POLICY IF EXISTS fg_owner_write_update ON fuel_grades;
CREATE POLICY fg_owner_write_update ON fuel_grades
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'owner')
  );

-- ---------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'P2b RLS applied:';
  RAISE NOTICE '  fuel_deliveries.rls_enabled = %', (
    SELECT relrowsecurity FROM pg_class WHERE relname = 'fuel_deliveries'
  );
  RAISE NOTICE '  fuel_grades.rls_enabled     = %', (
    SELECT relrowsecurity FROM pg_class WHERE relname = 'fuel_grades'
  );
  RAISE NOTICE '  fuel_deliveries policies    = %', (
    SELECT count(*) FROM pg_policies WHERE tablename = 'fuel_deliveries'
  );
  RAISE NOTICE '  fuel_grades policies        = %', (
    SELECT count(*) FROM pg_policies WHERE tablename = 'fuel_grades'
  );
END $$;
