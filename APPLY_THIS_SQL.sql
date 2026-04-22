CREATE TABLE fuel_price_changes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('ULP', 'PULP', 'Diesel')),
  old_price DECIMAL(10, 3),
  new_price DECIMAL(10, 3) NOT NULL,
  effective_datetime TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'acknowledged', 'escalated')),
  notes TEXT
);

CREATE TABLE fuel_price_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  price_change_id TEXT NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  operator_user_id TEXT NOT NULL REFERENCES users(id),
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  staff_notified_at TIMESTAMPTZ,
  UNIQUE(price_change_id, operator_user_id)
);

CREATE TABLE fuel_price_acknowledgements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  price_change_id TEXT NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  staff_user_id TEXT NOT NULL REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(price_change_id, staff_user_id)
);

CREATE TABLE fuel_price_escalations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  price_change_id TEXT NOT NULL REFERENCES fuel_price_changes(id) ON DELETE CASCADE,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  escalation_type VARCHAR(20) CHECK (escalation_type IN ('urgent', 'operator')),
  escalated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_fuel_price_changes_site ON fuel_price_changes(site_id);
CREATE INDEX idx_fuel_price_changes_status ON fuel_price_changes(status);
CREATE INDEX idx_fuel_price_changes_effective ON fuel_price_changes(effective_datetime);
CREATE INDEX idx_fuel_price_notifications_price_change ON fuel_price_notifications(price_change_id);
CREATE INDEX idx_fuel_price_acknowledgements_price_change ON fuel_price_acknowledgements(price_change_id);
CREATE INDEX idx_fuel_price_acknowledgements_staff ON fuel_price_acknowledgements(staff_user_id);
CREATE INDEX idx_fuel_price_escalations_price_change ON fuel_price_escalations(price_change_id);
CREATE INDEX idx_fuel_price_escalations_resolved ON fuel_price_escalations(resolved_at);
