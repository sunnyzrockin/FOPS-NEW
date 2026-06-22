-- =============================================================================
-- SEC1 — Phase 1 helpers: SECURITY DEFINER functions for RLS policies
-- =============================================================================
-- DO NOT EXECUTE without owner sign-off and PITR backup tagged pre-sec1-<date>.
-- See memory/upcoming_prompts/SEC1_rls_hardening.md for full plan.
--
-- This file is IDEMPOTENT and safe to re-run.
--
-- Identity model bridged by these helpers:
--   auth.uid()            UUID — Supabase auth.users.id
--   users.auth_user_id    UUID — bridge to auth.users.id
--   users.id              TEXT — application identity ("operator-001" etc.)
--   sites.id              TEXT — site identity (may be "site-001" or UUID-shaped)
--   *_user_id columns     TEXT — reference users.id
--
-- Policy predicates compare TEXT to TEXT throughout. auth.uid() is converted
-- to the app TEXT id by current_user_app_id() or by the helpers below.
-- =============================================================================

-- ─── 1. Drop legacy helpers (defensive — they may not exist on a clean DB) ────
-- These were introduced by earlier RLS attempts and are superseded.
DROP FUNCTION IF EXISTS public.get_user_id_from_auth()                       CASCADE;
DROP FUNCTION IF EXISTS public.get_operator_site_ids()                       CASCADE;
DROP FUNCTION IF EXISTS public.get_staff_site_ids()                          CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role_and_id()                        CASCADE;
DROP FUNCTION IF EXISTS public.get_operator_assigned_sites(text)             CASCADE;
DROP FUNCTION IF EXISTS public.get_staff_assigned_sites(text)                CASCADE;
DROP FUNCTION IF EXISTS public.auth_user_uuid()                              CASCADE;
DROP FUNCTION IF EXISTS public.auth_user_role()                              CASCADE;
DROP FUNCTION IF EXISTS public.auth_user_site_ids()                          CASCADE;

-- Old SEC1-draft signatures (in case a prior attempt left them around)
DROP FUNCTION IF EXISTS public.user_site_ids(uuid)                           CASCADE;
DROP FUNCTION IF EXISTS public.user_role(uuid)                               CASCADE;
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, uuid)                  CASCADE;
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, text)                  CASCADE;
DROP FUNCTION IF EXISTS public.current_user_app_id()                         CASCADE;

-- ─── 2. New helpers ──────────────────────────────────────────────────────────

-- 2a. Bridge auth.uid() (UUID) → users.id (TEXT). This is THE missing piece
--     in the earlier draft. Used by every policy that needs the app-level id.
CREATE OR REPLACE FUNCTION public.current_user_app_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_app_id() IS
  'SEC1: returns users.id (TEXT) for the currently-authenticated Supabase user, or NULL for anon/service-role.';

-- 2b. SETOF TEXT site ids the current user can access. Fan-in over the three
--     site-access tables in a single STABLE function — RLS-bypass internal.
CREATE OR REPLACE FUNCTION public.user_site_ids(auth_uid UUID)
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH me AS (
    SELECT id FROM public.users WHERE auth_user_id = auth_uid
  )
  SELECT s.id       FROM public.sites s                     WHERE s.owner_id         IN (SELECT id FROM me)
  UNION
  SELECT o.site_id  FROM public.operator_site_assignments o WHERE o.operator_user_id IN (SELECT id FROM me)
  UNION
  SELECT st.site_id FROM public.staff_site_assignments st   WHERE st.staff_user_id   IN (SELECT id FROM me);
$$;

COMMENT ON FUNCTION public.user_site_ids(uuid) IS
  'SEC1: union of sites the user owns, operates, or staffs. Returns SETOF TEXT to match TEXT sites.id PK.';

-- 2c. Role lookup. Replaces auth.jwt() ->> ''role'' which our custom signup
--     does not populate.
CREATE OR REPLACE FUNCTION public.user_role(auth_uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth_uid LIMIT 1;
$$;

COMMENT ON FUNCTION public.user_role(uuid) IS
  'SEC1: returns ''owner''|''operator''|''staff'' for the authenticated user, or NULL.';

-- 2d. Owner-of-site predicate.
CREATE OR REPLACE FUNCTION public.user_is_owner_of(auth_uid UUID, sid TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sites s
      JOIN public.users u ON u.id = s.owner_id
     WHERE s.id = sid
       AND u.auth_user_id = auth_uid
  );
$$;

COMMENT ON FUNCTION public.user_is_owner_of(uuid, text) IS
  'SEC1: true when auth_uid is the owner of the site with the given TEXT id.';

-- ─── 3. Grants ───────────────────────────────────────────────────────────────
-- service_role bypasses RLS so does not need EXECUTE; authenticated must.
GRANT EXECUTE ON FUNCTION public.current_user_app_id()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_site_ids(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_owner_of(uuid, text)       TO authenticated;

-- ─── 4. Smoke test (informational; safe to copy/paste) ───────────────────────
-- Run as service_role:
--   SELECT public.current_user_app_id();        -- NULL (no JWT)
--   SELECT * FROM public.user_site_ids(NULL);   -- empty
-- Run with a real signed-in JWT (Supabase studio "Run as authenticated"):
--   SELECT public.current_user_app_id();        -- e.g. 'owner-001'
--   SELECT public.user_role(auth.uid());        -- 'owner'
--   SELECT * FROM public.user_site_ids(auth.uid()); -- 5 rows for the demo owner

DO $$
BEGIN
  RAISE NOTICE 'SEC1 helpers created:';
  RAISE NOTICE '  current_user_app_id()                 -> TEXT';
  RAISE NOTICE '  user_site_ids(auth_uid UUID)          -> SETOF TEXT';
  RAISE NOTICE '  user_role(auth_uid UUID)              -> TEXT';
  RAISE NOTICE '  user_is_owner_of(auth_uid UUID, sid TEXT) -> BOOLEAN';
  RAISE NOTICE 'No RLS toggled yet. Next: supabase-sec1-rls-hardening-migration.sql.';
END $$;
