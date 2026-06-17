-- ============================================================================
-- Demo-source isolation safeguard
--
-- Adds users.is_demo_source. The demo "Explore the demo" bridge reads
-- from the tenant marked is_demo_source = true (instead of a magic id).
-- Signup hard-rejects any attempt to create a user with this flag set
-- (defence-in-depth against a real customer ever landing on the demo
-- tenant).
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo_source BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark the existing synthetic seed owner explicitly. Idempotent.
UPDATE public.users
   SET is_demo_source = TRUE
 WHERE id = 'owner-001';

-- Hard-enforce: at most ONE demo source can exist. Partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_one_demo_source
  ON public.users((1)) WHERE is_demo_source = TRUE;

-- Verification — expect exactly 1 row, id = 'owner-001'.
SELECT id, name, email, is_demo, is_demo_source
  FROM public.users
 WHERE is_demo_source = TRUE;
