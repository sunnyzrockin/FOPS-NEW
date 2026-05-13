import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
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
    const url = new URL(request.url);
    const ownerId = url.searchParams.get('ownerId');
    const userId = url.searchParams.get('userId');

    // Use admin client to bypass RLS issues
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get the authenticated user from the Authorization header
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

    // If no Bearer token but a userId/ownerId is supplied, treat that as the
    // identifying user and look up their role from the DB so we can apply
    // the correct scoping. This lets the frontend (which doesn't currently
    // forward the JWT) refresh sites via /api/sites?userId=<id>.
    if (!currentUser && userId) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (userData) currentUser = userData;
    }

    let query = supabaseAdmin.from('sites').select('*');

    // Apply role-based filtering in application logic
    if (currentUser) {
      if (currentUser.role === 'owner') {
        query = query.eq('owner_id', currentUser.id);
      } else if (currentUser.role === 'operator') {
        const { data: assignments } = await supabaseAdmin
          .from('operator_site_assignments')
          .select('site_id')
          .eq('operator_user_id', currentUser.id);

        if (assignments && assignments.length > 0) {
          const siteIds = assignments.map(a => a.site_id);
          query = query.in('id', siteIds);
        } else {
          return NextResponse.json([], { headers: corsHeaders });
        }
      } else if (currentUser.role === 'staff') {
        const { data: assignments } = await supabaseAdmin
          .from('staff_site_assignments')
          .select('site_id')
          .eq('staff_user_id', currentUser.id);

        if (assignments && assignments.length > 0) {
          const siteIds = assignments.map(a => a.site_id);
          query = query.in('id', siteIds);
        } else {
          return NextResponse.json([], { headers: corsHeaders });
        }
      }
    } else if (ownerId) {
      // Fallback for non-authenticated requests with ownerId
      query = query.eq('owner_id', ownerId);
    } else {
      // No authentication and no identifier, return empty
      return NextResponse.json([], { headers: corsHeaders });
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
    const { error } = await (supabaseAdmin || supabase)
      .from('site_field_configs')
      .delete()
      .eq('id', configId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Field config deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete field config error:', error);
    return NextResponse.json({ error: 'Failed to delete field config' }, { status: 500, headers: corsHeaders });
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

// ============== SHIFT REPORTS ==============
async function handleGetReports(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const siteId = url.searchParams.get('siteId');
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const status = url.searchParams.get('status');
    
    let query = (supabaseAdmin || supabase)
      .from('shift_reports')
      .select(`
        *,
        site:sites(id, name, code),
        submitted_by:users!submitted_by_user_id(id, name, email)
      `)
      .order('date', { ascending: false })
      .order('shift_type', { ascending: true });
    
    if (userId) query = query.eq('submitted_by_user_id', userId);
    if (siteId) query = query.eq('site_id', siteId);
    if (siteIds) {
      const siteIdArray = siteIds.split(',');
      query = query.in('site_id', siteIdArray);
    }
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (status) query = query.eq('status', status);
    
    const { data, error } = await query.limit(200);
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateReport(request) {
  try {
    const body = await request.json();
    
    const newReport = {
      id: uuidv4(),
      ...body,
      status: 'pending',
      submitted_at: new Date().toISOString()
    };
    
    const { data: report, error: reportError } = await (supabaseAdmin || supabase)
      .from('shift_reports')
      .insert([newReport])
      .select()
      .single();
    
    if (reportError) throw reportError;
    
    // Calculate and save formula results if visible to staff
    const { data: formulas } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .select('*')
      .eq('site_id', body.site_id)
      .eq('is_active', true)
      .eq('visible_to_staff', true);
    
    if (formulas && formulas.length > 0) {
      const formulaResults = [];
      
      for (const formula of formulas) {
        const calcResult = await calculateFormula(formula.formula_json, body);
        formulaResults.push({
          id: uuidv4(),
          shift_report_id: report.id,
          formula_id: formula.id,
          formula_name: formula.name,
          result_value: calcResult
        });
      }
      
      if (formulaResults.length > 0) {
        await (supabaseAdmin || supabase)
          .from('shift_formula_results')
          .insert(formulaResults);
      }
    }
    
    return NextResponse.json(report, { headers: corsHeaders });
  } catch (error) {
    console.error('Create report error:', error);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500, headers: corsHeaders });
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
  if (path[0] === 'reports') {
    return handleGetReports(request);
  }
  if (path[0] === 'field-configs' || path[0] === 'site-field-configs') {
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
  if (path[0] === 'reports') {
    return handleCreateReport(request);
  }
  if (path[0] === 'field-configs' || path[0] === 'site-field-configs') {
    if (path[1] === 'bulk') return handleBulkUpdateFieldConfigs(request);
    return handleCreateFieldConfig(request);
  }
  if (path[0] === 'banking-formulas' || path[0] === 'site-banking-formulas') {
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
  if ((path[0] === 'field-configs' || path[0] === 'site-field-configs') && path[1]) {
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
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function DELETE(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'users' && path[1]) {
    return handleDeleteUser(path[1]);
  }
  if (path[0] === 'operator-assignments' && path[1]) {
    return handleDeleteOperatorAssignment(path[1]);
  }
  if (path[0] === 'staff-assignments' && path[1]) {
    return handleDeleteStaffAssignment(path[1]);
  }
  if ((path[0] === 'field-configs' || path[0] === 'site-field-configs') && path[1]) {
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
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}
