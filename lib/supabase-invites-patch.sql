-- ============================================================
-- FOPS – Invites Patch (run this NOW)
-- ============================================================
-- This is a small, idempotent patch that:
--   1. Adds the missing columns the new invite flow needs
--   2. Disables RLS (admin client bypasses anyway, simpler for pilot)
--   3. Skips index creation since they already exist from the old schema
--
-- Safe to run multiple times.
-- ============================================================

-- 1) Add missing columns (NEW for token-based invite acceptance)
ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS site_ids TEXT[],
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id TEXT;

-- 2) Backfill token for any existing rows (use id as fallback token)
UPDATE user_invites SET token = id WHERE token IS NULL;

-- 3) Add unique index on token (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'user_invites_token_key'
  ) THEN
    CREATE UNIQUE INDEX user_invites_token_key ON user_invites(token);
  END IF;
END$$;

-- 4) Add accepted_by FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_invites_accepted_by_fkey'
      AND table_name = 'user_invites'
  ) THEN
    ALTER TABLE user_invites
      ADD CONSTRAINT user_invites_accepted_by_fkey
      FOREIGN KEY (accepted_by_user_id)
      REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 5) Disable RLS for pilot (admin client bypasses regardless)
-- The previous schema enabled RLS with policies that could block our
-- API calls. Disable for now; we'll add SECURITY DEFINER functions in V2.
ALTER TABLE user_invites DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Verify (run this to confirm)
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'user_invites' ORDER BY ordinal_position;
--
-- Should see 11 columns including: token, site_ids, accepted_at, accepted_by_user_id
