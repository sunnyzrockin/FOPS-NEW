-- ============================================================================
-- Billing v2 — per-site subscription model + grace + demo flag
--
-- Layered on top of lib/supabase-stripe-subscriptions.sql (Sprint 1 schema).
-- Run this AFTER the Sprint 1 migration if it isn't already applied.
--
-- All changes are additive. No drops.
-- ============================================================================

-- 1. Track grace window when a subscription enters past_due. After this
--    timestamp the tenant is hard-locked until the card is updated.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ;

-- 2. Mark the demo owner account. is_demo users can read every endpoint
--    they normally would, but every write is rejected SERVER-SIDE by
--    lib/billing.js → assertNotDemo(user).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Helpful indexes.
CREATE INDEX IF NOT EXISTS idx_users_is_demo
  ON public.users(is_demo) WHERE is_demo = TRUE;

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace
  ON public.subscriptions(grace_ends_at) WHERE grace_ends_at IS NOT NULL;

-- 4. Verification — expect both new columns to appear.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'subscriptions' AND column_name = 'grace_ends_at') OR
        (table_name = 'users'         AND column_name = 'is_demo'));
