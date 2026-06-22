-- =============================================================================
-- SEC1 — Rollback for the RLS hardening migration
-- =============================================================================
-- DO NOT EXECUTE unless an actual incident is in progress and the on-call has
-- determined per-table rollback is insufficient. For single-table incidents
-- use the per-table block in memory/SEC1_runbook.md instead — this file is
-- a full rollback to the pre-migration state.
--
-- This file is IDEMPOTENT and safe to re-run.
-- Order: reverse of the migration (drop policies first, then disable RLS,
-- then drop helpers).
-- =============================================================================

-- ─── A. Drop every policy created by the migration ───────────────────────────
-- Listed in reverse order of the migration for clarity. DROP POLICY IF EXISTS
-- means re-runs are safe.

-- fuel_price_sync_meta — no policy was created (deny-all by design)

-- fuel_stations / fuel_prices_live
DROP POLICY IF EXISTS fuel_stations_select_authed              ON public.fuel_stations;
DROP POLICY IF EXISTS fuel_stations_select_owner_only          ON public.fuel_stations;
DROP POLICY IF EXISTS fuel_prices_live_select_authed           ON public.fuel_prices_live;
DROP POLICY IF EXISTS fuel_prices_live_select_owner_only       ON public.fuel_prices_live;

-- audit_log
DROP POLICY IF EXISTS audit_log_select_site_scoped             ON public.audit_log;

-- user_invites
DROP POLICY IF EXISTS user_invites_select_scoped               ON public.user_invites;

-- stripe_webhook_events — no policy was created

-- stripe_customers / subscriptions
DROP POLICY IF EXISTS stripe_customers_self_select             ON public.stripe_customers;
DROP POLICY IF EXISTS subscriptions_self_select                ON public.subscriptions;

-- competitor_fuel_prices
DROP POLICY IF EXISTS competitor_fuel_prices_owner_op_write    ON public.competitor_fuel_prices;
DROP POLICY IF EXISTS competitor_fuel_prices_select_member     ON public.competitor_fuel_prices;

-- site_competitors
DROP POLICY IF EXISTS site_competitors_owner_op_write          ON public.site_competitors;
DROP POLICY IF EXISTS site_competitors_select_member           ON public.site_competitors;

-- tank_reconciliation
DROP POLICY IF EXISTS tank_reconciliation_owner_op_write       ON public.tank_reconciliation;
DROP POLICY IF EXISTS tank_reconciliation_select_owner_op      ON public.tank_reconciliation;

-- tanks
DROP POLICY IF EXISTS tanks_owner_op_write                     ON public.tanks;
DROP POLICY IF EXISTS tanks_select_member                      ON public.tanks;

-- fuel_grades
DROP POLICY IF EXISTS fuel_grades_owner_delete                 ON public.fuel_grades;
DROP POLICY IF EXISTS fuel_grades_owner_update                 ON public.fuel_grades;
DROP POLICY IF EXISTS fuel_grades_owner_insert                 ON public.fuel_grades;
DROP POLICY IF EXISTS fuel_grades_select_authed                ON public.fuel_grades;

-- fuel_deliveries
DROP POLICY IF EXISTS fuel_deliveries_owner_delete             ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_owner_update             ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_owner_op_insert          ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_select_member            ON public.fuel_deliveries;

-- fuel_price_notifications / escalations / acknowledgements / changes
DROP POLICY IF EXISTS fuel_price_notifications_select_member   ON public.fuel_price_notifications;
DROP POLICY IF EXISTS fuel_price_escalations_select_member     ON public.fuel_price_escalations;
DROP POLICY IF EXISTS fuel_price_acks_insert_self              ON public.fuel_price_acknowledgements;
DROP POLICY IF EXISTS fuel_price_acks_select_member            ON public.fuel_price_acknowledgements;
DROP POLICY IF EXISTS fuel_price_changes_owner_op_write        ON public.fuel_price_changes;
DROP POLICY IF EXISTS fuel_price_changes_select_member         ON public.fuel_price_changes;

-- fuel_price_entries
DROP POLICY IF EXISTS fuel_price_entries_owner_op_write        ON public.fuel_price_entries;
DROP POLICY IF EXISTS fuel_price_entries_select_member         ON public.fuel_price_entries;

-- site_banking_formulas / site_field_configs
DROP POLICY IF EXISTS site_banking_formulas_owner_op_write     ON public.site_banking_formulas;
DROP POLICY IF EXISTS site_banking_formulas_select_member      ON public.site_banking_formulas;
DROP POLICY IF EXISTS site_field_configs_owner_op_write        ON public.site_field_configs;
DROP POLICY IF EXISTS site_field_configs_select_member         ON public.site_field_configs;

-- dip_readings
DROP POLICY IF EXISTS dip_readings_delete_owner                ON public.dip_readings;
DROP POLICY IF EXISTS dip_readings_update_owner_op             ON public.dip_readings;
DROP POLICY IF EXISTS dip_readings_insert_member               ON public.dip_readings;
DROP POLICY IF EXISTS dip_readings_select_member               ON public.dip_readings;

-- shift_formula_results
DROP POLICY IF EXISTS shift_formula_results_select_member      ON public.shift_formula_results;

-- shift_reports
DROP POLICY IF EXISTS shift_reports_delete_owner               ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_update_owner_op            ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_insert_submitter           ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_select_member              ON public.shift_reports;

-- sites
DROP POLICY IF EXISTS sites_owner_delete                       ON public.sites;
DROP POLICY IF EXISTS sites_owner_update                       ON public.sites;
DROP POLICY IF EXISTS sites_owner_insert                       ON public.sites;
DROP POLICY IF EXISTS sites_select_member                      ON public.sites;

-- users
DROP POLICY IF EXISTS users_self_read                          ON public.users;

-- staff_site_assignments
DROP POLICY IF EXISTS staff_assignments_op_owner_delete        ON public.staff_site_assignments;
DROP POLICY IF EXISTS staff_assignments_op_owner_update        ON public.staff_site_assignments;
DROP POLICY IF EXISTS staff_assignments_op_owner_insert        ON public.staff_site_assignments;
DROP POLICY IF EXISTS staff_assignments_select                 ON public.staff_site_assignments;

-- operator_site_assignments
DROP POLICY IF EXISTS operator_assignments_owner_delete        ON public.operator_site_assignments;
DROP POLICY IF EXISTS operator_assignments_owner_update        ON public.operator_site_assignments;
DROP POLICY IF EXISTS operator_assignments_owner_insert        ON public.operator_site_assignments;
DROP POLICY IF EXISTS operator_assignments_select              ON public.operator_site_assignments;

-- ─── B. Disable RLS on every in-scope table (reverse alphabetical) ───────────
ALTER TABLE public.fuel_price_sync_meta       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_stations              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_prices_live           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invites               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_fuel_prices     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_competitors           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_reconciliation        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tanks                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_grades                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_deliveries            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_notifications   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_escalations     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_changes         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_acknowledgements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_entries         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_banking_formulas      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_field_configs         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dip_readings               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_formula_results      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_reports              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_site_assignments     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_site_assignments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites                      DISABLE ROW LEVEL SECURITY;
-- NOTE: users RLS was already on before SEC1 — leave it enabled in rollback.
-- ALTER TABLE public.users                   DISABLE ROW LEVEL SECURITY;

-- ─── C. Drop the SEC1 helpers (optional — only do this for a full rollback) ──
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, text)    CASCADE;
DROP FUNCTION IF EXISTS public.user_role(uuid)                 CASCADE;
DROP FUNCTION IF EXISTS public.user_site_ids(uuid)             CASCADE;
DROP FUNCTION IF EXISTS public.current_user_app_id()           CASCADE;

DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'SEC1 rollback complete. State matches pre-migration:';
  RAISE NOTICE '  - RLS disabled on all business tables (users kept ON).';
  RAISE NOTICE '  - SEC1 helpers dropped.';
  RAISE NOTICE '  - Legacy policies NOT restored (they were not desirable).';
  RAISE NOTICE 'API continues to filter via supabaseAdmin + resolveAccessibleSiteIds.';
  RAISE NOTICE '==========================================================';
END $$;
