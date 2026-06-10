-- =====================================================================
-- Stripe Subscriptions — Sprint 1 schema
--
-- Per-organisation/owner billing. Each row is one Stripe subscription
-- owned by a `users` row whose role = 'owner'. Operators and staff
-- inherit access via the owner that created them; we never give them a
-- subscription of their own.
--
-- The Stripe webhook is the source of truth for status / period end /
-- price changes. The webhook uses the service-role client and bypasses
-- RLS, so the policies below are intentionally read-only for end users.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TABLE: stripe_customers
-- One Stripe customer per owner. Created on first checkout/portal call.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_customer_id
  ON stripe_customers(stripe_customer_id);

-- ---------------------------------------------------------------------
-- TABLE: subscriptions
-- Mirrors a Stripe subscription row. Updated by /api/stripe/webhook.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,                       -- stripe subscription id (sub_...)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,                      -- trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired | paused
  price_id TEXT,                             -- stripe price id (price_...)
  product_id TEXT,                           -- stripe product id (prod_...)
  plan_tier TEXT,                            -- 'starter' | 'growth' | 'enterprise' (derived from price metadata or our mapping)
  quantity INTEGER DEFAULT 1,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  raw JSONB,                                 -- last raw subscription payload, for debugging
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ---------------------------------------------------------------------
-- TABLE: stripe_webhook_events
-- Idempotency table — we record every event id we've processed so
-- replays (Stripe retries on non-2xx) are no-ops.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,                       -- evt_xxx
  type TEXT NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payload JSONB
);

-- ---------------------------------------------------------------------
-- RLS — read-only access from the owning user. All writes happen via
-- service-role from the webhook / checkout / portal handlers.
-- ---------------------------------------------------------------------
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop & recreate (idempotent)
DROP POLICY IF EXISTS "stripe_customers_owner_read" ON stripe_customers;
CREATE POLICY "stripe_customers_owner_read" ON stripe_customers
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "subscriptions_owner_read" ON subscriptions;
CREATE POLICY "subscriptions_owner_read" ON subscriptions
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Webhook events: nobody reads via RLS. Service role only.
DROP POLICY IF EXISTS "stripe_webhook_events_no_read" ON stripe_webhook_events;
CREATE POLICY "stripe_webhook_events_no_read" ON stripe_webhook_events
  FOR SELECT USING (FALSE);
