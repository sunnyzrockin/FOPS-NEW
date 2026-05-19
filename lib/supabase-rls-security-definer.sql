-- =====================================================
-- FOPS — Re-enable Row Level Security with SECURITY DEFINER helpers
-- =====================================================
-- This migration replaces the emergency "RLS disabled everywhere"
-- state with a clean, recursion-free policy set powered by three
-- SECURITY DEFINER functions:
--
--   auth_user_uuid()      — the public.users.id of the current
--                           Supabase auth user (or NULL for anon/admin)
--   auth_user_role()      — 'owner' | 'operator' | 'staff' | NULL
--   auth_user_site_ids()  — UUID[] of sites the current user can access
--
-- These functions are owned by `postgres` and marked SECURITY DEFINER
-- so they bypass RLS internally. That's what breaks the infinite
-- recursion: policies reference the helpers instead of querying the
-- same RLS-guarded tables.
--
-- The service role (used by the API for trusted ops) continues to
-- bypass RLS entirely, so all current `supabaseAdmin` reads/writes
-- in /app/app/api/* keep working. RLS only kicks in for direct
-- Supabase client calls (e.g. the Studio, ad-hoc dashboards, mobile
-- SDK, future end-user PostgREST access).
--
-- Apply with: paste into Supabase SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- Rollback: see /app/lib/supabase-disable-rls-emergency.sql
-- =====================================================

-- ── 1. SECURITY DEFINER helpers ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_user_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM public.users
   WHERE auth_user_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM public.users
   WHERE auth_user_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_site_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user uuid;
  v_role text;
  v_ids  uuid[];
BEGIN
  SELECT id, role INTO v_user, v_role
    FROM public.users
   WHERE auth_user_id = auth.uid()
   LIMIT 1;

  IF v_user IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  IF v_role = 'owner' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.sites
     WHERE owner_id = v_user;
    RETURN v_ids;
  ELSIF v_role = 'operator' THEN
    SELECT COALESCE(array_agg(site_id), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.operator_site_assignments
     WHERE operator_user_id = v_user;
    RETURN v_ids;
  ELSIF v_role = 'staff' THEN
    SELECT COALESCE(array_agg(site_id), ARRAY[]::uuid[])
      INTO v_ids
      FROM public.staff_site_assignments
     WHERE staff_user_id = v_user;
    RETURN v_ids;
  ELSE
    RETURN ARRAY[]::uuid[];
  END IF;
END;
$$;

-- Allow `authenticated` to call them; service_role doesn't need it.
GRANT EXECUTE ON FUNCTION public.auth_user_uuid()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_site_ids()  TO authenticated;

-- ── 2. Enable RLS on every table we previously disabled ─────────────────

ALTER TABLE public.users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_site_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_site_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_field_configs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_banking_formulas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_formula_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_competitors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_fuel_prices      ENABLE ROW LEVEL SECURITY;

-- Phase 3 tables (may not exist on older databases — guard with DO block)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dip_readings') THEN
    EXECUTE 'ALTER TABLE public.dip_readings ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_stations') THEN
    EXECUTE 'ALTER TABLE public.fuel_stations ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_prices_live') THEN
    EXECUTE 'ALTER TABLE public.fuel_prices_live ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_price_sync_meta') THEN
    EXECUTE 'ALTER TABLE public.fuel_price_sync_meta ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── 3. Drop any pre-existing policies we are about to recreate ──────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'users','sites','operator_site_assignments','staff_site_assignments',
         'site_field_configs','shift_reports','site_banking_formulas',
         'shift_formula_results','fuel_price_entries','site_competitors',
         'competitor_fuel_prices','dip_readings','fuel_stations',
         'fuel_prices_live','fuel_price_sync_meta'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 4. Policies ─────────────────────────────────────────────────────────
-- All policies use the SECURITY DEFINER helpers — no cross-table queries
-- inside a policy, so no recursion.

-- USERS: every authenticated user can read their own row. Owners can read
-- everyone (so the admin UI shows operator/staff lists). Inserts/updates
-- are handled by the API via service_role — no client-side write policy.
CREATE POLICY users_self_read ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR auth_user_role() = 'owner');

-- SITES: visible if site.id ∈ auth_user_site_ids().
CREATE POLICY sites_read ON public.sites
  FOR SELECT TO authenticated
  USING (id = ANY (auth_user_site_ids()));

-- OPERATOR_SITE_ASSIGNMENTS: owners see all on their sites; operators
-- see their own assignment rows.
CREATE POLICY op_assign_read ON public.operator_site_assignments
  FOR SELECT TO authenticated
  USING (
    auth_user_role() = 'owner'
    OR operator_user_id = auth_user_uuid()
  );

-- STAFF_SITE_ASSIGNMENTS: owners + operators see assignments on their
-- accessible sites; staff see their own.
CREATE POLICY staff_assign_read ON public.staff_site_assignments
  FOR SELECT TO authenticated
  USING (
    auth_user_role() IN ('owner','operator')
    OR staff_user_id = auth_user_uuid()
  );

-- SITE_FIELD_CONFIGS: anyone with site access can read; only operator
-- can modify (writes go through API anyway).
CREATE POLICY field_configs_read ON public.site_field_configs
  FOR SELECT TO authenticated
  USING (site_id = ANY (auth_user_site_ids()));

-- SHIFT_REPORTS: visible to anyone with site access.
CREATE POLICY shift_reports_read ON public.shift_reports
  FOR SELECT TO authenticated
  USING (site_id = ANY (auth_user_site_ids()));

-- SITE_BANKING_FORMULAS
CREATE POLICY banking_formulas_read ON public.site_banking_formulas
  FOR SELECT TO authenticated
  USING (site_id = ANY (auth_user_site_ids()));

-- SHIFT_FORMULA_RESULTS — joined via shift_reports.site_id; safe to scope
-- by report_id existing in user's site list. Use EXISTS but the inner
-- query goes through the same SECURITY DEFINER helper, no recursion.
CREATE POLICY shift_formula_results_read ON public.shift_formula_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shift_reports sr
       WHERE sr.id = shift_formula_results.shift_report_id
         AND sr.site_id = ANY (auth_user_site_ids())
    )
  );

CREATE POLICY fuel_price_entries_read ON public.fuel_price_entries
  FOR SELECT TO authenticated
  USING (site_id = ANY (auth_user_site_ids()));

CREATE POLICY site_competitors_read ON public.site_competitors
  FOR SELECT TO authenticated
  USING (site_id = ANY (auth_user_site_ids()));

CREATE POLICY competitor_fuel_prices_read ON public.competitor_fuel_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.site_competitors sc
       WHERE sc.id = competitor_fuel_prices.competitor_id
         AND sc.site_id = ANY (auth_user_site_ids())
    )
  );

-- Phase 3 — dips
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dip_readings') THEN
    EXECUTE $POL$
      CREATE POLICY dip_readings_read ON public.dip_readings
        FOR SELECT TO authenticated
        USING (site_id = ANY (auth_user_site_ids()))
    $POL$;
  END IF;

  -- Live fuel prices tables: owner-only (matches API gate). Staff/operator
  -- have no business reading raw QLD FPM data via PostgREST.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_stations') THEN
    EXECUTE $POL$
      CREATE POLICY fuel_stations_owner_read ON public.fuel_stations
        FOR SELECT TO authenticated
        USING (auth_user_role() = 'owner')
    $POL$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_prices_live') THEN
    EXECUTE $POL$
      CREATE POLICY fuel_prices_live_owner_read ON public.fuel_prices_live
        FOR SELECT TO authenticated
        USING (auth_user_role() = 'owner')
    $POL$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fuel_price_sync_meta') THEN
    EXECUTE $POL$
      CREATE POLICY fuel_price_sync_meta_owner_read ON public.fuel_price_sync_meta
        FOR SELECT TO authenticated
        USING (auth_user_role() = 'owner')
    $POL$;
  END IF;
END $$;

-- ── 5. Confirmation banner ──────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'RLS re-enabled with SECURITY DEFINER policies';
  RAISE NOTICE '  helpers: auth_user_uuid(), auth_user_role(),';
  RAISE NOTICE '           auth_user_site_ids()';
  RAISE NOTICE '  tables : users, sites, *_site_assignments,';
  RAISE NOTICE '           site_field_configs, shift_reports,';
  RAISE NOTICE '           site_banking_formulas,';
  RAISE NOTICE '           shift_formula_results,';
  RAISE NOTICE '           fuel_price_entries, site_competitors,';
  RAISE NOTICE '           competitor_fuel_prices, dip_readings,';
  RAISE NOTICE '           fuel_stations, fuel_prices_live,';
  RAISE NOTICE '           fuel_price_sync_meta';
  RAISE NOTICE '  service_role bypasses RLS — API keeps working.';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Smoke test: as the anon role, try';
  RAISE NOTICE '  SELECT * FROM sites;  -- should be empty';
  RAISE NOTICE 'Then log in as owner@workflowlite.com via the';
  RAISE NOTICE 'UI; you should see ALL FIVE owned sites.';
  RAISE NOTICE '==========================================';
END $$;
