-- =====================================================
-- FOPS Session 3 — Audit Log + Support Role
-- =====================================================
-- Adds:
--   1) public.audit_log table (full before/after state per change)
--   2) Allows the existing public.users.role column to take 'support'
--   3) RLS policy: only role='support' can SELECT audit_log via RLS
--      (service role still bypasses RLS so the API keeps working).
--
-- Apply: paste into Supabase SQL Editor → Run. Idempotent.
-- =====================================================

-- ── 1. audit_log table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- WHAT happened
  action          text NOT NULL,          -- 'insert' | 'update' | 'delete' | 'login' | 'login_failed' | 'logout' | other
  table_name      text,                   -- nullable for non-table events (e.g. login)
  record_id       text,                   -- the affected row's PK (text to fit our mixed UUID / 'site-001' style)
  -- WHO did it
  actor_user_id   text,                   -- public.users.id of the actor (null for unauth events)
  actor_email     text,
  actor_role      text,                   -- 'owner' | 'operator' | 'staff' | 'support' | NULL
  -- WHERE from
  ip_address      text,
  user_agent      text,
  -- WHAT changed
  before_state    jsonb,
  after_state     jsonb,
  metadata        jsonb DEFAULT '{}'::jsonb,
  -- Optional convenience pointer back to the site this was about
  site_id         text
);

-- ── 2. Indexes for the audit timeline ───────────────────────────
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_id_idx ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_table_name_idx ON public.audit_log (table_name);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_site_id_idx ON public.audit_log (site_id);

-- ── 3. RLS ── only 'support' role can read; nobody can INSERT/UPDATE/DELETE via RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_support_select ON public.audit_log;
CREATE POLICY audit_log_support_select
  ON public.audit_log
  FOR SELECT
  USING (
    -- Use the SECURITY DEFINER helper from supabase-rls-security-definer.sql.
    -- If the helper isn't installed yet, fall back to checking the users
    -- table directly (works only for service role anyway, since RLS will
    -- block ordinary users from seeing this table at all).
    coalesce(public.auth_user_role(), '') = 'support'
  );

-- No INSERT/UPDATE/DELETE policies → only the service-role API (which
-- bypasses RLS) can write to audit_log. That's what we want.

-- ── 4. Allow the 'support' role on public.users ──────────────────────
-- If users.role is a TEXT column there's nothing to alter. If you've
-- pinned it to an enum, uncomment the ALTER TYPE below.
-- ALTER TYPE public.user_role_enum ADD VALUE IF NOT EXISTS 'support';

-- ── 5. Done.
-- =====================================================
