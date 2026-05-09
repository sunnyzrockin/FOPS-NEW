-- ============================================================
-- FOPS – Invites Table Migration (idempotent)
-- ============================================================
-- Run this ONCE in Supabase SQL Editor before using the invite flow.
-- Safe to re-run; uses IF NOT EXISTS / DO blocks throughout.
--
-- Creates user_invites table with all columns needed for token-based
-- invite acceptance via Resend email.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'staff')),
  invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  site_ids TEXT[],
  token TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Add columns if table existed without them
ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS site_ids TEXT[],
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id TEXT;

-- Backfill token for any existing rows
UPDATE user_invites SET token = id WHERE token IS NULL;

-- Unique index on token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'user_invites_token_key'
  ) THEN
    CREATE UNIQUE INDEX user_invites_token_key ON user_invites(token);
  END IF;
END$$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS user_invites_email_idx ON user_invites(email);
CREATE INDEX IF NOT EXISTS user_invites_status_idx ON user_invites(status, expires_at);
CREATE INDEX IF NOT EXISTS user_invites_invited_by_idx ON user_invites(invited_by_user_id);

-- Disable RLS for now (pilot mode); admin client bypasses anyway.
-- Re-enable with proper SECURITY DEFINER policies for V2.
ALTER TABLE user_invites DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Verification (run this to confirm)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'user_invites'
-- ORDER BY ordinal_position;
