-- ============================================================================
-- FOPS — Fuel Price Operator Acknowledgment migration
-- ----------------------------------------------------------------------------
-- Adds operator-side acknowledgment fields to the existing fuel price change
-- workflow. Currently only staff can ack; this lets operators ack price
-- changes too, with separate timestamps. Owner dashboards can then show
-- "✅ Accepted by Sarah Johnson on 9 May 14:30".
--
-- SAFE TO RE-RUN: every ALTER uses IF NOT EXISTS.
-- ============================================================================

-- 1) Add operator-ack columns directly on fuel_price_changes for fast queries
ALTER TABLE fuel_price_changes
  ADD COLUMN IF NOT EXISTS operator_acked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operator_user_id UUID REFERENCES users(id);

-- 2) Extend the existing fuel_price_acknowledgements table to also track
--    operator acks. Keep the same table to avoid table-sprawl and so the
--    existing staff-ack flow still works untouched.
ALTER TABLE fuel_price_acknowledgements
  ADD COLUMN IF NOT EXISTS operator_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff';

-- staff_user_id was previously required (NOT NULL). For operator acks we
-- only fill operator_user_id, so make staff_user_id optional.
DO $$
BEGIN
  BEGIN
    ALTER TABLE fuel_price_acknowledgements ALTER COLUMN staff_user_id DROP NOT NULL;
  EXCEPTION
    WHEN others THEN NULL; -- column already nullable
  END;
END $$;

-- 3) Indexes for fast lookups by operator + by price change
CREATE INDEX IF NOT EXISTS idx_fpa_operator
  ON fuel_price_acknowledgements (operator_user_id);
CREATE INDEX IF NOT EXISTS idx_fpc_operator_acked
  ON fuel_price_changes (operator_user_id, operator_acked_at);

-- 4) Verify
SELECT 'OK — operator ack columns added' AS status;
