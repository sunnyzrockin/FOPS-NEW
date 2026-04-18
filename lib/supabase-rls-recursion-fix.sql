-- =====================================================
-- FIX: Infinite recursion in RLS policies for sites table
-- =====================================================

-- First, drop the existing problematic policies
DROP POLICY IF EXISTS "Owners can view their sites" ON sites;
DROP POLICY IF EXISTS "Operators can view assigned sites" ON sites;
DROP POLICY IF EXISTS "Staff can view assigned sites" ON sites;

-- Create security definer functions to bypass RLS recursion
CREATE OR REPLACE FUNCTION get_user_role_and_id()
RETURNS TABLE(user_id TEXT, user_role TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, role FROM users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_operator_assigned_sites(operator_id TEXT)
RETURNS TABLE(site_id TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT osa.site_id FROM operator_site_assignments osa WHERE osa.operator_user_id = operator_id;
$$;

CREATE OR REPLACE FUNCTION get_staff_assigned_sites(staff_id TEXT)
RETURNS TABLE(site_id TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT ssa.site_id FROM staff_site_assignments ssa WHERE ssa.staff_user_id = staff_id;
$$;

-- Create a single comprehensive policy for sites
CREATE POLICY "Role-based site access" ON sites
  FOR SELECT USING (
    CASE 
      -- Owners can see all their sites
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'owner' THEN
        owner_id = (SELECT user_id FROM get_user_role_and_id())
      -- Operators can see assigned sites
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'operator' THEN
        id IN (SELECT site_id FROM get_operator_assigned_sites((SELECT user_id FROM get_user_role_and_id())))
      -- Staff can see assigned sites
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'staff' THEN
        id IN (SELECT site_id FROM get_staff_assigned_sites((SELECT user_id FROM get_user_role_and_id())))
      ELSE false
    END
  );

-- Fix assignment table policies to use security definer functions
DROP POLICY IF EXISTS "Owners can view operator assignments" ON operator_site_assignments;
DROP POLICY IF EXISTS "Owners can create operator assignments" ON operator_site_assignments;
DROP POLICY IF EXISTS "Owners can delete operator assignments" ON operator_site_assignments;
DROP POLICY IF EXISTS "Operators can view own assignments" ON operator_site_assignments;

-- Recreate operator assignment policies
CREATE POLICY "Operator assignments access" ON operator_site_assignments
  FOR SELECT USING (
    CASE 
      -- Owners can see assignments they created
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'owner' THEN
        assigned_by_owner_id = (SELECT user_id FROM get_user_role_and_id())
      -- Operators can see their own assignments
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'operator' THEN
        operator_user_id = (SELECT user_id FROM get_user_role_and_id())
      ELSE false
    END
  );

CREATE POLICY "Operator assignments create" ON operator_site_assignments
  FOR INSERT WITH CHECK (
    (SELECT user_role FROM get_user_role_and_id()) = 'owner' AND
    assigned_by_owner_id = (SELECT user_id FROM get_user_role_and_id())
  );

CREATE POLICY "Operator assignments delete" ON operator_site_assignments
  FOR DELETE USING (
    (SELECT user_role FROM get_user_role_and_id()) = 'owner' AND
    assigned_by_owner_id = (SELECT user_id FROM get_user_role_and_id())
  );

-- Fix staff assignment policies
DROP POLICY IF EXISTS "Operators can view staff assignments" ON staff_site_assignments;
DROP POLICY IF EXISTS "Operators can create staff assignments" ON staff_site_assignments;
DROP POLICY IF EXISTS "Operators can delete staff assignments" ON staff_site_assignments;
DROP POLICY IF EXISTS "Staff can view own assignments" ON staff_site_assignments;
DROP POLICY IF EXISTS "Owners can view all staff assignments" ON staff_site_assignments;

-- Recreate staff assignment policies
CREATE POLICY "Staff assignments access" ON staff_site_assignments
  FOR SELECT USING (
    CASE 
      -- Owners can see all staff assignments for their sites
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'owner' THEN
        site_id IN (SELECT id FROM sites WHERE owner_id = (SELECT user_id FROM get_user_role_and_id()))
      -- Operators can see assignments they created
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'operator' THEN
        assigned_by_operator_id = (SELECT user_id FROM get_user_role_and_id())
      -- Staff can see their own assignments
      WHEN (SELECT user_role FROM get_user_role_and_id()) = 'staff' THEN
        staff_user_id = (SELECT user_id FROM get_user_role_and_id())
      ELSE false
    END
  );

CREATE POLICY "Staff assignments create" ON staff_site_assignments
  FOR INSERT WITH CHECK (
    (SELECT user_role FROM get_user_role_and_id()) = 'operator' AND
    assigned_by_operator_id = (SELECT user_id FROM get_user_role_and_id())
  );

CREATE POLICY "Staff assignments delete" ON staff_site_assignments
  FOR DELETE USING (
    (SELECT user_role FROM get_user_role_and_id()) = 'operator' AND
    assigned_by_operator_id = (SELECT user_id FROM get_user_role_and_id())
  );