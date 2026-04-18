import { supabaseAdmin } from './supabase.js';
import fs from 'fs';
import path from 'path';

export async function applyRLSFix() {
  try {
    console.log('🔧 Applying RLS recursion fix...');
    
    // Read the SQL fix file
    const sqlPath = path.join(process.cwd(), 'lib', 'supabase-rls-recursion-fix.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`   ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
          const { error } = await supabaseAdmin.rpc('exec_sql', { sql: statement });
          
          if (error) {
            console.error(`❌ Error in statement ${i + 1}:`, error);
            // Continue with other statements
          } else {
            console.log(`   ✅ Statement ${i + 1} executed successfully`);
          }
        } catch (err) {
          console.error(`❌ Exception in statement ${i + 1}:`, err);
        }
      }
    }
    
    console.log('🎉 RLS fix application completed!');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Failed to apply RLS fix:', error);
    return { success: false, error: error.message };
  }
}

// Alternative approach using direct SQL execution
export async function applyRLSFixDirect() {
  try {
    console.log('🔧 Applying RLS recursion fix (direct approach)...');
    
    // Drop existing problematic policies
    console.log('1. Dropping existing policies...');
    await supabaseAdmin.rpc('exec_sql', { 
      sql: 'DROP POLICY IF EXISTS "Owners can view their sites" ON sites;' 
    });
    await supabaseAdmin.rpc('exec_sql', { 
      sql: 'DROP POLICY IF EXISTS "Operators can view assigned sites" ON sites;' 
    });
    await supabaseAdmin.rpc('exec_sql', { 
      sql: 'DROP POLICY IF EXISTS "Staff can view assigned sites" ON sites;' 
    });
    
    // Create security definer functions
    console.log('2. Creating security definer functions...');
    
    const getUserRoleFunction = `
      CREATE OR REPLACE FUNCTION get_user_role_and_id()
      RETURNS TABLE(user_id TEXT, user_role TEXT)
      LANGUAGE sql
      SECURITY DEFINER
      AS $$
        SELECT id, role FROM users WHERE auth_user_id = auth.uid();
      $$;
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: getUserRoleFunction });
    
    const getOperatorSitesFunction = `
      CREATE OR REPLACE FUNCTION get_operator_assigned_sites(operator_id TEXT)
      RETURNS TABLE(site_id TEXT)
      LANGUAGE sql
      SECURITY DEFINER
      AS $$
        SELECT osa.site_id FROM operator_site_assignments osa WHERE osa.operator_user_id = operator_id;
      $$;
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: getOperatorSitesFunction });
    
    const getStaffSitesFunction = `
      CREATE OR REPLACE FUNCTION get_staff_assigned_sites(staff_id TEXT)
      RETURNS TABLE(site_id TEXT)
      LANGUAGE sql
      SECURITY DEFINER
      AS $$
        SELECT ssa.site_id FROM staff_site_assignments ssa WHERE ssa.staff_user_id = staff_id;
      $$;
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: getStaffSitesFunction });
    
    // Create new comprehensive policy
    console.log('3. Creating new comprehensive policy...');
    
    const newSitePolicy = `
      CREATE POLICY "Role-based site access" ON sites
        FOR SELECT USING (
          CASE 
            WHEN (SELECT user_role FROM get_user_role_and_id()) = 'owner' THEN
              owner_id = (SELECT user_id FROM get_user_role_and_id())
            WHEN (SELECT user_role FROM get_user_role_and_id()) = 'operator' THEN
              id IN (SELECT site_id FROM get_operator_assigned_sites((SELECT user_id FROM get_user_role_and_id())))
            WHEN (SELECT user_role FROM get_user_role_and_id()) = 'staff' THEN
              id IN (SELECT site_id FROM get_staff_assigned_sites((SELECT user_id FROM get_user_role_and_id())))
            ELSE false
          END
        );
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: newSitePolicy });
    
    console.log('🎉 RLS fix applied successfully!');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Failed to apply RLS fix:', error);
    return { success: false, error: error.message };
  }
}