-- =====================================================
-- WorkflowLite Database Schema Migration to Supabase
-- =====================================================
-- Instructions:
-- 1. Go to your Supabase Dashboard → SQL Editor
-- 2. Create a new query
-- 3. Copy and paste this entire script
-- 4. Run the query
-- =====================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: users
-- Stores user accounts (Owner, Operator, Staff)
-- Note: Authentication is handled by Supabase Auth
-- This table stores additional user metadata
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);

-- =====================================================
-- TABLE: sites
-- Stores fuel station sites owned by the owner
-- =====================================================
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sites_owner_id ON sites(owner_id);
CREATE INDEX idx_sites_code ON sites(code);
CREATE INDEX idx_sites_location ON sites USING GIN(to_tsvector('english', location));

-- =====================================================
-- TABLE: operator_site_assignments
-- Owner assigns operators to specific sites
-- =====================================================
CREATE TABLE IF NOT EXISTS operator_site_assignments (
  id TEXT PRIMARY KEY,
  operator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  assigned_by_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(operator_user_id, site_id)
);

CREATE INDEX idx_operator_assignments_operator ON operator_site_assignments(operator_user_id);
CREATE INDEX idx_operator_assignments_site ON operator_site_assignments(site_id);

-- =====================================================
-- TABLE: staff_site_assignments
-- Operators assign staff to specific sites
-- =====================================================
CREATE TABLE IF NOT EXISTS staff_site_assignments (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  assigned_by_operator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(staff_user_id, site_id)
);

CREATE INDEX idx_staff_assignments_staff ON staff_site_assignments(staff_user_id);
CREATE INDEX idx_staff_assignments_site ON staff_site_assignments(site_id);

-- =====================================================
-- TABLE: site_field_configs
-- Dynamic field configurations per site
-- Operators can enable/disable fields and customize labels
-- =====================================================
CREATE TABLE IF NOT EXISTS site_field_configs (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('currency', 'number', 'text')),
  is_core BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_id, key)
);

CREATE INDEX idx_field_configs_site ON site_field_configs(site_id);
CREATE INDEX idx_field_configs_enabled ON site_field_configs(site_id, is_enabled);

-- =====================================================
-- TABLE: shift_reports
-- Staff submit shift reports with dynamic data
-- =====================================================
CREATE TABLE IF NOT EXISTS shift_reports (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('Morning', 'Afternoon', 'Night')),
  
  -- Core financial fields
  total_sales DECIMAL(10, 2) DEFAULT 0,
  fuel_sales DECIMAL(10, 2) DEFAULT 0,
  shop_sales DECIMAL(10, 2) DEFAULT 0,
  total_litres DECIMAL(10, 2) DEFAULT 0,
  
  -- Payment methods
  eftpos DECIMAL(10, 2) DEFAULT 0,
  motorpass DECIMAL(10, 2) DEFAULT 0,
  cash DECIMAL(10, 2) DEFAULT 0,
  accounts DECIMAL(10, 2) DEFAULT 0,
  
  -- Shop breakdown
  beverages DECIMAL(10, 2) DEFAULT 0,
  hot_food DECIMAL(10, 2) DEFAULT 0,
  
  -- Other fields
  drive_offs DECIMAL(10, 2) DEFAULT 0,
  dips DECIMAL(10, 2) DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0,
  difference_value DECIMAL(10, 2),
  
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'flagged')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(site_id, date, shift_type)
);

CREATE INDEX idx_shift_reports_site ON shift_reports(site_id);
CREATE INDEX idx_shift_reports_date ON shift_reports(date DESC);
CREATE INDEX idx_shift_reports_submitted_by ON shift_reports(submitted_by_user_id);
CREATE INDEX idx_shift_reports_status ON shift_reports(status);
CREATE INDEX idx_shift_reports_site_date ON shift_reports(site_id, date);

-- =====================================================
-- TABLE: site_banking_formulas
-- Banking formulas configured by operators
-- NOW INCLUDES: visible_to_staff, visible_in_operator_daily_summary
-- =====================================================
CREATE TABLE IF NOT EXISTS site_banking_formulas (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  result_label TEXT,
  formula_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- NEW FIELDS for Banking Formula Enhancement
  visible_to_staff BOOLEAN NOT NULL DEFAULT false,
  visible_in_operator_daily_summary BOOLEAN NOT NULL DEFAULT true,
  
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_banking_formulas_site ON site_banking_formulas(site_id);
CREATE INDEX idx_banking_formulas_active ON site_banking_formulas(site_id, is_active);
CREATE INDEX idx_banking_formulas_visible_staff ON site_banking_formulas(site_id, visible_to_staff);

-- =====================================================
-- TABLE: shift_formula_results (NEW)
-- Stores calculated formula results for each shift
-- This enables live formula display and daily rollups
-- =====================================================
CREATE TABLE IF NOT EXISTS shift_formula_results (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  shift_report_id TEXT NOT NULL REFERENCES shift_reports(id) ON DELETE CASCADE,
  formula_id TEXT NOT NULL REFERENCES site_banking_formulas(id) ON DELETE CASCADE,
  formula_name TEXT NOT NULL,
  result_value DECIMAL(12, 2) NOT NULL,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(shift_report_id, formula_id)
);

CREATE INDEX idx_formula_results_shift ON shift_formula_results(shift_report_id);
CREATE INDEX idx_formula_results_formula ON shift_formula_results(formula_id);

-- =====================================================
-- TABLE: fuel_price_entries
-- Own site fuel prices entered by operators
-- =====================================================
CREATE TABLE IF NOT EXISTS fuel_price_entries (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  entered_by_user_id TEXT NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('ULP', 'Diesel', 'Premium', 'E10', 'LPG')),
  price DECIMAL(6, 2) NOT NULL,
  entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(site_id, date, fuel_type)
);

CREATE INDEX idx_fuel_prices_site ON fuel_price_entries(site_id);
CREATE INDEX idx_fuel_prices_date ON fuel_price_entries(date DESC);
CREATE INDEX idx_fuel_prices_site_date ON fuel_price_entries(site_id, date);

-- =====================================================
-- TABLE: site_competitors
-- Competitor fuel stations near each site
-- =====================================================
CREATE TABLE IF NOT EXISTS site_competitors (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  distance_km DECIMAL(5, 1),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_competitors_site ON site_competitors(site_id);

-- =====================================================
-- TABLE: competitor_fuel_prices
-- Competitor fuel prices tracked by operators
-- =====================================================
CREATE TABLE IF NOT EXISTS competitor_fuel_prices (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES site_competitors(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  entered_by_user_id TEXT NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('ULP', 'Diesel', 'Premium', 'E10', 'LPG')),
  price DECIMAL(6, 2) NOT NULL,
  entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_competitor_prices_competitor ON competitor_fuel_prices(competitor_id);
CREATE INDEX idx_competitor_prices_site ON competitor_fuel_prices(site_id);
CREATE INDEX idx_competitor_prices_date ON competitor_fuel_prices(date DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Implement strict 3-tier hierarchy access control
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_field_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_banking_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_formula_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_fuel_prices ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: users table
-- =====================================================
CREATE POLICY "Users can view themselves" ON users
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update themselves" ON users
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- =====================================================
-- RLS POLICIES: sites table
-- =====================================================
-- Owners can see all their sites
CREATE POLICY "Owners can view their sites" ON sites
  FOR SELECT USING (
    owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Operators can see assigned sites
CREATE POLICY "Operators can view assigned sites" ON sites
  FOR SELECT USING (
    id IN (
      SELECT site_id FROM operator_site_assignments 
      WHERE operator_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Staff can see assigned sites
CREATE POLICY "Staff can view assigned sites" ON sites
  FOR SELECT USING (
    id IN (
      SELECT site_id FROM staff_site_assignments 
      WHERE staff_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- =====================================================
-- RLS POLICIES: shift_reports table
-- =====================================================
-- Staff can view their own reports
CREATE POLICY "Staff can view their reports" ON shift_reports
  FOR SELECT USING (
    submitted_by_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Staff can create reports for assigned sites
CREATE POLICY "Staff can create reports" ON shift_reports
  FOR INSERT WITH CHECK (
    site_id IN (
      SELECT site_id FROM staff_site_assignments 
      WHERE staff_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Operators can view reports from their assigned sites
CREATE POLICY "Operators can view site reports" ON shift_reports
  FOR SELECT USING (
    site_id IN (
      SELECT site_id FROM operator_site_assignments 
      WHERE operator_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Owners can view all reports from their sites
CREATE POLICY "Owners can view all site reports" ON shift_reports
  FOR SELECT USING (
    site_id IN (
      SELECT id FROM sites WHERE owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- =====================================================
-- Note: Add more RLS policies as needed for production
-- For development/pilot, we'll handle most access control in application logic
-- =====================================================

-- =====================================================
-- Success Message
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE 'WorkflowLite database schema created successfully!';
  RAISE NOTICE 'Next step: Run the seed data script or use the /api/seed endpoint';
END $$;
