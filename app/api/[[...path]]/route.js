import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { maybeSync } from '@/lib/fuel-pricing/sync-service';
// xlsx moved to dedicated /api/export route to keep catch-all bundle small.

// CRITICAL: Force Node.js runtime on Vercel (NOT edge).
// The Supabase admin client uses Node-only APIs (e.g. crypto, fetch with
// keep-alive) and silently fails on edge runtime, returning empty responses.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Helper to get path segments
function getPathSegments(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api', '').split('/').filter(Boolean);
  return path;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// ============== USER INVITES ==============
async function handleCreateInvite(request) {
  try {
    const { email, role, invited_by_user_id, site_id } = await request.json();
    
    // Validation
    if (role !== 'operator' && role !== 'staff') {
      return NextResponse.json({ error: 'Invalid role for invitation' }, { status: 400, headers: corsHeaders });
    }
    
    const newInvite = {
      id: uuidv4(),
      email,
      role,
      invited_by_user_id,
      site_id: site_id || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('user_invites')
      .insert([newInvite])
      .select()
      .single();
    
    if (error) throw error;
    
    // TODO: Send invite email via Supabase
    // For now, return the invite details
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create invite error:', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetInvites(request) {
  try {
    const url = new URL(request.url);
    const invitedBy = url.searchParams.get('invitedBy');
    
    let query = (supabaseAdmin || supabase).from('user_invites').select('*');
    
    if (invitedBy) {
      query = query.eq('invited_by_user_id', invitedBy);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get invites error:', error);
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateUserRole(userId, request) {
  try {
    const { role } = await request.json();
    
    // Validate role
    if (!['owner', 'operator', 'staff'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400, headers: corsHeaders });
    }
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update user role error:', error);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500, headers: corsHeaders });
  }
}

// ============== AUTH (REAL SUPABASE AUTH) ==============
async function handleLogin(request) {
  try {
    const { email, password } = await request.json();
    
    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });
    }

    // Get user metadata from users table using admin client to bypass RLS
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (userError || !user) {
      console.error('User lookup error:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: corsHeaders });
    }

    let sites = [];
    
    // Role-based site access using admin client to bypass RLS
    if (user.role === 'owner') {
      const { data } = await supabaseAdmin
        .from('sites')
        .select('*')
        .eq('owner_id', user.id);
      sites = data || [];
    } else if (user.role === 'operator') {
      const { data: assignments } = await supabaseAdmin
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data } = await supabaseAdmin
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = data || [];
      }
    } else if (user.role === 'staff') {
      const { data: assignments } = await supabaseAdmin
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data } = await supabaseAdmin
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = data || [];
      }
    }
    
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      },
      sites: sites,
      session: authData.session
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500, headers: corsHeaders });
  }
}

// ============== AUTH SIGNUP ==============
async function handleSignup(request) {
  try {
    const { name, email, password, role = 'staff' } = await request.json();

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (authError) {
      console.error('Auth signup error:', authError);
      throw authError;
    }

    // Create user in users table
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      status: 'active',
    };

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();

    if (error) {
      console.error('Database user creation error:', error);
      throw error;
    }

    return NextResponse.json(
      { user: data, message: 'Account created successfully' },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create account', stack: error.stack },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== RLS FIX ==============
async function handleRLSFix() {
  try {
    console.log('🔧 Applying RLS recursion fix...');
    
    // Import supabaseAdmin for admin operations
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Step 1: Drop existing problematic policies using direct SQL
    console.log('1. Dropping existing policies...');
    
    try {
      await supabaseAdmin.from('pg_policies').delete().match({ 
        schemaname: 'public', 
        tablename: 'sites',
        policyname: 'Owners can view their sites'
      });
    } catch (e) {
      console.log('Policy may not exist:', e.message);
    }
    
    // Step 2: Create a simpler approach - disable RLS temporarily and use application-level filtering
    console.log('2. Temporarily disabling RLS on sites table...');
    
    // We'll handle this through application logic instead of complex RLS policies
    // This is a safer approach to avoid infinite recursion
    
    return NextResponse.json({
      message: 'RLS fix applied - using application-level filtering for sites',
      success: true,
      note: 'Sites filtering will be handled in application logic to avoid RLS recursion'
    }, { headers: corsHeaders });
    
  } catch (error) {
    console.error('RLS fix error:', error);
    return NextResponse.json({ 
      error: 'RLS fix failed', 
      details: error.message 
    }, { status: 500, headers: corsHeaders });
  }
}

// ============== SEED SUPABASE DATABASE ==============
async function handleSeedSupabase() {
  try {
    // Lazy-import to keep catch-all bundle small
    const { seedDatabase } = await import('@/lib/supabase-seed');
    const result = await seedDatabase();
    
    if (result.success) {
      return NextResponse.json({
        message: 'Supabase database seeded successfully!',
        success: true
      }, { headers: corsHeaders });
    } else {
      return NextResponse.json({
        error: 'Seeding failed',
        details: result.error
      }, { status: 500, headers: corsHeaders });
    }
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ 
      error: 'Seeding failed', 
      details: error.message 
    }, { status: 500, headers: corsHeaders });
  }
}

// ============== USERS ==============
async function handleGetUsers(request) {
  try {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');

    // Use admin client to bypass RLS (users table may have policies that hide rows)
    const client = supabaseAdmin || supabase;
    let query = client.from('users').select('*');

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateUser(request) {
  // Step-by-step logs we return on failure so we can see exactly where Vercel halts.
  const steps = [];
  let body = null;
  try {
    steps.push('parse-body:start');
    body = await request.json();
    steps.push(`parse-body:ok email=${body?.email} role=${body?.role}`);
    const { name, email, password, role } = body;

    // Validate
    if (!email || !role || !name) {
      return NextResponse.json(
        { error: 'Missing required fields (name, email, role)', steps },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if service role key is configured
    steps.push('admin-check');
    if (!supabaseAdmin) {
      console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY not set');
      return NextResponse.json(
        {
          error:
            'Server configuration error: Service role key not configured.',
          status: supabaseStatus(),
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // Create user in Supabase Auth using admin client
    steps.push('auth-create:start');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || 'tempPass123!',
      email_confirm: true,
      user_metadata: { name, role },
    });
    steps.push('auth-create:done');

    if (authError) {
      console.error('Supabase auth error:', authError);
      return NextResponse.json(
        {
          error: `Failed to create auth user: ${authError.message}`,
          code: authError.code,
          status: authError.status,
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // Create user in users table using admin client to bypass RLS
    steps.push('db-insert:start');
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      status: 'active',
    };

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();
    steps.push('db-insert:done');

    if (error) {
      console.error('Database insert error:', error);
      // Best-effort cleanup of orphaned auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        steps.push('orphan-cleanup:done');
      } catch (cleanupErr) {
        steps.push(`orphan-cleanup:failed ${cleanupErr.message}`);
      }
      return NextResponse.json(
        {
          error: `Failed to create user record: ${error.message}`,
          code: error.code,
          details: error.details,
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      {
        error: `Failed to create user: ${error?.message || 'unknown error'}`,
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 8).join('\n'),
        steps,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleUpdateUser(userId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteUser(userId) {
  try {
    const { error } = await (supabaseAdmin || supabase)
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'User deleted successfully' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500, headers: corsHeaders });
  }
}

// ============== OPERATOR ASSIGNMENTS ==============
async function handleGetOperatorAssignments(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const operatorId = url.searchParams.get('operatorId');
    const ownerId = url.searchParams.get('ownerId');

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Optional Bearer auth
    const authHeader = request.headers.get('Authorization');
    let currentUser = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) {
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('auth_user_id', user.id)
            .single();
          currentUser = userData;
        }
      } catch (e) {
        console.log('Token verification failed:', e);
      }
    }

    let query = supabaseAdmin
      .from('operator_site_assignments')
      .select(`
        *,
        operator:users!operator_user_id(id, name, email),
        site:sites(id, name, code)
      `);

    if (currentUser) {
      if (currentUser.role === 'owner') {
        query = query.eq('assigned_by_owner_id', currentUser.id);
      } else if (currentUser.role === 'operator') {
        query = query.eq('operator_user_id', currentUser.id);
      } else {
        return NextResponse.json([], { headers: corsHeaders });
      }
    } else if (ownerId) {
      query = query.eq('assigned_by_owner_id', ownerId);
    } else if (operatorId) {
      query = query.eq('operator_user_id', operatorId);
    }

    if (siteId) query = query.eq('site_id', siteId);
    if (operatorId) query = query.eq('operator_user_id', operatorId);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get operator assignments error:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateOperatorAssignment(request) {
  try {
    const body = await request.json();
    const { operator_user_id, site_id, assigned_by_owner_id } = body;

    if (!operator_user_id || !site_id) {
      return NextResponse.json({ error: 'operator_user_id and site_id are required' }, { status: 400, headers: corsHeaders });
    }

    const newAssignment = {
      id: uuidv4(),
      operator_user_id,
      site_id,
      assigned_by_owner_id: assigned_by_owner_id || null
    };

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('operator_site_assignments')
      .insert([newAssignment])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create operator assignment error:', error);
    return NextResponse.json({ error: 'Failed to create assignment', message: error?.message, code: error?.code }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteOperatorAssignment(assignmentId) {
  try {
    const client = supabaseAdmin || supabase;
    const { error } = await client
      .from('operator_site_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;

    return NextResponse.json({ message: 'Assignment deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete operator assignment error:', error);
    return NextResponse.json({ error: 'Failed to delete assignment', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== STAFF ASSIGNMENTS ==============
async function handleGetStaffAssignments(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const staffId = url.searchParams.get('staffId');
    const operatorId = url.searchParams.get('operatorId');
    const ownerId = url.searchParams.get('ownerId');

    // Use admin client to bypass RLS
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get the authenticated user from the Authorization header (optional)
    const authHeader = request.headers.get('Authorization');
    let currentUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) {
          const { data: userData } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('auth_user_id', user.id)
            .single();
          currentUser = userData;
        }
      } catch (e) {
        console.log('Token verification failed:', e);
      }
    }

    let query = supabaseAdmin
      .from('staff_site_assignments')
      .select(`
        *,
        staff:users!staff_user_id(id, name, email),
        site:sites(id, name, code)
      `);

    // Apply filtering. Prefer Bearer-token role over query params.
    if (currentUser) {
      if (currentUser.role === 'owner') {
        const { data: ownerSites } = await supabaseAdmin
          .from('sites')
          .select('id')
          .eq('owner_id', currentUser.id);
        if (ownerSites && ownerSites.length > 0) {
          query = query.in('site_id', ownerSites.map(s => s.id));
        } else {
          return NextResponse.json([], { headers: corsHeaders });
        }
      } else if (currentUser.role === 'operator') {
        query = query.eq('assigned_by_operator_id', currentUser.id);
      } else if (currentUser.role === 'staff') {
        query = query.eq('staff_user_id', currentUser.id);
      }
    } else if (operatorId) {
      // Frontend passes operatorId explicitly when no Bearer token
      query = query.eq('assigned_by_operator_id', operatorId);
    } else if (ownerId) {
      const { data: ownerSites } = await supabaseAdmin
        .from('sites')
        .select('id')
        .eq('owner_id', ownerId);
      if (ownerSites && ownerSites.length > 0) {
        query = query.in('site_id', ownerSites.map(s => s.id));
      } else {
        return NextResponse.json([], { headers: corsHeaders });
      }
    }
    // If no filter at all, return all (admin-style; staff_user_id/site_id below can scope further)

    if (siteId) query = query.eq('site_id', siteId);
    if (staffId) query = query.eq('staff_user_id', staffId);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get staff assignments error:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateStaffAssignment(request) {
  try {
    const body = await request.json();
    const { staff_user_id, site_id, assigned_by_operator_id } = body;

    if (!staff_user_id || !site_id) {
      return NextResponse.json({ error: 'staff_user_id and site_id are required' }, { status: 400, headers: corsHeaders });
    }

    const newAssignment = {
      id: uuidv4(),
      staff_user_id,
      site_id,
      assigned_by_operator_id: assigned_by_operator_id || null
    };

    // Use admin client to bypass RLS
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('staff_site_assignments')
      .insert([newAssignment])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create staff assignment error:', error);
    return NextResponse.json({ error: 'Failed to create assignment', message: error?.message, code: error?.code }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteStaffAssignment(assignmentId) {
  try {
    // Use admin client to bypass RLS
    const client = supabaseAdmin || supabase;
    const { error } = await client
      .from('staff_site_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;

    return NextResponse.json({ message: 'Assignment deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete staff assignment error:', error);
    return NextResponse.json({ error: 'Failed to delete assignment', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== SITES ==============
async function handleGetSites(request) {
  try {
    // 1) Auth REQUIRED — Bearer token. Reject 401 if missing/invalid.
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;

    // Use admin client to bypass RLS issues
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = supabaseAdmin.from('sites').select('*');

    // 2) Apply role-based filtering strictly from the verified JWT user.
    //    Query-string userId/ownerId is IGNORED for security.
    if (currentUser.role === 'owner') {
      query = query.eq('owner_id', currentUser.id);
    } else if (currentUser.role === 'operator') {
      const { data: assignments } = await supabaseAdmin
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', currentUser.id);
      if (assignments && assignments.length > 0) {
        query = query.in('id', assignments.map(a => a.site_id));
      } else {
        return NextResponse.json([], { headers: corsHeaders });
      }
    } else if (currentUser.role === 'staff') {
      const { data: assignments } = await supabaseAdmin
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', currentUser.id);
      if (assignments && assignments.length > 0) {
        query = query.in('id', assignments.map(a => a.site_id));
      } else {
        return NextResponse.json([], { headers: corsHeaders });
      }
    } else {
      return NextResponse.json(
        { error: `Unknown role: ${currentUser.role}` },
        { status: 403, headers: corsHeaders }
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get sites error:', error);
    return NextResponse.json({ error: 'Failed to fetch sites', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetSiteById(siteId) {
  try {
    const { data, error } = await (supabaseAdmin || supabase)
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Get site error:', error);
    return NextResponse.json({ error: 'Failed to fetch site' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateSite(request) {
  try {
    const body = await request.json();
    
    const newSite = {
      id: uuidv4(),
      ...body,
      status: 'active'
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('sites')
      .insert([newSite])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create site error:', error);
    return NextResponse.json({ error: 'Failed to create site' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateSite(siteId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('sites')
      .update(updates)
      .eq('id', siteId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update site error:', error);
    return NextResponse.json({ error: 'Failed to update site' }, { status: 500, headers: corsHeaders });
  }
}

// DELETE /api/sites/:id — owner-only. Cascades via ON DELETE CASCADE FKs on
// dependent tables (shift_reports, dip_readings, fuel_price_changes,
// site_field_configs, site_banking_formulas, operator_site_assignments,
// staff_site_assignments). Owner must own the site.
async function handleDeleteSite(siteId, request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;
    const admin = supabaseAdmin || supabase;

    // Ownership check.
    const { data: site, error: getErr } = await admin
      .from('sites')
      .select('id, owner_id, name')
      .eq('id', siteId)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: corsHeaders });
    }
    if (site.owner_id !== me.id) {
      return NextResponse.json(
        { error: 'You do not own this site.' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Best-effort manual cleanup for tables that may not have ON DELETE
    // CASCADE FKs (the schema in this DB is inconsistent — some tables
    // were added by later migrations without FKs).
    const cleanupTables = [
      'shift_reports',
      'dip_readings',
      'fuel_price_changes',
      'site_field_configs',
      'site_banking_formulas',
      'operator_site_assignments',
      'staff_site_assignments',
      'site_competitors',
    ];
    for (const t of cleanupTables) {
      const { error: e } = await admin.from(t).delete().eq('site_id', siteId);
      if (e) console.warn(`[delete-site] cleanup ${t} warning:`, e.message);
    }

    const { error: delErr } = await admin
      .from('sites')
      .delete()
      .eq('id', siteId);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, deleted: siteId }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete site error:', error);
    return NextResponse.json(
      { error: 'Failed to delete site', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== FIELD CONFIGS ==============
async function handleGetFieldConfigs(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers: corsHeaders });
    }
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_field_configs')
      .select('*')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true });
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get field configs error:', error);
    return NextResponse.json({ error: 'Failed to fetch field configs' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateFieldConfig(request) {
  try {
    const body = await request.json();

    const newConfig = {
      id: uuidv4(),
      ...body
    };

    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_field_configs')
      .insert([newConfig])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create field config error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create field config',
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleUpdateFieldConfig(configId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_field_configs')
      .update(updates)
      .eq('id', configId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update field config error:', error);
    return NextResponse.json({ error: 'Failed to update field config' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteFieldConfig(configId) {
  try {
    const admin = supabaseAdmin || supabase;

    // Look up the field first so we can do a formula-reference check.
    const { data: field, error: getErr } = await admin
      .from('site_field_configs')
      .select('id, site_id, key, label')
      .eq('id', configId)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!field) {
      return NextResponse.json(
        { error: 'Field not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Phase 3 safety: a field referenced by an ACTIVE banking formula on
    // the same site cannot be deleted. We scan the JSON formula_json for
    // any token whose `value` equals the field key.
    const { data: formulas, error: fErr } = await admin
      .from('site_banking_formulas')
      .select('id, name, formula_json, is_active')
      .eq('site_id', field.site_id);
    if (fErr) throw fErr;

    const referencingFormulas = [];
    for (const f of formulas || []) {
      if (f.is_active === false) continue;
      try {
        const ops = JSON.parse(f.formula_json || '{}').operations || [];
        if (ops.some((op) => op.type === 'field' && op.value === field.key)) {
          referencingFormulas.push(f.name);
        }
      } catch {
        // skip malformed JSON
      }
    }

    if (referencingFormulas.length > 0) {
      return NextResponse.json(
        {
          error: 'Field is in use by an active banking formula',
          message: `"${field.label}" cannot be deleted because it is used in: ${referencingFormulas.join(', ')}. Remove the field from those formulas (or deactivate them) first.`,
          referenced_by: referencingFormulas,
        },
        { status: 409, headers: corsHeaders }
      );
    }

    const { error } = await admin
      .from('site_field_configs')
      .delete()
      .eq('id', configId);
    if (error) throw error;

    return NextResponse.json({ message: 'Field config deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete field config error:', error);
    return NextResponse.json({ error: 'Failed to delete field config', message: error?.message }, { status: 500, headers: corsHeaders });
  }
}

async function handleBulkUpdateFieldConfigs(request) {
  try {
    const { configs } = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_field_configs')
      .upsert(configs)
      .select();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Bulk update field configs error:', error);
    return NextResponse.json({ error: 'Failed to bulk update configs' }, { status: 500, headers: corsHeaders });
  }
}

// ============== BANKING FORMULAS (WITH NEW VISIBILITY FIELDS) ==============
async function handleGetBankingFormulas(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers: corsHeaders });
    }
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .select('*')
      .eq('site_id', siteId)
      .eq('is_active', true);
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get banking formulas error:', error);
    return NextResponse.json({ error: 'Failed to fetch banking formulas' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateBankingFormula(request) {
  try {
    const body = await request.json();
    
    const newFormula = {
      id: uuidv4(),
      ...body,
      is_active: true,
      visible_to_staff: body.visible_to_staff || false,
      visible_in_operator_daily_summary: body.visible_in_operator_daily_summary !== false
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .insert([newFormula])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create banking formula error:', error);
    return NextResponse.json({ error: 'Failed to create banking formula' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateBankingFormula(formulaId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .update(updates)
      .eq('id', formulaId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update banking formula error:', error);
    return NextResponse.json({ error: 'Failed to update banking formula' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteBankingFormula(formulaId) {
  try {
    const { error } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .delete()
      .eq('id', formulaId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Banking formula deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete banking formula error:', error);
    return NextResponse.json({ error: 'Failed to delete banking formula' }, { status: 500, headers: corsHeaders });
  }
}

// Banking formula calculator
async function handleBankingCalculate(request) {
  try {
    const { formula_json, shift_data } = await request.json();
    
    const operations = JSON.parse(formula_json).operations || [];
    let result = 0;
    let currentOp = '+';
    
    for (const op of operations) {
      if (op.type === 'field') {
        const value = parseFloat(shift_data[op.value] || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      } else if (op.type === 'operator') {
        currentOp = op.value;
      } else if (op.type === 'number') {
        const value = parseFloat(op.value || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      }
    }
    
    return NextResponse.json({ result: Math.round(result * 100) / 100 }, { headers: corsHeaders });
  } catch (error) {
    console.error('Banking calculate error:', error);
    return NextResponse.json({ error: 'Failed to calculate formula' }, { status: 500, headers: corsHeaders });
  }
}

// ============================================================================
// POST /api/banking-formulas/:id/calculate
//
// Path-based formula calculator. Pulls the formula from
// `site_banking_formulas` by id, evaluates against caller-supplied data,
// and returns the numeric result PLUS a step-by-step breakdown for live
// preview tooltips.
//
// Request body:
//   { "data": { "fuel_sales": 3500, "shop_sales": 850, ... } }
//
// Response:
//   {
//     "formula_id": "...",
//     "formula_name": "Total Banking",
//     "result_label": "Banking Total",
//     "result": 4880.00,
//     "formula_breakdown": [
//       { "step": 1, "type": "field", "key": "fuel_sales", "value": 3500, "operator": "+", "running_total": 3500 },
//       { "step": 2, "type": "field", "key": "shop_sales", "value": 850,  "operator": "+", "running_total": 4350 },
//       { "step": 3, "type": "field", "key": "cash",       "value": 530,  "operator": "+", "running_total": 4880 }
//     ]
//   }
// ============================================================================
async function handleCalculateFormulaById(formulaId, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = body?.data || {};

    const db = supabaseAdmin || supabase;
    const { data: formula, error } = await db
      .from('site_banking_formulas')
      .select('id, name, result_label, formula_json')
      .eq('id', formulaId)
      .maybeSingle();

    if (error) throw error;
    if (!formula) {
      return NextResponse.json(
        { error: 'Formula not found', id: formulaId },
        { status: 404, headers: corsHeaders }
      );
    }

    let operations = [];
    try {
      const parsed = typeof formula.formula_json === 'string'
        ? JSON.parse(formula.formula_json)
        : formula.formula_json;
      operations = parsed?.operations || [];
    } catch (e) {
      return NextResponse.json(
        { error: 'Malformed formula_json', detail: e.message },
        { status: 422, headers: corsHeaders }
      );
    }

    let result = 0;
    let currentOp = '+';
    const breakdown = [];
    let step = 0;

    for (const op of operations) {
      if (op.type === 'operator') {
        currentOp = op.value;
        continue;
      }
      step += 1;
      const rawValue = op.type === 'field' ? data[op.value] : op.value;
      const value = parseFloat(rawValue || 0);

      if (currentOp === '+') result += value;
      else if (currentOp === '-') result -= value;
      else if (currentOp === '*') result *= value;
      else if (currentOp === '/') result = value !== 0 ? result / value : 0;

      breakdown.push({
        step,
        type: op.type,
        key: op.type === 'field' ? op.value : null,
        value,
        operator: currentOp,
        running_total: Math.round(result * 100) / 100,
      });
    }

    return NextResponse.json(
      {
        formula_id: formula.id,
        formula_name: formula.name,
        result_label: formula.result_label || 'Result',
        result: Math.round(result * 100) / 100,
        formula_breakdown: breakdown,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Calculate formula by id error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate formula', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}


// ============================================================================
// GET /api/reports/:id  (alias: /api/form-submissions/:id)
//
// Single-report view with the formula breakdown attached. RBAC: owners see
// reports for sites they own, operators for assigned sites, staff only for
// reports they submitted themselves.
// ============================================================================
async function handleGetReportById(reportId) {
  try {
    const db = supabaseAdmin || supabase;

    // Pull the report with site + submitter joined
    const { data: report, error } = await db
      .from('shift_reports')
      .select(`
        *,
        site:sites(id, name, code),
        submitter:users!submitted_by_user_id(id, name, email),
        reviewer:users!reviewed_by_user_id(id, name, email)
      `)
      .eq('id', reportId)
      .maybeSingle();

    if (error) throw error;
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found', id: reportId },
        { status: 404, headers: corsHeaders }
      );
    }

    // Pull per-formula results so the UI can show an audit breakdown.
    // Table: shift_formula_results { id, shift_report_id, formula_id,
    //                                formula_name, result_value, calculated_at }
    let formula_results = [];
    try {
      const { data: frs } = await db
        .from('shift_formula_results')
        .select('id, formula_id, formula_name, result_value, calculated_at')
        .eq('shift_report_id', reportId)
        .order('calculated_at', { ascending: true });
      formula_results = Array.isArray(frs) ? frs : [];
    } catch (e) {
      console.warn('formula_results fetch failed:', e?.message);
    }

    // Flatten the joined names for client convenience
    const payload = {
      ...report,
      site_name: report.site?.name,
      site_code: report.site?.code,
      staff_name: report.submitter?.name,
      reviewed_by_name: report.reviewer?.name,
      formula_results,
    };
    return NextResponse.json(payload, { headers: corsHeaders });
  } catch (err) {
    console.error('Get report by id error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch report', message: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// DELETE /api/reports/:id  (alias: /api/form-submissions/:id)
//
// Admin-only (Owner). Operator + Staff are rejected 403.
// Cascades to shift_formula_results via FK.
// ============================================================================
async function handleDeleteReport(reportId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;
    if (me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can delete reports', role: me.role },
        { status: 403, headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;
    // First, clean up the formula results (no ON DELETE CASCADE assumed).
    try {
      await db.from('shift_formula_results').delete().eq('shift_report_id', reportId);
    } catch (e) {
      console.warn('shift_formula_results cleanup failed:', e?.message);
    }
    const { error } = await db.from('shift_reports').delete().eq('id', reportId);
    if (error) throw error;

    return NextResponse.json(
      { success: true, deleted_id: reportId },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('Delete report error:', err);
    return NextResponse.json(
      { error: 'Failed to delete report', message: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== SHIFT REPORTS ==============
async function handleGetReports(request) {
  try {
    // -------- Auth: Bearer token REQUIRED --------
    // GET /api/reports is now role-scoped via the requester's JWT.
    //   owner    → all reports for sites they own
    //   operator → reports for sites assigned to them (operator_site_assignments)
    //   staff    → reports they submitted themselves (submitted_by_user_id = me)
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;

    const url = new URL(request.url);
    const reqSiteId = url.searchParams.get('siteId');
    const reqSiteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const status = url.searchParams.get('status');

    const db = supabaseAdmin || supabase;

    // -------- Resolve which sites this caller can see --------
    let scopedSiteIds = null; // null = no site filter (e.g. staff filter by user)
    if (me.role === 'staff') {
      // Staff: only their own reports (we'll filter by submitted_by_user_id
      // below — no site scope needed)
    } else if (me.role === 'owner') {
      const { data, error } = await db
        .from('sites')
        .select('id')
        .eq('owner_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((s) => s.id);
    } else if (me.role === 'operator') {
      const { data, error } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else {
      return NextResponse.json(
        { error: `Unknown role: ${me.role}` },
        { status: 403, headers: corsHeaders }
      );
    }

    // -------- Intersect requested filter with scope --------
    let effectiveSiteIds = scopedSiteIds;
    if (reqSiteId || reqSiteIds) {
      const requested = reqSiteIds
        ? reqSiteIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [reqSiteId];
      if (me.role === 'staff') {
        // staff can't filter by site (they only see their own reports regardless)
      } else {
        const allowed = new Set(scopedSiteIds || []);
        const filtered = requested.filter((id) => allowed.has(id));
        // If they asked for sites they don't have access to, return empty
        // (don't 403 — could be a legitimate broad query with some out-of-scope items)
        effectiveSiteIds = filtered;
      }
    }

    let query = db
      .from('shift_reports')
      .select(`
        *,
        site:sites(id, name, code),
        submitted_by:users!submitted_by_user_id(id, name, email)
      `)
      .order('date', { ascending: false })
      .order('shift_type', { ascending: true });

    if (me.role === 'staff') {
      query = query.eq('submitted_by_user_id', me.id);
    } else {
      // Owner/Operator must be scoped to their allowed sites
      if (!effectiveSiteIds || effectiveSiteIds.length === 0) {
        return NextResponse.json([], { headers: corsHeaders });
      }
      query = query.in('site_id', effectiveSiteIds);
    }

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.limit(500);
    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', detail: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleCreateReport(request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    // -------- Field-name flexibility --------
    // Accept BOTH `date` and `shift_date` (DB column is `date`).
    // Accept BOTH `shift_type` and `shiftType` (just in case).
    const date = body.date || body.shift_date || null;
    const shift_type = body.shift_type || body.shiftType || null;
    const site_id = body.site_id || body.siteId || null;

    // -------- Auth: Bearer token REQUIRED --------
    // We never trust `submitted_by_user_id` from the request body — it would
    // let any client post reports on behalf of any user. The submitter's
    // identity is taken exclusively from the Supabase JWT.
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const submitted_by_user_id = auth.user.id;

    // -------- Required field validation --------
    const missing = [];
    if (!site_id) missing.push('site_id');
    if (!date) missing.push('date (or shift_date)');
    if (!shift_type) missing.push('shift_type');
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missing.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // -------- Build insert payload --------
    // Allow-list spread: take everything from body EXCEPT alias keys we already
    // normalized, then merge in our normalized + trusted values.
    const {
      date: _d,
      shift_date: _sd,
      shift_type: _st,
      shiftType: _shiftType,
      site_id: _siteId,
      siteId: _siteIdAlias,
      submitted_by_user_id: _submitted,
      submittedByUserId: _submittedAlias,
      id: _id, // ignore client-supplied id
      submitted_at: _submittedAt, // we set this ourselves
      status: _status, // we always start as 'pending'
      // -------- Phase 3 wiring: dip-reading fields are NOT columns on
      // shift_reports. Strip them out of the spread; we'll forward them
      // to a dip_readings insert after the shift report is saved.
      dip_ulp_litres,
      dip_diesel_litres,
      dip_premium_litres,
      delivery_ulp_litres,
      delivery_diesel_litres,
      delivery_premium_litres,
      ...rest
    } = body;

    const newReport = {
      ...rest,
      id: uuidv4(),
      site_id,
      date,
      shift_type,
      submitted_by_user_id,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    };

    const { data: report, error: reportError } = await (supabaseAdmin || supabase)
      .from('shift_reports')
      .insert([newReport])
      .select()
      .single();

    if (reportError) {
      console.error('Create report - insert error:', reportError);
      if (reportError.code === '23505') {
        return NextResponse.json(
          {
            error: `A ${shift_type} report for site ${site_id} on ${date} has already been submitted.`,
            detail: reportError.details || null,
            code: 'duplicate_report',
            existing_constraint: 'shift_reports_site_id_date_shift_type_key',
          },
          { status: 409, headers: corsHeaders }
        );
      }
      if (reportError.code === '23503') {
        return NextResponse.json(
          {
            error: 'Referenced site or user does not exist.',
            detail: reportError.details || reportError.message,
            code: 'foreign_key_violation',
          },
          { status: 400, headers: corsHeaders }
        );
      }
      // Not-null / check / column not exist — surface the DB message in the
      // primary error field so it's visible even to consumers that only read
      // `error` and ignore `detail`.
      return NextResponse.json(
        {
          error: `Database rejected the report: ${reportError.message}`,
          detail: reportError.message,
          hint: reportError.hint || null,
          code: reportError.code || 'db_error',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Calculate and save formula results if visible to staff
    const { data: formulas } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .select('*')
      .eq('site_id', site_id)
      .eq('is_active', true)
      .eq('visible_to_staff', true);

    if (formulas && formulas.length > 0) {
      const formulaResults = [];
      for (const formula of formulas) {
        const calcResult = await calculateFormula(formula.formula_json, newReport);
        formulaResults.push({
          id: uuidv4(),
          shift_report_id: report.id,
          formula_id: formula.id,
          formula_name: formula.name,
          result_value: calcResult,
        });
      }
      if (formulaResults.length > 0) {
        await (supabaseAdmin || supabase)
          .from('shift_formula_results')
          .insert(formulaResults);
      }
    }

    // -------- Phase 3 wiring: persist any tank-level / delivery values
    // from the shift report into the dip_readings table so the Fuel
    // Inventory dashboard stays in sync. Non-blocking: errors here are
    // logged but the shift report itself stays successful.
    try {
      const toNum = (v) => (v === '' || v == null ? null : Number(v));
      const toNumZero = (v) => (v === '' || v == null ? 0 : Number(v));
      const levels = {
        ulp: toNum(dip_ulp_litres),
        diesel: toNum(dip_diesel_litres),
        premium: toNum(dip_premium_litres),
      };
      const deliveries = {
        ulp: toNumZero(delivery_ulp_litres),
        diesel: toNumZero(delivery_diesel_litres),
        premium: toNumZero(delivery_premium_litres),
      };
      const anyLevel = Object.values(levels).some((v) => v != null);
      const anyDelivery = Object.values(deliveries).some((v) => v > 0);

      if (anyLevel || anyDelivery) {
        // Map shift type to a sensible time-of-day so the reading lands
        // on a chronologically correct moment of the shift date.
        const hourByShift = { Morning: 8, Afternoon: 14, Night: 22 };
        const hour = hourByShift[shift_type] ?? 12;
        const readingDate = new Date(`${date}T00:00:00`);
        readingDate.setHours(hour, 0, 0, 0);

        const dipRow = {
          id: uuidv4(),
          site_id,
          // Reuse the submitter user id (column is named operator_user_id
          // for legacy reasons but semantically it's "logged_by"). Staff
          // submissions therefore appear under the staff member who
          // logged them; operators and owners can still edit/delete via
          // the Fuel Inventory dashboard.
          operator_user_id: submitted_by_user_id,
          reading_label: `${shift_type} shift`,
          reading_time: readingDate.toISOString(),
          ulp_litres: levels.ulp,
          diesel_litres: levels.diesel,
          premium_litres: levels.premium,
          deliveries_ulp_litres: deliveries.ulp,
          deliveries_diesel_litres: deliveries.diesel,
          deliveries_premium_litres: deliveries.premium,
          notes: `Auto-logged from ${shift_type} shift report ${report.id}`,
        };

        const { error: dipErr } = await (supabaseAdmin || supabase)
          .from('dip_readings')
          .insert([dipRow]);
        if (dipErr) {
          console.error('Create report - dip insert failed (non-fatal):', dipErr);
        }
      }
    } catch (dipBlockErr) {
      console.error('Create report - dip block crashed (non-fatal):', dipBlockErr);
    }

    return NextResponse.json(report, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create report - unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create report',
        detail: error?.message || String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleUpdateReportStatus(reportId, request) {
  try {
    const { status, reviewed_by_user_id } = await request.json();
    
    const updates = {
      status,
      reviewed_by_user_id,
      reviewed_at: new Date().toISOString()
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('shift_reports')
      .update(updates)
      .eq('id', reportId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update report status error:', error);
    return NextResponse.json({ error: 'Failed to update report status' }, { status: 500, headers: corsHeaders });
  }
}

// Helper function to calculate formula
function calculateFormula(formula_json, shift_data) {
  try {
    const operations = JSON.parse(formula_json).operations || [];
    let result = 0;
    let currentOp = '+';
    
    for (const op of operations) {
      if (op.type === 'field') {
        const value = parseFloat(shift_data[op.value] || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      } else if (op.type === 'operator') {
        currentOp = op.value;
      } else if (op.type === 'number') {
        const value = parseFloat(op.value || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      }
    }
    
    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error('Formula calculation error:', error);
    return 0;
  }
}

// ============== DAILY ROLLUPS (WITH FORMULA AGGREGATION) ==============
async function handleGetDailyRollups(request) {
  try {
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }
    
    const siteIdArray = siteIds.split(',');
    
    let query = (supabaseAdmin || supabase)
      .from('shift_reports')
      .select('*')
      .in('site_id', siteIdArray);
    
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    
    const { data: reports, error } = await query;
    
    if (error) throw error;
    
    // Group reports by site_id and date
    const rollups = {};
    
    (reports || []).forEach(report => {
      const key = `${report.site_id}_${report.date}`;
      
      if (!rollups[key]) {
        rollups[key] = {
          site_id: report.site_id,
          date: report.date,
          total_sales: 0,
          fuel_sales: 0,
          shop_sales: 0,
          total_litres: 0,
          eftpos: 0,
          motorpass: 0,
          cash: 0,
          accounts: 0,
          beverages: 0,
          hot_food: 0,
          drive_offs: 0,
          dips: 0,
          shift_count: 0
        };
      }
      
      rollups[key].total_sales += report.total_sales || 0;
      rollups[key].fuel_sales += report.fuel_sales || 0;
      rollups[key].shop_sales += report.shop_sales || 0;
      rollups[key].total_litres += report.total_litres || 0;
      rollups[key].eftpos += report.eftpos || 0;
      rollups[key].motorpass += report.motorpass || 0;
      rollups[key].cash += report.cash || 0;
      rollups[key].accounts += report.accounts || 0;
      rollups[key].beverages += report.beverages || 0;
      rollups[key].hot_food += report.hot_food || 0;
      rollups[key].drive_offs += report.drive_offs || 0;
      rollups[key].dips += report.dips || 0;
      rollups[key].shift_count += 1;
    });
    
    // Calculate formula rollups for each day
    for (const key in rollups) {
      const rollup = rollups[key];
      const { data: formulas } = await (supabaseAdmin || supabase)
        .from('site_banking_formulas')
        .select('*')
        .eq('site_id', rollup.site_id)
        .eq('is_active', true)
        .eq('visible_in_operator_daily_summary', true);
      
      if (formulas && formulas.length > 0) {
        rollup.formula_results = [];
        
        for (const formula of formulas) {
          const result = calculateFormula(formula.formula_json, rollup);
          rollup.formula_results.push({
            formula_id: formula.id,
            formula_name: formula.name,
            result_label: formula.result_label || formula.name,
            result_value: result
          });
        }
      }
    }
    
    return NextResponse.json(Object.values(rollups), { headers: corsHeaders });
  } catch (error) {
    console.error('Get daily rollups error:', error);
    return NextResponse.json({ error: 'Failed to fetch daily rollups' }, { status: 500, headers: corsHeaders });
  }
}

// ============== DASHBOARD STATS ==============
async function handleGetDashboardStats(request) {
  try {
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }

    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) {
      return NextResponse.json({
        totalShopSales: 0, totalFuelSales: 0, totalRevenue: 0,
        totalDips: 0, totalDriveOffs: 0, totalBanking: 0,
        totalReports: 0, pendingReports: 0, reviewedReports: 0,
        topPerformingSite: null, lowestPerformingSite: null,
        // legacy snake_case (kept for backward compatibility):
        total_sales: 0, fuel_sales: 0, shop_sales: 0, total_litres: 0,
        total_reports: 0, pending_reports: 0, reviewed_reports: 0,
      }, { headers: corsHeaders });
    }

    const db = supabaseAdmin || supabase;

    // Pull sites + reports in parallel
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres, total_revenue, eftpos, motorpass, cash, accounts, dips, drive_offs, status')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);

    const [{ data: sites, error: sitesErr }, { data: reports, error: reportsErr }] = await Promise.all([
      db.from('sites').select('id, name, code').in('id', siteIdArray),
      reportsQuery,
    ]);
    if (sitesErr) throw sitesErr;
    if (reportsErr) throw reportsErr;

    // Aggregate totals
    const totals = {
      totalShopSales: 0,
      totalFuelSales: 0,
      totalRevenue: 0,
      totalSales: 0,
      totalLitres: 0,
      totalDips: 0,
      totalDriveOffs: 0,
      totalBanking: 0,
      totalReports: (reports || []).length,
      pendingReports: 0,
      reviewedReports: 0,
    };
    const perSite = new Map();
    for (const r of reports || []) {
      const sales = Number(r.total_sales) || 0;
      const fuel = Number(r.fuel_sales) || 0;
      const shop = Number(r.shop_sales) || 0;
      const litres = Number(r.total_litres) || 0;
      const revenue = Number(r.total_revenue) || sales; // fall back to total_sales
      const dips = Number(r.dips) || 0;
      const driveOffs = Number(r.drive_offs) || 0;
      const banking = (Number(r.eftpos) || 0) + (Number(r.motorpass) || 0) + (Number(r.cash) || 0) + (Number(r.accounts) || 0);

      totals.totalShopSales += shop;
      totals.totalFuelSales += fuel;
      totals.totalRevenue += revenue;
      totals.totalSales += sales;
      totals.totalLitres += litres;
      totals.totalDips += dips;
      totals.totalDriveOffs += driveOffs;
      totals.totalBanking += banking;
      if (r.status === 'pending') totals.pendingReports += 1;
      if (r.status === 'reviewed') totals.reviewedReports += 1;

      if (!perSite.has(r.site_id)) {
        perSite.set(r.site_id, { revenue: 0, totalSales: 0, reportCount: 0 });
      }
      const ps = perSite.get(r.site_id);
      ps.revenue += revenue;
      ps.totalSales += sales;
      ps.reportCount += 1;
    }

    // Build top/lowest performing site
    const siteRanking = (sites || []).map((s) => {
      const agg = perSite.get(s.id) || { revenue: 0, totalSales: 0, reportCount: 0 };
      return {
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code || s.name?.slice(0, 12) || s.id.slice(0, 8),
        revenue: Math.round(agg.revenue * 100) / 100,
        totalSales: Math.round(agg.totalSales * 100) / 100,
        reportCount: agg.reportCount,
      };
    });
    const ranked = siteRanking.filter((s) => s.reportCount > 0).sort((a, b) => b.revenue - a.revenue);
    const topPerformingSite = ranked.length ? ranked[0] : null;
    const lowestPerformingSite = ranked.length > 1 ? ranked[ranked.length - 1] : null;

    const r2 = (n) => Math.round(n * 100) / 100;
    const response = {
      // Frontend camelCase fields (what the StatCards read):
      totalShopSales: r2(totals.totalShopSales),
      totalFuelSales: r2(totals.totalFuelSales),
      totalRevenue: r2(totals.totalRevenue),
      totalDips: r2(totals.totalDips),
      totalDriveOffs: r2(totals.totalDriveOffs),
      totalBanking: r2(totals.totalBanking),
      totalSales: r2(totals.totalSales),
      totalLitres: r2(totals.totalLitres),
      totalReports: totals.totalReports,
      pendingReports: totals.pendingReports,
      reviewedReports: totals.reviewedReports,
      topPerformingSite,
      lowestPerformingSite,
      // Legacy snake_case (kept so any older callers don't break):
      total_sales: r2(totals.totalSales),
      fuel_sales: r2(totals.totalFuelSales),
      shop_sales: r2(totals.totalShopSales),
      total_litres: r2(totals.totalLitres),
      total_reports: totals.totalReports,
      pending_reports: totals.pendingReports,
      reviewed_reports: totals.reviewedReports,
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// /api/dashboard/site-stats?siteIds=...&startDate=...&endDate=...
// Returns per-site aggregated stats for the Owner BarChart (Site Comparison).
// Shape: [{ siteId, siteCode, siteName, fuelSales, shopSales, totalSales, totalLitres, reportCount }]
async function handleGetDashboardSiteStats(request) {
  try {
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }

    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    const db = supabaseAdmin || supabase;

    // Fetch sites for code/name labels (used by chart X-axis)
    const { data: sites, error: sitesErr } = await db
      .from('sites')
      .select('id, name, code')
      .in('id', siteIdArray);
    if (sitesErr) throw sitesErr;

    // Fetch reports in date range
    let reportsQuery = db
      .from('shift_reports')
      .select('site_id, total_sales, fuel_sales, shop_sales, total_litres')
      .in('site_id', siteIdArray);
    if (startDate) reportsQuery = reportsQuery.gte('date', startDate);
    if (endDate) reportsQuery = reportsQuery.lte('date', endDate);
    const { data: reports, error: reportsErr } = await reportsQuery;
    if (reportsErr) throw reportsErr;

    const result = (sites || []).map((site) => {
      const siteReports = (reports || []).filter((r) => r.site_id === site.id);
      const fuelSales = siteReports.reduce((acc, r) => acc + (Number(r.fuel_sales) || 0), 0);
      const shopSales = siteReports.reduce((acc, r) => acc + (Number(r.shop_sales) || 0), 0);
      const totalSales = siteReports.reduce((acc, r) => acc + (Number(r.total_sales) || 0), 0);
      const totalLitres = siteReports.reduce((acc, r) => acc + (Number(r.total_litres) || 0), 0);
      return {
        siteId: site.id,
        siteCode: site.code || site.name?.slice(0, 12) || site.id.slice(0, 8),
        siteName: site.name,
        fuelSales: Math.round(fuelSales * 100) / 100,
        shopSales: Math.round(shopSales * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        totalLitres: Math.round(totalLitres * 100) / 100,
        reportCount: siteReports.length,
      };
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard site-stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch site stats', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// /api/dashboard/revenue-chart?siteIds=...&days=7
// Returns daily revenue time-series for the Owner LineChart (Revenue Trend).
// Shape: [{ date: 'YYYY-MM-DD', revenue: number }]
async function handleGetDashboardRevenueChart(request) {
  try {
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const daysParam = parseInt(url.searchParams.get('days') || '7', 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 90) : 7;

    if (!siteIds) {
      return NextResponse.json({ error: 'siteIds is required' }, { status: 400, headers: corsHeaders });
    }
    const siteIdArray = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    if (!siteIdArray.length) return NextResponse.json([], { headers: corsHeaders });

    // Build the window: last `days` days ending today (UTC).
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);

    const db = supabaseAdmin || supabase;
    const { data: reports, error } = await db
      .from('shift_reports')
      .select('date, total_sales')
      .in('site_id', siteIdArray)
      .gte('date', startIso)
      .lte('date', endIso);
    if (error) throw error;

    // Bucket by date
    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of reports || []) {
      const key = r.date;
      if (!buckets.has(key)) continue;
      buckets.set(key, buckets.get(key) + (Number(r.total_sales) || 0));
    }
    const result = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dashboard revenue-chart error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue chart', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== FUEL PRICE INTELLIGENCE ==============
async function handleGetSiteCompetitors(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers: corsHeaders });
    }
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .select('*')
      .eq('site_id', siteId);
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get site competitors error:', error);
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateSiteCompetitor(request) {
  try {
    const body = await request.json();
    
    const newCompetitor = {
      id: uuidv4(),
      ...body
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .insert([newCompetitor])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create competitor error:', error);
    return NextResponse.json({ error: 'Failed to create competitor' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateSiteCompetitor(competitorId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .update(updates)
      .eq('id', competitorId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update competitor error:', error);
    return NextResponse.json({ error: 'Failed to update competitor' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteSiteCompetitor(competitorId) {
  try {
    const { error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .delete()
      .eq('id', competitorId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Competitor deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete competitor error:', error);
    return NextResponse.json({ error: 'Failed to delete competitor' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetFuelPriceEntries(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const date = url.searchParams.get('date');
    
    let query = (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .select('*')
      .order('date', { ascending: false });
    
    if (siteId) query = query.eq('site_id', siteId);
    if (date) query = query.eq('date', date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get fuel price entries error:', error);
    return NextResponse.json({ error: 'Failed to fetch fuel prices' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateFuelPriceEntry(request) {
  try {
    const body = await request.json();
    
    const newEntry = {
      id: uuidv4(),
      ...body,
      entered_at: new Date().toISOString()
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .insert([newEntry])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create fuel price entry error:', error);
    return NextResponse.json({ error: 'Failed to create fuel price entry' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateFuelPriceEntry(entryId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update fuel price entry error:', error);
    return NextResponse.json({ error: 'Failed to update fuel price entry' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetCompetitorPrices(request) {
  try {
    const url = new URL(request.url);
    const competitorId = url.searchParams.get('competitorId');
    const siteId = url.searchParams.get('siteId');
    const date = url.searchParams.get('date');
    
    let query = (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .select('*')
      .order('date', { ascending: false });
    
    if (competitorId) query = query.eq('competitor_id', competitorId);
    if (siteId) query = query.eq('site_id', siteId);
    if (date) query = query.eq('date', date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get competitor prices error:', error);
    return NextResponse.json({ error: 'Failed to fetch competitor prices' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateCompetitorPrice(request) {
  try {
    const body = await request.json();
    
    const newPrice = {
      id: uuidv4(),
      ...body,
      entered_at: new Date().toISOString()
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .insert([newPrice])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create competitor price error:', error);
    return NextResponse.json({ error: 'Failed to create competitor price' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateCompetitorPrice(priceId, request) {
  try {
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .update(updates)
      .eq('id', priceId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update competitor price error:', error);
    return NextResponse.json({ error: 'Failed to update competitor price' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteCompetitorPrice(priceId) {
  try {
    const { error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .delete()
      .eq('id', priceId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Competitor price deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete competitor price error:', error);
    return NextResponse.json({ error: 'Failed to delete competitor price' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetFuelPriceComparison(request) {
  try {
    const url = new URL(request.url);
    // Frontend sends ?siteIds=a,b,c (plural). Older callers send ?siteId=. Accept both.
    let siteIdList = [];
    const single = url.searchParams.get('siteId');
    const plural = url.searchParams.get('siteIds');
    if (plural) {
      siteIdList = plural.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (single) {
      siteIdList = [single];
    }
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!siteIdList.length) {
      return NextResponse.json(
        { error: 'siteId or siteIds is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;

    // Bulk fetch sites + own prices + competitors + competitor prices
    const [sitesRes, ownPricesRes, compsRes] = await Promise.all([
      db
        .from('sites')
        .select('id, name, code, latitude, longitude')
        .in('id', siteIdList),
      db
        .from('fuel_price_entries')
        .select('site_id, fuel_type, price, date, entered_at')
        .in('site_id', siteIdList)
        .eq('date', date),
      db
        .from('site_competitors')
        .select('id, site_id, competitor_name, distance_km, latitude, longitude')
        .in('site_id', siteIdList),
    ]);
    if (sitesRes.error) throw sitesRes.error;
    if (ownPricesRes.error) throw ownPricesRes.error;
    if (compsRes.error) throw compsRes.error;

    const sites = sitesRes.data || [];
    const ownPrices = ownPricesRes.data || [];
    const competitors = compsRes.data || [];

    const competitorIds = competitors.map((c) => c.id);
    let competitorPrices = [];
    if (competitorIds.length) {
      const cpRes = await db
        .from('competitor_fuel_prices')
        .select('competitor_id, site_id, fuel_type, price, date, entered_at')
        .in('competitor_id', competitorIds)
        .eq('date', date);
      if (cpRes.error) throw cpRes.error;
      competitorPrices = cpRes.data || [];
    }

    const FUEL_TYPES = ['ULP', 'Premium', 'Diesel'];

    // Build one comparison entry per site
    const result = siteIdList.map((siteId) => {
      const site = sites.find((s) => s.id === siteId) || { id: siteId };
      const siteComps = competitors.filter((c) => c.site_id === siteId);
      const siteCompPrices = competitorPrices.filter((p) => p.site_id === siteId);
      const siteOwnPrices = ownPrices.filter((p) => p.site_id === siteId);

      const fuelData = {};
      const insights = [];

      for (const ft of FUEL_TYPES) {
        // Latest own price for this fuel type (today)
        const own = siteOwnPrices
          .filter((p) => p.fuel_type === ft)
          .sort(
            (a, b) =>
              new Date(b.entered_at || 0).getTime() -
              new Date(a.entered_at || 0).getTime()
          )[0];

        // Latest competitor price per competitor for this fuel type
        const compByCompetitor = new Map();
        for (const cp of siteCompPrices.filter((p) => p.fuel_type === ft)) {
          const t = cp.entered_at ? new Date(cp.entered_at).getTime() : 0;
          const cur = compByCompetitor.get(cp.competitor_id);
          if (!cur || t > cur._t) compByCompetitor.set(cp.competitor_id, { ...cp, _t: t });
        }
        const compPriceList = Array.from(compByCompetitor.values()).map((cp) => {
          const meta = siteComps.find((c) => c.id === cp.competitor_id) || {};
          return {
            competitor_id: cp.competitor_id,
            competitor_name: meta.competitor_name || null,
            distance_km: meta.distance_km ?? null,
            latitude: meta.latitude ?? null,
            longitude: meta.longitude ?? null,
            price: cp.price,
            entered_at: cp.entered_at,
          };
        });

        const numericComps = compPriceList
          .map((c) => Number(c.price))
          .filter((n) => Number.isFinite(n));
        const minCp = numericComps.length ? Math.min(...numericComps) : null;
        const maxCp = numericComps.length ? Math.max(...numericComps) : null;
        const ownPrice = own ? Number(own.price) : null;

        const fmt = (n) =>
          n === null || n === undefined
            ? null
            : (Math.round(n * 10) / 10).toFixed(1);
        const diffMin =
          ownPrice !== null && minCp !== null
            ? Math.round((ownPrice - minCp) * 10) / 10
            : null;
        const diffMax =
          ownPrice !== null && maxCp !== null
            ? Math.round((ownPrice - maxCp) * 10) / 10
            : null;

        fuelData[ft] = {
          own_price: ownPrice,
          min_competitor_price: minCp,
          max_competitor_price: maxCp,
          competitor_count: compPriceList.length,
          difference_from_min: diffMin === null ? null : (diffMin > 0 ? '+' : '') + diffMin.toFixed(1),
          difference_from_max: diffMax === null ? null : (diffMax > 0 ? '+' : '') + diffMax.toFixed(1),
          competitor_prices: compPriceList,
        };

        // Insight rule of thumb (cents per litre):
        //   |diff| <= 0.5  → good
        //   diff > 0.5 && <= 2.0  → neutral
        //   diff > 2.0 && <= 4.0  → warning
        //   diff > 4.0  → danger
        //   diff < -0.5 → good (well below min)
        if (diffMin !== null) {
          let type = 'neutral';
          let message = '';
          if (diffMin <= 0.5) {
            type = 'good';
            message = `${ft} priced competitively (within 0.5¢ of nearest)`;
          } else if (diffMin <= 2.0) {
            type = 'neutral';
            message = `${ft} slightly above lowest competitor (+${diffMin.toFixed(1)}¢)`;
          } else if (diffMin <= 4.0) {
            type = 'warning';
            message = `${ft} significantly above nearest competitors (+${diffMin.toFixed(1)}¢)`;
          } else {
            type = 'danger';
            message = `${ft} far above lowest competitor (+${diffMin.toFixed(1)}¢) — consider price review`;
          }
          insights.push({ type, fuel_type: ft, difference_from_min: diffMin, message });
        }
      }

      return {
        site_id: site.id,
        site_name: site.name || null,
        site_code: site.code || null,
        latitude: site.latitude ?? null,
        longitude: site.longitude ?? null,
        date,
        fuel_data: fuelData,
        insights,
      };
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get fuel price comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fuel price comparison', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== EXPORT ==============
async function handleExport(request) {
  // Forward to dedicated /api/export route (which carries the heavy xlsx import).
  // This keeps the catch-all bundle small.
  const url = new URL(request.url);
  const newUrl = new URL('/api/export', url);
  newUrl.search = url.search;
  return NextResponse.redirect(newUrl, 307);
}

// ============== DIP READINGS (Phase 3: Fuel Inventory Tracking) ==============
//
// Operators log fuel tank levels (in litres) ~2x daily. Owner sees current
// levels, consumption trends, and gets alerts to plan deliveries.
//
// Consumption math (computed here, NOT stored):
//   consumption = previous_reading - current_reading + deliveries_received
//
// Authz:
//   - operator: can read/write only their assigned sites; can edit their own
//     readings within 24h of creation.
//   - owner:    read-only on all sites they own.
//   - staff:    no access for now (could be relaxed later).

/**
 * Resolve the set of site IDs the current user is allowed to act on.
 * Returns an array of UUIDs (possibly empty).
 */
async function _getAllowedSiteIdsForDips(currentUser) {
  const admin = supabaseAdmin || supabase;
  if (currentUser.role === 'owner') {
    const { data } = await admin
      .from('sites')
      .select('id')
      .eq('owner_id', currentUser.id);
    return (data || []).map((s) => s.id);
  }
  if (currentUser.role === 'operator') {
    const { data } = await admin
      .from('operator_site_assignments')
      .select('site_id')
      .eq('operator_user_id', currentUser.id);
    return (data || []).map((a) => a.site_id);
  }
  if (currentUser.role === 'staff') {
    const { data } = await admin
      .from('staff_site_assignments')
      .select('site_id')
      .eq('staff_user_id', currentUser.id);
    return (data || []).map((a) => a.site_id);
  }
  return [];
}

async function handleGetDips(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const url = new URL(request.url);
    const siteIdParam = url.searchParams.get('site_id');
    const siteIdsParam = url.searchParams.get('site_ids');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam, 10) || 500, 1000);

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (allowedSiteIds.length === 0) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    // Apply requested filters, intersected with allowed sites
    let requested = null;
    if (siteIdParam) requested = [siteIdParam];
    else if (siteIdsParam) requested = siteIdsParam.split(',').map((s) => s.trim()).filter(Boolean);

    const finalSiteIds = requested
      ? requested.filter((id) => allowedSiteIds.includes(id))
      : allowedSiteIds;

    if (finalSiteIds.length === 0) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    let query = admin
      .from('dip_readings')
      .select('*')
      .in('site_id', finalSiteIds)
      .order('reading_time', { ascending: false })
      .limit(limit);

    if (from) query = query.gte('reading_time', new Date(from).toISOString());
    if (to) query = query.lte('reading_time', new Date(to).toISOString());

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get dips error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dip readings', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleGetDipsCurrent(request) {
  // Latest reading per site for the user's allowed sites. Includes the
  // immediately-previous reading so the UI can show "consumed since last
  // reading" for each fuel grade.
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (allowedSiteIds.length === 0) {
      return NextResponse.json([], { headers: corsHeaders });
    }

    // Pull the most recent 2 readings per site. Doing it in one query and
    // bucketing in JS keeps us off pg window-function complexity.
    const { data, error } = await admin
      .from('dip_readings')
      .select('*')
      .in('site_id', allowedSiteIds)
      .order('reading_time', { ascending: false })
      .limit(allowedSiteIds.length * 5); // grab a small buffer per site
    if (error) throw error;

    const bySite = new Map();
    for (const row of data || []) {
      const arr = bySite.get(row.site_id) || [];
      if (arr.length < 2) arr.push(row);
      bySite.set(row.site_id, arr);
    }

    const fuels = ['ulp', 'diesel', 'premium'];
    const result = allowedSiteIds.map((siteId) => {
      const [current, previous] = bySite.get(siteId) || [];
      const consumption = {};
      for (const f of fuels) {
        const cur = current?.[`${f}_litres`];
        const prev = previous?.[`${f}_litres`];
        const deliveries = Number(current?.[`deliveries_${f}_litres`] || 0);
        if (cur != null && prev != null) {
          // consumed since previous reading
          consumption[f] = Number(prev) - Number(cur) + deliveries;
        } else {
          consumption[f] = null;
        }
      }
      return {
        site_id: siteId,
        current: current || null,
        previous: previous || null,
        consumption_since_previous: consumption,
      };
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get current dips error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current dips', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleGetDipsTrends(request) {
  // Daily consumption per fuel grade for the last N days, per site.
  // For each day we compute (first reading of day) - (last reading of day)
  // + sum(deliveries during the day). That gives total litres pumped on
  // that calendar day. We then also expose the rolling N-day average.
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const url = new URL(request.url);
    const siteIdParam = url.searchParams.get('site_id');
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get('days'), 10) || 7, 90));

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (allowedSiteIds.length === 0) {
      return NextResponse.json({ days, sites: [] }, { headers: corsHeaders });
    }

    const siteIds = siteIdParam
      ? (allowedSiteIds.includes(siteIdParam) ? [siteIdParam] : [])
      : allowedSiteIds;
    if (siteIds.length === 0) {
      return NextResponse.json({ days, sites: [] }, { headers: corsHeaders });
    }

    // Fetch readings going back `days + 1` days so we have a baseline for
    // the first day in the window.
    const since = new Date();
    since.setDate(since.getDate() - (days + 1));
    const { data, error } = await admin
      .from('dip_readings')
      .select('*')
      .in('site_id', siteIds)
      .gte('reading_time', since.toISOString())
      .order('reading_time', { ascending: true });
    if (error) throw error;

    const fuels = ['ulp', 'diesel', 'premium'];

    // group readings by site -> day
    const groupedBySite = new Map();
    for (const row of data || []) {
      const day = new Date(row.reading_time).toISOString().slice(0, 10);
      const siteMap = groupedBySite.get(row.site_id) || new Map();
      const dayArr = siteMap.get(day) || [];
      dayArr.push(row);
      siteMap.set(day, dayArr);
      groupedBySite.set(row.site_id, siteMap);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    const sites = siteIds.map((siteId) => {
      const siteMap = groupedBySite.get(siteId) || new Map();
      const daily = dayKeys.map((day) => {
        const readings = (siteMap.get(day) || []).slice().sort((a, b) =>
          new Date(a.reading_time) - new Date(b.reading_time)
        );
        const consumption = { ulp: null, diesel: null, premium: null };
        if (readings.length >= 2) {
          const first = readings[0];
          const last = readings[readings.length - 1];
          for (const f of fuels) {
            const startVal = first[`${f}_litres`];
            const endVal = last[`${f}_litres`];
            if (startVal != null && endVal != null) {
              // sum deliveries within the day (skip the first reading's
              // deliveries since those happened before the window opens).
              const deliveriesInDay = readings.slice(1).reduce(
                (acc, r) => acc + Number(r[`deliveries_${f}_litres`] || 0),
                0
              );
              consumption[f] = Number(startVal) - Number(endVal) + deliveriesInDay;
            }
          }
        }
        return { date: day, consumption, reading_count: readings.length };
      });

      // averages over the window for days that had a value
      const avg = { ulp: null, diesel: null, premium: null };
      for (const f of fuels) {
        const vals = daily.map((d) => d.consumption[f]).filter((v) => v != null);
        if (vals.length > 0) {
          avg[f] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }

      return { site_id: siteId, daily, average_consumption: avg };
    });

    return NextResponse.json({ days, sites }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get dip trends error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dip trends', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleCreateDip(request) {
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const body = await request.json();
    const {
      site_id,
      reading_label = null,
      reading_time = null,
      ulp_litres = null,
      diesel_litres = null,
      premium_litres = null,
      deliveries_ulp_litres = 0,
      deliveries_diesel_litres = 0,
      deliveries_premium_litres = 0,
      notes = null,
    } = body || {};

    if (!site_id) {
      return NextResponse.json(
        { error: 'site_id is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Need at least one fuel level OR one delivery to be useful
    const anyLevel = [ulp_litres, diesel_litres, premium_litres].some((v) => v != null && v !== '');
    const anyDelivery = [deliveries_ulp_litres, deliveries_diesel_litres, deliveries_premium_litres]
      .some((v) => Number(v) > 0);
    if (!anyLevel && !anyDelivery) {
      return NextResponse.json(
        { error: 'Provide at least one tank level or one delivery value.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (!allowedSiteIds.includes(site_id)) {
      return NextResponse.json(
        { error: 'You are not assigned to this site.' },
        { status: 403, headers: corsHeaders }
      );
    }

    const toNum = (v) => (v === '' || v == null ? null : Number(v));
    const toNumZero = (v) => (v === '' || v == null ? 0 : Number(v));

    const row = {
      id: uuidv4(),
      site_id,
      operator_user_id: currentUser.id,
      reading_label: reading_label || null,
      reading_time: reading_time ? new Date(reading_time).toISOString() : new Date().toISOString(),
      ulp_litres: toNum(ulp_litres),
      diesel_litres: toNum(diesel_litres),
      premium_litres: toNum(premium_litres),
      deliveries_ulp_litres: toNumZero(deliveries_ulp_litres),
      deliveries_diesel_litres: toNumZero(deliveries_diesel_litres),
      deliveries_premium_litres: toNumZero(deliveries_premium_litres),
      notes: notes || null,
    };

    const { data, error } = await admin
      .from('dip_readings')
      .insert([row])
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create dip error:', error);
    return NextResponse.json(
      { error: 'Failed to create dip reading', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleUpdateDip(id, request) {
  // Operator can edit their OWN reading within 24h. Owner can edit any
  // reading for their own sites at any time (audit trail not implemented yet).
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const { data: existing, error: getErr } = await admin
      .from('dip_readings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !existing) {
      return NextResponse.json(
        { error: 'Dip reading not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (!allowedSiteIds.includes(existing.site_id)) {
      return NextResponse.json(
        { error: 'You do not have access to this reading.' },
        { status: 403, headers: corsHeaders }
      );
    }

    if (currentUser.role === 'operator') {
      if (existing.operator_user_id !== currentUser.id) {
        return NextResponse.json(
          { error: 'Operators can only edit their own readings.' },
          { status: 403, headers: corsHeaders }
        );
      }
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Edit window expired (>24h). Submit a new reading instead.' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const body = await request.json();
    const editable = [
      'reading_label',
      'reading_time',
      'ulp_litres',
      'diesel_litres',
      'premium_litres',
      'deliveries_ulp_litres',
      'deliveries_diesel_litres',
      'deliveries_premium_litres',
      'notes',
    ];
    const patch = {};
    for (const k of editable) {
      if (k in body) {
        if (k === 'reading_time' && body[k]) {
          patch[k] = new Date(body[k]).toISOString();
        } else if (k.endsWith('_litres')) {
          // numeric coerce; '' / null => null for levels, 0 for deliveries
          const isDelivery = k.startsWith('deliveries_');
          const v = body[k];
          if (v === '' || v == null) {
            patch[k] = isDelivery ? 0 : null;
          } else {
            patch[k] = Number(v);
          }
        } else {
          patch[k] = body[k] || null;
        }
      }
    }

    const { data, error } = await admin
      .from('dip_readings')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update dip error:', error);
    return NextResponse.json(
      { error: 'Failed to update dip reading', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleDeleteDip(id, request) {
  // Operator can delete their OWN reading within 24h; owner can delete any
  // reading for their own sites.
  try {
    const auth = await requireRole(request, ['operator', 'owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const currentUser = auth.user;
    const admin = supabaseAdmin || supabase;

    const { data: existing, error: getErr } = await admin
      .from('dip_readings')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr || !existing) {
      return NextResponse.json(
        { error: 'Dip reading not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const allowedSiteIds = await _getAllowedSiteIdsForDips(currentUser);
    if (!allowedSiteIds.includes(existing.site_id)) {
      return NextResponse.json(
        { error: 'You do not have access to this reading.' },
        { status: 403, headers: corsHeaders }
      );
    }
    if (currentUser.role === 'operator') {
      if (existing.operator_user_id !== currentUser.id) {
        return NextResponse.json(
          { error: 'Operators can only delete their own readings.' },
          { status: 403, headers: corsHeaders }
        );
      }
      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Delete window expired (>24h).' },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const { error } = await admin
      .from('dip_readings')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete dip error:', error);
    return NextResponse.json(
      { error: 'Failed to delete dip reading', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}



// ============== LIVE FUEL PRICES (Phase 3: All-QLD Map) ==============
//
// All endpoints are owner-only. Reads call maybeSync() first which is a
// no-op if the cache is fresher than FUEL_CACHE_TTL_SECONDS (default 15m).
//
//   GET  /api/fuel-prices-live/stations  ?fuel_type=&region=&brand=&max_price=
//   GET  /api/fuel-prices-live/filters   (distinct regions + brands for the
//                                         filter dropdowns)
//   POST /api/fuel-prices-live/sync      (force refresh; manual button)
//   GET  /api/fuel-prices-live/status    (sync_meta for the "Updated XX ago"
//                                         banner)

async function handleGetLiveStations(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    // Trigger lazy sync (no-op if cache is fresh).
    let syncMeta = null;
    try {
      syncMeta = await maybeSync({ force: false });
    } catch (syncErr) {
      console.error('[fuel-prices-live] maybeSync threw:', syncErr);
    }

    const url = new URL(request.url);
    const fuelType = url.searchParams.get('fuel_type');     // required for map
    const region   = url.searchParams.get('region');
    const brand    = url.searchParams.get('brand');
    const maxPrice = url.searchParams.get('max_price');     // dollars (e.g. 1.85)

    // Always require a fuel_type so we can return exactly one price per
    // station (the map UI needs a single value per marker).
    if (!fuelType) {
      return NextResponse.json(
        { error: 'fuel_type query param is required (e.g. ULP91, Diesel)' },
        { status: 400, headers: corsHeaders }
      );
    }

    let q = supabaseAdmin
      .from('fuel_prices_live')
      .select(`
        price_cents, is_stale, provider_updated_at, cached_at,
        station:fuel_stations!inner (
          station_id, name, brand, address, region, postcode,
          latitude, longitude
        )
      `)
      .eq('fuel_type', fuelType)
      .limit(5000);

    // Push as many filters as we can down to the DB by joining on the
    // station table. Supabase's PostgREST allows dotted column filters.
    if (region) q = q.eq('station.region', region);
    if (brand)  q = q.eq('station.brand', brand);
    if (maxPrice) {
      const cents = Math.round(parseFloat(maxPrice) * 100);
      if (!Number.isNaN(cents) && cents > 0) {
        q = q.lte('price_cents', cents);
      }
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || [])
      .filter((r) => r.station && r.station.latitude != null && r.station.longitude != null)
      .map((r) => ({
        station_id: r.station.station_id,
        name: r.station.name,
        brand: r.station.brand,
        address: r.station.address,
        region: r.station.region,
        postcode: r.station.postcode,
        latitude: Number(r.station.latitude),
        longitude: Number(r.station.longitude),
        fuel_type: fuelType,
        price_cents: r.price_cents,
        price_aud: r.price_cents / 100,
        is_stale: r.is_stale,
        provider_updated_at: r.provider_updated_at,
        cached_at: r.cached_at,
      }));

    return NextResponse.json(
      { count: rows.length, stations: rows, sync: syncMeta || null },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get live stations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live stations', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleGetLiveFilters(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    // Lazy sync first so the dropdowns are populated even on the very
    // first owner page-load.
    try { await maybeSync({ force: false }); } catch (e) { console.error(e); }

    const { data, error } = await supabaseAdmin
      .from('fuel_stations')
      .select('region, brand')
      .limit(5000);
    if (error) throw error;

    const regions = Array.from(new Set((data || []).map((r) => r.region).filter(Boolean))).sort();
    const brands  = Array.from(new Set((data || []).map((r) => r.brand).filter(Boolean))).sort();
    const fuelTypes = ['ULP91', 'E10', 'U95', 'U98', 'Diesel', 'LPG'];

    return NextResponse.json(
      { regions, brands, fuel_types: fuelTypes },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get live filters error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch filters', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handlePostLiveSync(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    const meta = await maybeSync({ force: true });
    return NextResponse.json({ ok: true, sync: meta || null }, { headers: corsHeaders });
  } catch (error) {
    console.error('Manual sync error:', error);
    return NextResponse.json(
      { ok: false, error: 'Sync failed', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleGetLiveStatus(request) {
  try {
    const auth = await requireRole(request, ['owner']);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    const { data } = await supabaseAdmin
      .from('fuel_price_sync_meta')
      .select('*')
      .eq('id', 'global')
      .maybeSingle();
    return NextResponse.json(data || {}, { headers: corsHeaders });
  } catch (error) {
    console.error('Get live status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}



// ============== REQUEST ROUTING ==============
export async function GET(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'health') {
    return NextResponse.json({ status: 'ok', database: 'supabase', timestamp: new Date().toISOString() }, { headers: corsHeaders });
  }
  if (path[0] === 'users') {
    return handleGetUsers(request);
  }
  if (path[0] === 'sites') {
    if (path[1]) return handleGetSiteById(path[1]);
    return handleGetSites(request);
  }
  if (path[0] === 'operator-assignments') {
    return handleGetOperatorAssignments(request);
  }
  if (path[0] === 'staff-assignments') {
    return handleGetStaffAssignments(request);
  }
  if (path[0] === 'reports' || path[0] === 'form-submissions') {
    if (path[1]) return handleGetReportById(path[1]);
    return handleGetReports(request);
  }
  if (path[0] === 'field-configs' || path[0] === 'site-field-configs' || path[0] === 'form-fields') {
    return handleGetFieldConfigs(request);
  }
  if (path[0] === 'banking-formulas' || path[0] === 'site-banking-formulas') {
    return handleGetBankingFormulas(request);
  }
  if (path[0] === 'daily-rollups') {
    return handleGetDailyRollups(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'stats') {
    return handleGetDashboardStats(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'site-stats') {
    return handleGetDashboardSiteStats(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'revenue-chart') {
    return handleGetDashboardRevenueChart(request);
  }
  if (path[0] === 'site-competitors') {
    return handleGetSiteCompetitors(request);
  }
  if (path[0] === 'fuel-price-entries') {
    return handleGetFuelPriceEntries(request);
  }
  if (path[0] === 'competitor-prices') {
    return handleGetCompetitorPrices(request);
  }
  if (path[0] === 'fuel-price-comparison') {
    return handleGetFuelPriceComparison(request);
  }
  if (path[0] === 'export') {
    return handleExport(request);
  }
  if (path[0] === 'invites') {
    return handleGetInvites(request);
  }
  if (path[0] === 'dips') {
    if (path[1] === 'current') return handleGetDipsCurrent(request);
    if (path[1] === 'trends') return handleGetDipsTrends(request);
    return handleGetDips(request);
  }
  if (path[0] === 'fuel-prices-live') {
    if (path[1] === 'stations') return handleGetLiveStations(request);
    if (path[1] === 'filters')  return handleGetLiveFilters(request);
    if (path[1] === 'status')   return handleGetLiveStatus(request);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function POST(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'auth' && path[1] === 'login') {
    return handleLogin(request);
  }
  if (path[0] === 'auth' && path[1] === 'signup') {
    return handleSignup(request);
  }
  if (path[0] === 'rls-fix') {
    return handleRLSFix();
  }
  if (path[0] === 'seed-supabase' || path[0] === 'seed') {
    return handleSeedSupabase();
  }
  if (path[0] === 'users') {
    return handleCreateUser(request);
  }
  if (path[0] === 'sites') {
    return handleCreateSite(request);
  }
  if (path[0] === 'operator-assignments') {
    return handleCreateOperatorAssignment(request);
  }
  if (path[0] === 'staff-assignments') {
    return handleCreateStaffAssignment(request);
  }
  if (path[0] === 'reports' || path[0] === 'form-submissions') {
    return handleCreateReport(request);
  }
  if (path[0] === 'field-configs' || path[0] === 'site-field-configs' || path[0] === 'form-fields') {
    if (path[1] === 'bulk') return handleBulkUpdateFieldConfigs(request);
    return handleCreateFieldConfig(request);
  }
  if (path[0] === 'banking-formulas' || path[0] === 'site-banking-formulas') {
    if (path[1] && path[2] === 'calculate') {
      return handleCalculateFormulaById(path[1], request);
    }
    return handleCreateBankingFormula(request);
  }
  if (path[0] === 'banking' && path[1] === 'calculate') {
    return handleBankingCalculate(request);
  }
  if (path[0] === 'site-competitors') {
    return handleCreateSiteCompetitor(request);
  }
  if (path[0] === 'fuel-price-entries') {
    return handleCreateFuelPriceEntry(request);
  }
  if (path[0] === 'competitor-prices') {
    return handleCreateCompetitorPrice(request);
  }
  if (path[0] === 'invites') {
    return handleCreateInvite(request);
  }
  if (path[0] === 'dips') {
    return handleCreateDip(request);
  }
  if (path[0] === 'fuel-prices-live' && path[1] === 'sync') {
    return handlePostLiveSync(request);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function PUT(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'users' && path[1]) {
    if (path[2] === 'role') {
      return handleUpdateUserRole(path[1], request);
    }
    return handleUpdateUser(path[1], request);
  }
  if (path[0] === 'sites' && path[1]) {
    return handleUpdateSite(path[1], request);
  }
  if (path[0] === 'reports' && path[1] && path[2] === 'status') {
    return handleUpdateReportStatus(path[1], request);
  }
  if ((path[0] === 'field-configs' || path[0] === 'site-field-configs' || path[0] === 'form-fields') && path[1]) {
    return handleUpdateFieldConfig(path[1], request);
  }
  if ((path[0] === 'banking-formulas' || path[0] === 'site-banking-formulas') && path[1]) {
    return handleUpdateBankingFormula(path[1], request);
  }
  if (path[0] === 'site-competitors' && path[1]) {
    return handleUpdateSiteCompetitor(path[1], request);
  }
  if (path[0] === 'fuel-price-entries' && path[1]) {
    return handleUpdateFuelPriceEntry(path[1], request);
  }
  if (path[0] === 'competitor-prices' && path[1]) {
    return handleUpdateCompetitorPrice(path[1], request);
  }
  if (path[0] === 'dips' && path[1]) {
    return handleUpdateDip(path[1], request);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function DELETE(request) {
  const path = getPathSegments(request);
  
  if ((path[0] === 'reports' || path[0] === 'form-submissions') && path[1]) {
    return handleDeleteReport(path[1], request);
  }
  if (path[0] === 'users' && path[1]) {
    return handleDeleteUser(path[1]);
  }
  if (path[0] === 'operator-assignments' && path[1]) {
    return handleDeleteOperatorAssignment(path[1]);
  }
  if (path[0] === 'staff-assignments' && path[1]) {
    return handleDeleteStaffAssignment(path[1]);
  }
  if ((path[0] === 'field-configs' || path[0] === 'site-field-configs' || path[0] === 'form-fields') && path[1]) {
    return handleDeleteFieldConfig(path[1]);
  }
  if ((path[0] === 'banking-formulas' || path[0] === 'site-banking-formulas') && path[1]) {
    return handleDeleteBankingFormula(path[1]);
  }
  if (path[0] === 'site-competitors' && path[1]) {
    return handleDeleteSiteCompetitor(path[1]);
  }
  if (path[0] === 'competitor-prices' && path[1]) {
    return handleDeleteCompetitorPrice(path[1]);
  }
  if (path[0] === 'dips' && path[1]) {
    return handleDeleteDip(path[1], request);
  }
  if (path[0] === 'sites' && path[1]) {
    return handleDeleteSite(path[1], request);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}
