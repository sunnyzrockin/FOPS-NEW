-- ============================================================================
-- Wet-stock Tier 1 — RLS configuration (Option A: OFF)
--
-- Follow-up to lib/supabase-wetstock-tier1-migration.sql.
--
-- DECISION: ship tanks + tank_reconciliation with RLS DISABLED so they
-- match the rest of the business-table schema (sites, shift_reports,
-- site_field_configs, site_banking_formulas, shift_formula_results, ...
-- all of which had RLS disabled in supabase-disable-rls-emergency.sql
-- after recursive-policy issues during pilot rollout).
--
-- Access control is enforced at the API layer:
--   * every handler uses the service-role key (bypasses RLS anyway)
--   * resolveAccessibleSiteIds(currentUser) filters by role server-side
--     against sites.owner_id, operator_site_assignments, and
--     staff_site_assignments
--   * tanks: writes restricted to owner/operator; reads scoped to assigned sites
--   * tank_reconciliation: reads operator/owner only (per spec)
--
-- The proper schema-wide RLS re-enablement is tracked separately as
-- SEC1 in memory/upcoming_prompts/SEC1_rls_hardening.md and must be done
-- in ONE coordinated migration across all business tables to avoid the
-- partial-defence anti-pattern ("two locked doors next to ten open ones").
--
-- Apply in Supabase SQL editor after the main migration.
-- ============================================================================

ALTER TABLE public.tanks                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tank_reconciliation  DISABLE ROW LEVEL SECURITY;

-- Verification — expect rowsecurity = false for both tables.
SELECT relname AS table_name,
       relrowsecurity AS rls_enabled
  FROM pg_class
 WHERE relname IN ('tanks', 'tank_reconciliation')
   AND relnamespace = 'public'::regnamespace
 ORDER BY 1;

DO $$
BEGIN
  RAISE NOTICE '==========================================================';
  RAISE NOTICE 'Wet-stock Tier 1: RLS DISABLED on tanks + tank_reconciliation';
  RAISE NOTICE 'Matches existing pattern (sites, shift_reports, etc.)';
  RAISE NOTICE 'Enforcement: service-role API + resolveAccessibleSiteIds()';
  RAISE NOTICE '----------------------------------------------------------';
  RAISE NOTICE 'Hardening tracked: memory/upcoming_prompts/SEC1_rls_hardening.md';
  RAISE NOTICE '==========================================================';
END $$;
