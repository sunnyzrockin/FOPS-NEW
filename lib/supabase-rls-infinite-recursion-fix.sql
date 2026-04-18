-- =====================================================
-- FIX: RLS Infinite Recursion in Sites Table
-- =====================================================
-- Problem: Sites policies reference assignment tables which reference users
-- causing circular RLS evaluation
-- Solution: Use SECURITY DEFINER functions to bypass RLS in subqueries
-- =====================================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Owners can view their sites" ON sites;
DROP POLICY IF EXISTS "Operators can view assigned sites" ON sites;
DROP POLICY IF EXISTS "Staff can view assigned sites" ON sites;

-- Create SECURITY DEFINER helper functions (bypass RLS)
CREATE OR REPLACE FUNCTION get_user_id_from_auth()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION get_operator_site_ids()
RETURNS TABLE(site_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT operator_site_assignments.site_id
  FROM operator_site_assignments
  WHERE operator_site_assignments.operator_user_id = get_user_id_from_auth();
END;
$$;

CREATE OR REPLACE FUNCTION get_staff_site_ids()
RETURNS TABLE(site_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT staff_site_assignments.site_id
  FROM staff_site_assignments
  WHERE staff_site_assignments.staff_user_id = get_user_id_from_auth();
END;
$$;

-- Recreate sites policies using SECURITY DEFINER functions (no recursion)
CREATE POLICY "Owners can view their sites" ON sites
  FOR SELECT
  USING (owner_id = get_user_id_from_auth());

CREATE POLICY "Operators can view assigned sites" ON sites
  FOR SELECT
  USING (id IN (SELECT site_id FROM get_operator_site_ids()));

CREATE POLICY "Staff can view assigned sites" ON sites
  FOR SELECT
  USING (id IN (SELECT site_id FROM get_staff_site_ids()));

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'RLS infinite recursion fix applied successfully!';
  RAISE NOTICE 'Sites table policies now use SECURITY DEFINER functions';
END $$;
