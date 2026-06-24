-- =============================================================================
-- SEC1 — Phases 2–4: re-enable RLS across all 27 business tables
-- =============================================================================
-- DO NOT EXECUTE without owner sign-off, PITR backup pre-sec1-<date>, and
-- a successful staging rehearsal of Phases 1–5 + rollback.
--
-- Prereq: lib/supabase-sec1-helpers.sql applied first.
-- Rollback: lib/supabase-sec1-rls-hardening-rollback.sql (reverse order).
-- Spec: memory/upcoming_prompts/SEC1_rls_hardening.md (revised 2026-06-22).
--
-- IDEMPOTENT: every CREATE POLICY is preceded by a DROP POLICY IF EXISTS,
-- and ENABLE ROW LEVEL SECURITY is a no-op if already on.
-- =============================================================================

-- ─── PHASE 0 — Pre-flight (READ-ONLY informational, no DDL) ──────────────────
-- Capture before you touch anything. Save the outputs to memory/SEC1_runbook.md
-- as proof of what was actually in place at execution time.
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1;
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;
--
--   SELECT proname, pronargs FROM pg_proc
--    WHERE pronamespace='public'::regnamespace AND proname IN
--      ('get_user_id_from_auth','get_operator_site_ids','get_staff_site_ids',
--       'get_user_role_and_id','get_operator_assigned_sites','get_staff_assigned_sites',
--       'auth_user_uuid','auth_user_role','auth_user_site_ids');

-- =============================================================================
-- PHASE A — Drop ALL legacy policies on every in-scope table (Blocker 4)
-- =============================================================================
-- Two-pronged: explicit DROPs for every legacy policy name we can enumerate
-- from the SQL history, then a dynamic catch-all DO block so anything added
-- manually via the Supabase Studio gets cleared too.

-- ── A.1 explicit drops, enumerated from the SQL history ─────────────────────
-- Source: lib/supabase-schema.sql
DROP POLICY IF EXISTS "Users can view themselves"            ON public.users;
DROP POLICY IF EXISTS "Users can update themselves"          ON public.users;
DROP POLICY IF EXISTS "Owners can view their sites"          ON public.sites;
DROP POLICY IF EXISTS "Operators can view assigned sites"    ON public.sites;
DROP POLICY IF EXISTS "Staff can view assigned sites"        ON public.sites;
DROP POLICY IF EXISTS "Staff can view their reports"         ON public.shift_reports;
DROP POLICY IF EXISTS "Staff can create reports"             ON public.shift_reports;
DROP POLICY IF EXISTS "Operators can view site reports"      ON public.shift_reports;
DROP POLICY IF EXISTS "Owners can view all site reports"     ON public.shift_reports;

-- Source: lib/supabase-rls-fix.sql
DROP POLICY IF EXISTS "Owners can view operator assignments"   ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Owners can create operator assignments" ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Owners can delete operator assignments" ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Operators can view own assignments"     ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Operators can view staff assignments"   ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Operators can create staff assignments" ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Operators can delete staff assignments" ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Staff can view own assignments"         ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Owners can view all staff assignments"  ON public.staff_site_assignments;

-- Source: lib/supabase-rls-recursion-fix.sql
DROP POLICY IF EXISTS "Role-based site access"                 ON public.sites;
DROP POLICY IF EXISTS "Operator assignments access"            ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Operator assignments create"            ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Operator assignments delete"            ON public.operator_site_assignments;
DROP POLICY IF EXISTS "Staff assignments access"               ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Staff assignments create"               ON public.staff_site_assignments;
DROP POLICY IF EXISTS "Staff assignments delete"               ON public.staff_site_assignments;

-- Source: lib/supabase-rls-security-definer.sql
DROP POLICY IF EXISTS users_self_read                ON public.users;
DROP POLICY IF EXISTS sites_read                     ON public.sites;
DROP POLICY IF EXISTS op_assign_read                 ON public.operator_site_assignments;
DROP POLICY IF EXISTS staff_assign_read              ON public.staff_site_assignments;
DROP POLICY IF EXISTS field_configs_read             ON public.site_field_configs;
DROP POLICY IF EXISTS shift_reports_read             ON public.shift_reports;
DROP POLICY IF EXISTS banking_formulas_read          ON public.site_banking_formulas;
DROP POLICY IF EXISTS shift_formula_results_read     ON public.shift_formula_results;
DROP POLICY IF EXISTS fuel_price_entries_read        ON public.fuel_price_entries;
DROP POLICY IF EXISTS site_competitors_read          ON public.site_competitors;
DROP POLICY IF EXISTS competitor_fuel_prices_read    ON public.competitor_fuel_prices;
DROP POLICY IF EXISTS dip_readings_read              ON public.dip_readings;
DROP POLICY IF EXISTS fuel_stations_owner_read       ON public.fuel_stations;
DROP POLICY IF EXISTS fuel_prices_live_owner_read    ON public.fuel_prices_live;
DROP POLICY IF EXISTS fuel_price_sync_meta_owner_read ON public.fuel_price_sync_meta;

-- Source: lib/supabase-p2b-fuel-margin-rls.sql (we replace under unified names)
DROP POLICY IF EXISTS fd_owner_select        ON public.fuel_deliveries;
DROP POLICY IF EXISTS fd_owner_insert        ON public.fuel_deliveries;
DROP POLICY IF EXISTS fd_owner_update        ON public.fuel_deliveries;
DROP POLICY IF EXISTS fd_owner_delete        ON public.fuel_deliveries;
DROP POLICY IF EXISTS fd_operator_select     ON public.fuel_deliveries;
DROP POLICY IF EXISTS fd_operator_insert     ON public.fuel_deliveries;
DROP POLICY IF EXISTS fg_read_authed         ON public.fuel_grades;
DROP POLICY IF EXISTS fg_owner_write_insert  ON public.fuel_grades;
DROP POLICY IF EXISTS fg_owner_write_update  ON public.fuel_grades;

-- ── A.2 dynamic catch-all ───────────────────────────────────────────────────
-- Drop any remaining policy on any in-scope table — including manually
-- created ones we can't enumerate from the SQL files.
DO $$
DECLARE r RECORD;
  in_scope TEXT[] := ARRAY[
    'users','sites','operator_site_assignments','staff_site_assignments',
    'shift_reports','shift_formula_results','dip_readings',
    'site_field_configs','site_banking_formulas',
    'fuel_price_entries','fuel_price_acknowledgements','fuel_price_changes',
    'fuel_price_escalations','fuel_price_notifications',
    'fuel_deliveries','fuel_grades',
    'tanks','tank_reconciliation',
    'site_competitors','competitor_fuel_prices',
    'subscriptions','stripe_customers','stripe_webhook_events',
    'user_invites','audit_log',
    'fuel_prices_live','fuel_stations','fuel_price_sync_meta'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = ANY (in_scope)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'dropped legacy policy %.%', r.tablename, r.policyname;
  END LOOP;
END $$;

-- =============================================================================
-- PHASE A.3 — Drop legacy SECURITY DEFINER helpers (RESTRICT — fail loud)
-- =============================================================================
-- These helpers were referenced by the legacy policies we just dropped in
-- Phase A.1/A.2. RESTRICT (the default, stated explicitly here for clarity)
-- means the DROP aborts loudly if anything still depends on them — much
-- safer than CASCADE, which would silently remove unknown dependents.
--
-- If any of these aborts the transaction, investigate: a policy survived
-- Phase A and was using the helper. Add it to PHASE A.1, re-run.
--
-- WHY HERE and not in lib/supabase-sec1-helpers.sql? The helpers file runs
-- in Phase 1 BEFORE policy drops. CASCADE-dropping these helpers in Phase 1
-- would silently remove the policies that depend on them, weakening
-- security mid-migration. Drop AFTER the policies are gone, with RESTRICT.

DROP FUNCTION IF EXISTS public.get_user_id_from_auth()           RESTRICT;
DROP FUNCTION IF EXISTS public.get_operator_site_ids()           RESTRICT;
DROP FUNCTION IF EXISTS public.get_staff_site_ids()              RESTRICT;
DROP FUNCTION IF EXISTS public.get_user_role_and_id()            RESTRICT;
DROP FUNCTION IF EXISTS public.get_operator_assigned_sites(text) RESTRICT;
DROP FUNCTION IF EXISTS public.get_staff_assigned_sites(text)    RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_uuid()                  RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_role()                  RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_site_ids()              RESTRICT;

-- =============================================================================
-- PHASE B — Enable RLS on all in-scope tables (idempotent)
-- =============================================================================
ALTER TABLE public.users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_site_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_site_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_reports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_formula_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dip_readings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_field_configs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_banking_formulas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_changes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_escalations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_deliveries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_grades                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tanks                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_reconciliation        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_competitors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_fuel_prices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invites               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_prices_live           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_stations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_sync_meta       ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PHASE 2 — Assignment tables (leaf tables; safe first)
-- =============================================================================

-- ── operator_site_assignments ────────────────────────────────────────────────
CREATE POLICY operator_assignments_select
  ON public.operator_site_assignments FOR SELECT
  USING (
    operator_user_id = public.current_user_app_id()
    OR public.user_is_owner_of(auth.uid(), site_id)
  );

CREATE POLICY operator_assignments_owner_insert
  ON public.operator_site_assignments FOR INSERT
  WITH CHECK (public.user_is_owner_of(auth.uid(), site_id));

CREATE POLICY operator_assignments_owner_update
  ON public.operator_site_assignments FOR UPDATE
  USING (public.user_is_owner_of(auth.uid(), site_id))
  WITH CHECK (public.user_is_owner_of(auth.uid(), site_id));

CREATE POLICY operator_assignments_owner_delete
  ON public.operator_site_assignments FOR DELETE
  USING (public.user_is_owner_of(auth.uid(), site_id));

-- ── staff_site_assignments ───────────────────────────────────────────────────
CREATE POLICY staff_assignments_select
  ON public.staff_site_assignments FOR SELECT
  USING (
    staff_user_id = public.current_user_app_id()
    OR site_id IN (SELECT public.user_site_ids(auth.uid()))
       AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY staff_assignments_op_owner_insert
  ON public.staff_site_assignments FOR INSERT
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY staff_assignments_op_owner_update
  ON public.staff_site_assignments FOR UPDATE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY staff_assignments_op_owner_delete
  ON public.staff_site_assignments FOR DELETE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- =============================================================================
-- PHASE 3 — Sites + users
-- =============================================================================

-- ── users ────────────────────────────────────────────────────────────────────
CREATE POLICY users_self_read
  ON public.users FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR public.user_role(auth.uid()) = 'owner'
  );
-- Writes via service-role only (no INSERT/UPDATE/DELETE policy for JWT).

-- ── sites ────────────────────────────────────────────────────────────────────
CREATE POLICY sites_select_member
  ON public.sites FOR SELECT
  USING (id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY sites_owner_insert
  ON public.sites FOR INSERT
  WITH CHECK (owner_id = public.current_user_app_id());

CREATE POLICY sites_owner_update
  ON public.sites FOR UPDATE
  USING (owner_id = public.current_user_app_id())
  WITH CHECK (owner_id = public.current_user_app_id());

CREATE POLICY sites_owner_delete
  ON public.sites FOR DELETE
  USING (owner_id = public.current_user_app_id());

-- =============================================================================
-- PHASE 4 — Business data tables (all leaves now — no cross-business subqueries)
-- =============================================================================

-- ── shift_reports ────────────────────────────────────────────────────────────
CREATE POLICY shift_reports_select_member
  ON public.shift_reports FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY shift_reports_insert_submitter
  ON public.shift_reports FOR INSERT
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND submitted_by_user_id = public.current_user_app_id()
  );

CREATE POLICY shift_reports_update_owner_op
  ON public.shift_reports FOR UPDATE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
  );

CREATE POLICY shift_reports_delete_owner
  ON public.shift_reports FOR DELETE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  );

-- ── shift_formula_results (joined via parent shift_reports.site_id) ─────────
CREATE POLICY shift_formula_results_select_member
  ON public.shift_formula_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shift_reports sr
       WHERE sr.id = shift_formula_results.shift_report_id
         AND sr.site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
  );
-- writes service-only

-- ── dip_readings (direct site_id) ────────────────────────────────────────────
CREATE POLICY dip_readings_select_member
  ON public.dip_readings FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY dip_readings_insert_member
  ON public.dip_readings FOR INSERT
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND operator_user_id = public.current_user_app_id()
  );

CREATE POLICY dip_readings_update_owner_op
  ON public.dip_readings FOR UPDATE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY dip_readings_delete_owner
  ON public.dip_readings FOR DELETE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  );

-- ── site_field_configs ───────────────────────────────────────────────────────
CREATE POLICY site_field_configs_select_member
  ON public.site_field_configs FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY site_field_configs_owner_op_write
  ON public.site_field_configs FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── site_banking_formulas ────────────────────────────────────────────────────
CREATE POLICY site_banking_formulas_select_member
  ON public.site_banking_formulas FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY site_banking_formulas_owner_op_write
  ON public.site_banking_formulas FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── fuel_price_entries ───────────────────────────────────────────────────────
CREATE POLICY fuel_price_entries_select_member
  ON public.fuel_price_entries FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY fuel_price_entries_owner_op_write
  ON public.fuel_price_entries FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── fuel_price_changes (direct site_id) ──────────────────────────────────────
CREATE POLICY fuel_price_changes_select_member
  ON public.fuel_price_changes FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY fuel_price_changes_owner_op_write
  ON public.fuel_price_changes FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── fuel_price_acknowledgements (via parent fuel_price_changes.site_id) ─────
CREATE POLICY fuel_price_acks_select_member
  ON public.fuel_price_acknowledgements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fuel_price_changes c
       WHERE c.id = fuel_price_acknowledgements.price_change_id
         AND c.site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
  );

CREATE POLICY fuel_price_acks_insert_self
  ON public.fuel_price_acknowledgements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fuel_price_changes c
       WHERE c.id = fuel_price_acknowledgements.price_change_id
         AND c.site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
    AND (
      staff_user_id = public.current_user_app_id()
      OR operator_user_id = public.current_user_app_id()
    )
  );
-- updates/deletes service-only

-- ── fuel_price_escalations (via parent fuel_price_changes.site_id) ──────────
CREATE POLICY fuel_price_escalations_select_member
  ON public.fuel_price_escalations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fuel_price_changes c
       WHERE c.id = fuel_price_escalations.price_change_id
         AND c.site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
  );
-- writes service-only

-- ── fuel_price_notifications (via parent fuel_price_changes.site_id) ────────
CREATE POLICY fuel_price_notifications_select_member
  ON public.fuel_price_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.fuel_price_changes c
       WHERE c.id = fuel_price_notifications.price_change_id
         AND c.site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
  );
-- writes service-only

-- ── fuel_deliveries (the cost book — owners + assigned operators) ───────────
CREATE POLICY fuel_deliveries_select_member
  ON public.fuel_deliveries FOR SELECT
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY fuel_deliveries_owner_op_insert
  ON public.fuel_deliveries FOR INSERT
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY fuel_deliveries_owner_update
  ON public.fuel_deliveries FOR UPDATE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  );

CREATE POLICY fuel_deliveries_owner_delete
  ON public.fuel_deliveries FOR DELETE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  );

-- ── fuel_grades (global lookup, any-authed read, owner write) ───────────────
CREATE POLICY fuel_grades_select_authed
  ON public.fuel_grades FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY fuel_grades_owner_insert
  ON public.fuel_grades FOR INSERT
  WITH CHECK (public.user_role(auth.uid()) = 'owner');

CREATE POLICY fuel_grades_owner_update
  ON public.fuel_grades FOR UPDATE
  USING (public.user_role(auth.uid()) = 'owner')
  WITH CHECK (public.user_role(auth.uid()) = 'owner');

CREATE POLICY fuel_grades_owner_delete
  ON public.fuel_grades FOR DELETE
  USING (public.user_role(auth.uid()) = 'owner');

-- ── tanks ────────────────────────────────────────────────────────────────────
CREATE POLICY tanks_select_member
  ON public.tanks FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY tanks_owner_op_write
  ON public.tanks FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── tank_reconciliation (owner/operator only — staff blocked) ───────────────
CREATE POLICY tank_reconciliation_select_owner_op
  ON public.tank_reconciliation FOR SELECT
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

CREATE POLICY tank_reconciliation_owner_op_write
  ON public.tank_reconciliation FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── site_competitors (direct site_id) ────────────────────────────────────────
CREATE POLICY site_competitors_select_member
  ON public.site_competitors FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY site_competitors_owner_op_write
  ON public.site_competitors FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── competitor_fuel_prices (direct site_id, NOT via site_competitors join) ──
CREATE POLICY competitor_fuel_prices_select_member
  ON public.competitor_fuel_prices FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY competitor_fuel_prices_owner_op_write
  ON public.competitor_fuel_prices FOR ALL
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  )
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );

-- ── subscriptions (owner-self read; service writes) ─────────────────────────
CREATE POLICY subscriptions_self_select
  ON public.subscriptions FOR SELECT
  USING (user_id = public.current_user_app_id());
-- writes service-only

-- ── stripe_customers (owner-self read; service writes) ──────────────────────
CREATE POLICY stripe_customers_self_select
  ON public.stripe_customers FOR SELECT
  USING (user_id = public.current_user_app_id());
-- writes service-only

-- ── stripe_webhook_events (deny-all; service-role bypasses) ─────────────────
-- No policy created intentionally. With RLS enabled and no policy, all JWT
-- access is denied; service_role bypasses RLS and remains functional.

-- ── user_invites (inviter or site-member read; service writes) ──────────────
-- CRITICAL: anon read would leak `token`. RLS ON + scoped read.
CREATE POLICY user_invites_select_scoped
  ON public.user_invites FOR SELECT
  USING (
    invited_by_user_id = public.current_user_app_id()
    OR site_id IN (SELECT public.user_site_ids(auth.uid()))
  );
-- writes service-only

-- ── audit_log (site-scoped read for rows with site_id; rest service-only) ───
CREATE POLICY audit_log_select_site_scoped
  ON public.audit_log FOR SELECT
  USING (
    site_id IS NOT NULL
    AND site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner','operator')
  );
-- writes service-only

-- ── fuel_prices_live  /  fuel_stations  (🟡 OWNER DECISION) ─────────────────
-- The migration ships Option A (any-authenticated read) by default — this
-- matches the pilot UX where operators/staff see live QLD prices in the UI.
-- If you want Option B (owner-only) instead, comment out the _authed policy
-- and uncomment the _owner_only one before applying.

-- Option A (DEFAULT — any-authenticated read):
CREATE POLICY fuel_prices_live_select_authed
  ON public.fuel_prices_live FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY fuel_stations_select_authed
  ON public.fuel_stations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Option B (owner-only — uncomment to switch):
-- CREATE POLICY fuel_prices_live_select_owner_only
--   ON public.fuel_prices_live FOR SELECT
--   USING (public.user_role(auth.uid()) = 'owner');
-- CREATE POLICY fuel_stations_select_owner_only
--   ON public.fuel_stations FOR SELECT
--   USING (public.user_role(auth.uid()) = 'owner');

-- writes service-only (no INSERT/UPDATE/DELETE policy for either table)

-- ── fuel_price_sync_meta (deny-all; service-role bypasses) ──────────────────
-- No policy created intentionally.

-- =============================================================================
-- PHASE 5 — Verification (READ-ONLY, paste output into the runbook)
-- =============================================================================

-- 5.1 Confirm every in-scope table has RLS enabled
DO $$
DECLARE missing_rls TEXT[];
BEGIN
  SELECT array_agg(relname ORDER BY relname) INTO missing_rls
    FROM pg_class
   WHERE relnamespace='public'::regnamespace
     AND relkind='r'
     AND relname IN (
       'users','sites','operator_site_assignments','staff_site_assignments',
       'shift_reports','shift_formula_results','dip_readings',
       'site_field_configs','site_banking_formulas',
       'fuel_price_entries','fuel_price_acknowledgements','fuel_price_changes',
       'fuel_price_escalations','fuel_price_notifications',
       'fuel_deliveries','fuel_grades',
       'tanks','tank_reconciliation',
       'site_competitors','competitor_fuel_prices',
       'subscriptions','stripe_customers','stripe_webhook_events',
       'user_invites','audit_log',
       'fuel_prices_live','fuel_stations','fuel_price_sync_meta'
     )
     AND NOT relrowsecurity;
  IF missing_rls IS NULL THEN
    RAISE NOTICE 'SEC1 verification: RLS enabled on all 28 in-scope tables ✓';
  ELSE
    RAISE WARNING 'SEC1 verification FAILED — RLS missing on: %', missing_rls;
  END IF;
END $$;

-- 5.2 Policy count per table (informational)
--   SELECT tablename, count(*) policies
--     FROM pg_policies WHERE schemaname='public'
--    GROUP BY 1 ORDER BY 1;

-- 5.3 Anon smoke (run as anon role outside SQL editor — see scripts/verify-sec1-rls.js)
--   SELECT count(*) FROM public.shift_reports;  -- expect 0
--   SELECT count(*) FROM public.user_invites;   -- expect 0
--   SELECT count(*) FROM public.subscriptions;  -- expect 0

DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'SEC1 migration applied successfully.';
  RAISE NOTICE 'Next: run scripts/verify-sec1-rls.js (anon + per-role JWT).';
  RAISE NOTICE 'Then: stamp lib/supabase-disable-rls-emergency.sql DEPRECATED.';
  RAISE NOTICE '==========================================================';
END $$;
