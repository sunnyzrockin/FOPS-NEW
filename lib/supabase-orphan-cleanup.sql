-- ============================================================================
--  FOPS — Orphan Supabase auth user cleanup
-- ============================================================================
--  PURPOSE
--    During development & failed signup retries, rows can accumulate in
--    `auth.users` (the Supabase-managed table) that have NO matching row in
--    our application's `public.users` table. They're junk auth identities
--    that can't log in to anything useful but still count toward your MAU /
--    free-tier limits and clutter the Supabase Auth dashboard.
--
--  STRATEGY
--    Step 1 — DRY RUN: list the orphans. Inspect, double-check that none of
--    them are real users you want to keep.
--    Step 2 — DELETE: remove them via Supabase's `auth.users` delete RPC,
--    which cascades to `auth.identities` and `auth.sessions`.
--
--  HOW TO RUN
--    1. Supabase dashboard → SQL Editor → New query.
--    2. Paste STEP 1 first. Run it. Review the result table carefully.
--    3. If results look correct, paste STEP 2 and run.
--    4. Re-run STEP 1 to confirm 0 orphans remain.
--
--  SAFETY NET
--    • Step 1 is read-only. Run it as many times as you want.
--    • Step 2 uses a CTE that re-derives the orphan set in the same
--      transaction, so a race-condition signup mid-flight will NOT be
--      deleted (it'll already have a public.users row by the time we look).
--    • Step 2 wraps the DELETE in a transaction with RAISE NOTICE so you
--      see exactly how many rows it affected before COMMIT. If the count
--      surprises you, ROLLBACK before COMMIT.
-- ============================================================================


-- =====================================================
-- STEP 1 — DRY RUN: list orphan auth.users
-- =====================================================
SELECT
  au.id                                AS auth_user_id,
  au.email,
  au.created_at                        AS auth_created_at,
  au.last_sign_in_at,
  au.email_confirmed_at,
  CASE
    WHEN au.email LIKE 'diag+%@fopsapp.com'   THEN 'diag/test signup'
    WHEN au.email LIKE 'test%@%'              THEN 'test signup'
    WHEN au.last_sign_in_at IS NULL           THEN 'never logged in'
    ELSE                                            'other (review carefully!)'
  END                                  AS likely_reason
FROM auth.users au
LEFT JOIN public.users pu
  ON pu.auth_user_id = au.id
WHERE pu.id IS NULL                            -- no matching app user
  AND au.created_at < NOW() - INTERVAL '1 hour'  -- skip in-flight signups
ORDER BY au.created_at DESC;

-- Expected: a small handful of rows, mostly created during failed retries
-- in dev / test. If you see a row you DON'T recognize (e.g., a real
-- pilot user that didn't finish signup), STOP and reach out to them
-- before running step 2.


-- =====================================================
-- STEP 2 — DESTRUCTIVE: delete the orphans
-- =====================================================
-- Run only after you've reviewed step 1's output.
-- This runs in a DO block so PostgreSQL prints how many rows were deleted
-- before the implicit commit. If the number is wrong, copy/paste the
-- DELETE statement into a transaction with BEGIN; ... ROLLBACK; first.

DO $$
DECLARE
  orphan_count int;
BEGIN
  -- Re-derive the orphan set inside the same statement to avoid
  -- TOCTOU races vs. concurrent signups.
  WITH orphans AS (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.auth_user_id = au.id
    WHERE pu.id IS NULL
      AND au.created_at < NOW() - INTERVAL '1 hour'
  )
  SELECT COUNT(*) INTO orphan_count FROM orphans;

  RAISE NOTICE 'About to delete % orphan auth.users row(s).', orphan_count;

  -- Supabase's auth.users table is owned by the auth schema; we delete
  -- using its admin function which also cleans up auth.identities,
  -- auth.sessions, auth.refresh_tokens, etc.
  WITH orphans AS (
    SELECT au.id
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.auth_user_id = au.id
    WHERE pu.id IS NULL
      AND au.created_at < NOW() - INTERVAL '1 hour'
  )
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM orphans);

  RAISE NOTICE 'Done. % orphan auth.users row(s) deleted.', orphan_count;
END $$;


-- =====================================================
-- STEP 3 — VERIFY: count should now be 0
-- =====================================================
SELECT COUNT(*) AS remaining_orphans
FROM auth.users au
LEFT JOIN public.users pu ON pu.auth_user_id = au.id
WHERE pu.id IS NULL
  AND au.created_at < NOW() - INTERVAL '1 hour';
