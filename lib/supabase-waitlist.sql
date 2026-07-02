-- =============================================================================
-- Waitlist — public INSERT-only table for the fopsapp.com waitlist form
-- =============================================================================
-- DO NOT EXECUTE without owner sign-off. Idempotent — safe to re-run.
--
-- Design goals:
--   1. Any visitor can submit an email through the form (INSERT allowed for
--      anon), but NO ONE reading the DB via the anon key can see anything
--      (SELECT/UPDATE/DELETE denied for anon).
--   2. Service-role bypasses RLS, so /api/founder/waitlist (owner-side
--      export) can read/manage the list.
--   3. Cheap and correct: DB-level email format + length check via a
--      CHECK constraint in the RLS policy's WITH CHECK clause, so a
--      badly-crafted client cannot bypass server validation.
--   4. Case-insensitive uniqueness on email so someone can't spam the
--      list by capitalising letters.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text          NOT NULL,
  name         text,
  business     text,
  num_sites    text,         -- free text so "1", "2-5", "6+" all work
  source       text,         -- e.g. "landing" | "footer" | "referral" (optional)
  utm          jsonb,         -- utm_source/medium/campaign captured client-side (optional)
  ip           inet,
  user_agent   text,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on email — one row per unique address, ever.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_idx
  ON public.waitlist (lower(email));

-- Enable RLS. Once enabled with NO policies for a role, that role is
-- effectively denied all operations. We add ONLY the INSERT policies.
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- ─── Anon INSERT (the whole point) ──────────────────────────────────────────
-- Any visitor (anon key) can INSERT so the form works from the client OR
-- from our /api/waitlist server route (which uses the anon key on purpose
-- so RLS enforces the constraints, not our app code).
--
-- The WITH CHECK clause enforces email presence + a basic format check +
-- a sane length bound. This is defense in depth — we ALSO validate
-- server-side in /api/waitlist — but it means someone bypassing our API
-- entirely (calling PostgREST directly with the anon key) still can't
-- put garbage in the table.
DROP POLICY IF EXISTS waitlist_anon_insert ON public.waitlist;
CREATE POLICY waitlist_anon_insert
  ON public.waitlist FOR INSERT
  TO anon
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 3 AND 320
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND (name       IS NULL OR char_length(name)      <= 200)
    AND (business   IS NULL OR char_length(business)  <= 200)
    AND (num_sites  IS NULL OR char_length(num_sites) <= 50)
    AND (source     IS NULL OR char_length(source)    <= 50)
  );

-- ─── Authenticated INSERT (rare — a logged-in user submitting the form) ─────
DROP POLICY IF EXISTS waitlist_authed_insert ON public.waitlist;
CREATE POLICY waitlist_authed_insert
  ON public.waitlist FOR INSERT
  TO authenticated
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 3 AND 320
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

-- NO SELECT / UPDATE / DELETE policies for anon or authenticated.
-- With RLS enabled and no policy for those commands, PostgreSQL denies
-- the operation. Only service_role (which bypasses RLS) can read/manage
-- the list — that's how /api/founder/waitlist works.

-- ─── Sanity ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.waitlist IS
  'Public waitlist submissions from fopsapp.com. Anon can INSERT only (see RLS). Read/manage via service-role only.';
COMMENT ON COLUMN public.waitlist.email      IS 'Required. Case-insensitive unique via waitlist_email_lower_idx.';
COMMENT ON COLUMN public.waitlist.num_sites  IS 'Free text: "1", "2-5", "6+" etc.';
COMMENT ON COLUMN public.waitlist.utm        IS 'Optional UTM params captured client-side.';
COMMENT ON COLUMN public.waitlist.ip         IS 'Server-side capture; not exposed via PostgREST to non-service roles (no SELECT policy).';

DO $$
BEGIN
  RAISE NOTICE 'Waitlist table + INSERT-only RLS applied.';
  RAISE NOTICE '  - anon:            INSERT-only (form works)';
  RAISE NOTICE '  - authenticated:   INSERT-only';
  RAISE NOTICE '  - service_role:    full access (RLS bypass; owner exports)';
  RAISE NOTICE '  - all other cmds:  denied by RLS';
END $$;
