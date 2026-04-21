-- Fuel Price Management Schema for FOPS
-- Drop existing tables if they exist
DROP TABLE IF EXISTS fuel_price_escalations CASCADE;
DROP TABLE IF EXISTS fuel_price_acknowledgements CASCADE;
DROP TABLE IF EXISTS fuel_price_notifications CASCADE;
DROP TABLE IF EXISTS fuel_price_changes CASCADE;

-- Main fuel price changes table
CREATE TABLE fuel_price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('ULP', 'PULP', 'Diesel')),
  old_price DECIMAL(10, 3),
  new_price DECIMAL(10, 3) NOT NULL,
  effective_datetime TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'acknowledged', 'escalated')),
  notes TEXT
);

-- Operator notifications tracking
CREATE TABLE fuel_price_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_change_id UUID NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  operator_user_id UUID NOT NULL REFERENCES users(id),
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  staff_notified_at TIMESTAMPTZ,
  UNIQUE(price_change_id, operator_user_id)
);

-- Staff acknowledgements
CREATE TABLE fuel_price_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_change_id UUID NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(price_change_id, staff_user_id)
);

-- Escalation tracking
CREATE TABLE fuel_price_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_change_id UUID NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  escalation_type VARCHAR(20) CHECK (escalation_type IN ('urgent', 'operator')),
  escalated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_fuel_price_changes_site ON fuel_price_changes(site_id);
CREATE INDEX idx_fuel_price_changes_status ON fuel_price_changes(status);
CREATE INDEX idx_fuel_price_changes_effective ON fuel_price_changes(effective_datetime);
CREATE INDEX idx_fuel_price_notifications_price_change ON fuel_price_notifications(price_change_id);
CREATE INDEX idx_fuel_price_acknowledgements_price_change ON fuel_price_acknowledgements(price_change_id);
CREATE INDEX idx_fuel_price_acknowledgements_staff ON fuel_price_acknowledgements(staff_user_id);
CREATE INDEX idx_fuel_price_escalations_price_change ON fuel_price_escalations(price_change_id);
CREATE INDEX idx_fuel_price_escalations_resolved ON fuel_price_escalations(resolved_at);

-- Enable Row Level Security (disabled for pilot, will be enabled later)
ALTER TABLE fuel_price_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_escalations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (currently permissive for pilot testing)
CREATE POLICY "Allow all for development" ON fuel_price_changes FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON fuel_price_notifications FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON fuel_price_acknowledgements FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON fuel_price_escalations FOR ALL USING (true);

-- Comments for documentation
COMMENT ON TABLE fuel_price_changes IS 'Stores fuel price change requests created by owners';
COMMENT ON TABLE fuel_price_notifications IS 'Tracks when operators are notified and when they notify staff';
COMMENT ON TABLE fuel_price_acknowledgements IS 'Records staff acknowledgements of price changes';
COMMENT ON TABLE fuel_price_escalations IS 'Tracks escalations for unacknowledged price changes';
