-- =====================================================
-- FIX: Add missing RLS policies for assignment tables
-- =====================================================

-- =====================================================
-- RLS POLICIES: operator_site_assignments table
-- =====================================================

-- Owners can view all operator assignments
CREATE POLICY IF NOT EXISTS "Owners can view operator assignments" ON operator_site_assignments
  FOR SELECT USING (
    assigned_by_owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Owners can create operator assignments
CREATE POLICY IF NOT EXISTS "Owners can create operator assignments" ON operator_site_assignments
  FOR INSERT WITH CHECK (
    assigned_by_owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Owners can delete operator assignments
CREATE POLICY IF NOT EXISTS "Owners can delete operator assignments" ON operator_site_assignments
  FOR DELETE USING (
    assigned_by_owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Operators can view their own assignments
CREATE POLICY IF NOT EXISTS "Operators can view own assignments" ON operator_site_assignments
  FOR SELECT USING (
    operator_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- =====================================================
-- RLS POLICIES: staff_site_assignments table
-- =====================================================

-- Operators can view staff assignments they created
CREATE POLICY IF NOT EXISTS "Operators can view staff assignments" ON staff_site_assignments
  FOR SELECT USING (
    assigned_by_operator_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Operators can create staff assignments
CREATE POLICY IF NOT EXISTS "Operators can create staff assignments" ON staff_site_assignments
  FOR INSERT WITH CHECK (
    assigned_by_operator_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Operators can delete staff assignments
CREATE POLICY IF NOT EXISTS "Operators can delete staff assignments" ON staff_site_assignments
  FOR DELETE USING (
    assigned_by_operator_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Staff can view their own assignments
CREATE POLICY IF NOT EXISTS "Staff can view own assignments" ON staff_site_assignments
  FOR SELECT USING (
    staff_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Owners can view all staff assignments (for their sites)
CREATE POLICY IF NOT EXISTS "Owners can view all staff assignments" ON staff_site_assignments
  FOR SELECT USING (
    site_id IN (SELECT id FROM sites WHERE owner_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()))
  );
