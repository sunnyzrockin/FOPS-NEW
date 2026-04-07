import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { demoUsers, demoSites, generateSiteAssignments, generateShiftReports, generateSiteFieldConfigs, generateSiteBankingFormulas } from '@/lib/seed';
import * as XLSX from 'xlsx';

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

// Core locked fields that cannot be removed
const CORE_FIELDS = [
  'date', 'site_id', 'shift_type', 'submitted_by_user_id',
  'total_sales', 'fuel_sales', 'shop_sales', 'dips',
  'submitted_at', 'status'
];

// Default field configuration
const DEFAULT_FIELD_CONFIG = [
  { key: 'fuel_sales', label: 'Fuel Sales ($)', field_type: 'number', is_core: true, is_enabled: true, display_order: 1 },
  { key: 'total_litres', label: 'Total Litres', field_type: 'number', is_core: false, is_enabled: true, display_order: 2 },
  { key: 'shop_sales', label: 'Shop Sales ($)', field_type: 'number', is_core: true, is_enabled: true, display_order: 3 },
  { key: 'beverages', label: 'Beverages ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 4 },
  { key: 'hot_food', label: 'Hot Food ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 5 },
  { key: 'eftpos', label: 'EFTPOS ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 6 },
  { key: 'motorpass', label: 'Motorpass ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 7 },
  { key: 'cash', label: 'Cash ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 8 },
  { key: 'accounts', label: 'Accounts ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 9 },
  { key: 'drive_offs', label: 'Drive Offs ($)', field_type: 'number', is_core: false, is_enabled: true, display_order: 10 },
  { key: 'dips', label: 'Dips ($)', field_type: 'number', is_core: true, is_enabled: true, display_order: 11 },
];

// ============== AUTH ==============
async function handleLogin(request) {
  try {
    const { email, password } = await request.json();
    const db = await getDb();
    
    const user = await db.collection('users').findOne({ email, password });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });
    }
    
    let sites = [];
    
    // Role-based site access
    if (user.role === 'owner') {
      // Owner sees all sites they own
      sites = await db.collection('sites').find({ owner_id: user.id }).toArray();
    } else if (user.role === 'operator') {
      // Operator sees only assigned sites
      const assignments = await db.collection('operator_site_assignments').find({ operator_user_id: user.id }).toArray();
      const siteIds = assignments.map(a => a.site_id);
      sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    } else if (user.role === 'staff') {
      // Staff sees only assigned sites
      const assignments = await db.collection('staff_site_assignments').find({ staff_user_id: user.id }).toArray();
      const siteIds = assignments.map(a => a.site_id);
      sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    }
    
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      },
      sites: sites
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500, headers: corsHeaders });
  }
}

// ============== SEED DATA ==============
async function handleSeed() {
  try {
    const db = await getDb();
    
    // Clear existing data
    await db.collection('users').deleteMany({});
    await db.collection('sites').deleteMany({});
    await db.collection('operator_site_assignments').deleteMany({});
    await db.collection('staff_site_assignments').deleteMany({});
    await db.collection('shift_reports').deleteMany({});
    await db.collection('site_field_configs').deleteMany({});
    await db.collection('site_banking_formulas').deleteMany({});
    await db.collection('shift_report_custom_values').deleteMany({});
    
    const users = demoUsers.map(u => ({ ...u }));
    await db.collection('users').insertMany(users);
    
    const sites = demoSites.map(s => ({ ...s }));
    await db.collection('sites').insertMany(sites);
    
    const { operatorAssignments, staffAssignments } = generateSiteAssignments(users, sites);
    await db.collection('operator_site_assignments').insertMany(operatorAssignments);
    await db.collection('staff_site_assignments').insertMany(staffAssignments);
    
    const reports = generateShiftReports(users, sites, staffAssignments);
    await db.collection('shift_reports').insertMany(reports);
    
    // Generate dynamic field configs for all sites
    const fieldConfigs = generateSiteFieldConfigs(sites, users);
    await db.collection('site_field_configs').insertMany(fieldConfigs);
    
    // Generate banking formulas for all sites
    const bankingFormulas = generateSiteBankingFormulas(sites, users);
    await db.collection('site_banking_formulas').insertMany(bankingFormulas);
    
    return NextResponse.json({
      message: 'Database seeded successfully',
      counts: {
        users: users.length,
        sites: sites.length,
        operator_assignments: operatorAssignments.length,
        staff_assignments: staffAssignments.length,
        reports: reports.length,
        field_configs: fieldConfigs.length,
        banking_formulas: bankingFormulas.length
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Seeding failed: ' + error.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== USERS MANAGEMENT ==============
// Owner: Get only operators
// Operator: Get only staff
async function handleGetUsers(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const requesterId = url.searchParams.get('requesterId'); // For permission checking
    
    let query = {};
    if (role) query.role = role;
    
    const users = await db.collection('users').find(query).toArray();
    
    const safeUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      created_at: u.created_at
    }));
    
    return NextResponse.json(safeUsers, { headers: corsHeaders });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Failed to get users' }, { status: 500, headers: corsHeaders });
  }
}

// Owner creates operators only
// Operator creates staff only
async function handleCreateUser(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Permission check: Owner can only create operators, Operator can only create staff
    if (data.creatorRole === 'owner' && data.role !== 'operator') {
      return NextResponse.json({ error: 'Owner can only create operators' }, { status: 403, headers: corsHeaders });
    }
    if (data.creatorRole === 'operator' && data.role !== 'staff') {
      return NextResponse.json({ error: 'Operator can only create staff' }, { status: 403, headers: corsHeaders });
    }
    
    const existing = await db.collection('users').findOne({ email: data.email });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400, headers: corsHeaders });
    }
    
    const user = {
      id: uuidv4(),
      name: data.name,
      email: data.email,
      password: data.password || 'demo123',
      role: data.role,
      status: 'active',
      created_at: new Date().toISOString()
    };
    
    await db.collection('users').insertOne(user);
    
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateUser(userId, request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const updateData = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.status) updateData.status = data.status;
    if (data.password) updateData.password = data.password;
    
    await db.collection('users').updateOne({ id: userId }, { $set: updateData });
    
    return NextResponse.json({ message: 'User updated' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteUser(userId) {
  try {
    const db = await getDb();
    
    // Check user role to delete from correct assignment table
    const user = await db.collection('users').findOne({ id: userId });
    
    if (user) {
      if (user.role === 'operator') {
        await db.collection('operator_site_assignments').deleteMany({ operator_user_id: userId });
      } else if (user.role === 'staff') {
        await db.collection('staff_site_assignments').deleteMany({ staff_user_id: userId });
      }
    }
    
    await db.collection('users').deleteOne({ id: userId });
    
    return NextResponse.json({ message: 'User deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500, headers: corsHeaders });
  }
}

// ============== OPERATOR ASSIGNMENTS (Owner → Operator) ==============
async function handleGetOperatorAssignments(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const operatorId = url.searchParams.get('operatorId');
    const ownerId = url.searchParams.get('ownerId');
    
    let query = {};
    if (operatorId) query.operator_user_id = operatorId;
    if (ownerId) query.assigned_by_owner_id = ownerId;
    
    const assignments = await db.collection('operator_site_assignments').find(query).toArray();
    
    // Enrich with user and site details
    const operatorIds = [...new Set(assignments.map(a => a.operator_user_id))];
    const siteIds = [...new Set(assignments.map(a => a.site_id))];
    
    const operators = await db.collection('users').find({ id: { $in: operatorIds } }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    
    const operatorMap = Object.fromEntries(operators.map(u => [u.id, u]));
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    const enriched = assignments.map(a => ({
      ...a,
      operator: operatorMap[a.operator_user_id] ? {
        id: operatorMap[a.operator_user_id].id,
        name: operatorMap[a.operator_user_id].name,
        email: operatorMap[a.operator_user_id].email
      } : null,
      site: siteMap[a.site_id] || null
    }));
    
    return NextResponse.json(enriched, { headers: corsHeaders });
  } catch (error) {
    console.error('Get operator assignments error:', error);
    return NextResponse.json({ error: 'Failed to get assignments' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateOperatorAssignment(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Verify operator exists and is actually an operator
    const operator = await db.collection('users').findOne({ id: data.operator_user_id });
    if (!operator || operator.role !== 'operator') {
      return NextResponse.json({ error: 'Invalid operator' }, { status: 400, headers: corsHeaders });
    }
    
    // Check for duplicate assignment
    const existing = await db.collection('operator_site_assignments').findOne({
      operator_user_id: data.operator_user_id,
      site_id: data.site_id
    });
    
    if (existing) {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 400, headers: corsHeaders });
    }
    
    const assignment = {
      id: uuidv4(),
      operator_user_id: data.operator_user_id,
      site_id: data.site_id,
      assigned_by_owner_id: data.assigned_by_owner_id,
      created_at: new Date().toISOString()
    };
    
    await db.collection('operator_site_assignments').insertOne(assignment);
    
    return NextResponse.json(assignment, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create operator assignment error:', error);
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteOperatorAssignment(assignmentId) {
  try {
    const db = await getDb();
    await db.collection('operator_site_assignments').deleteOne({ id: assignmentId });
    return NextResponse.json({ message: 'Assignment deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete operator assignment error:', error);
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500, headers: corsHeaders });
  }
}

// ============== STAFF ASSIGNMENTS (Operator → Staff) ==============
async function handleGetStaffAssignments(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const staffId = url.searchParams.get('staffId');
    const operatorId = url.searchParams.get('operatorId');
    const siteId = url.searchParams.get('siteId');
    
    let query = {};
    if (staffId) query.staff_user_id = staffId;
    if (operatorId) query.assigned_by_operator_id = operatorId;
    if (siteId) query.site_id = siteId;
    
    const assignments = await db.collection('staff_site_assignments').find(query).toArray();
    
    // Enrich with user and site details
    const staffIds = [...new Set(assignments.map(a => a.staff_user_id))];
    const siteIds = [...new Set(assignments.map(a => a.site_id))];
    
    const staffUsers = await db.collection('users').find({ id: { $in: staffIds } }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    
    const staffMap = Object.fromEntries(staffUsers.map(u => [u.id, u]));
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    const enriched = assignments.map(a => ({
      ...a,
      staff: staffMap[a.staff_user_id] ? {
        id: staffMap[a.staff_user_id].id,
        name: staffMap[a.staff_user_id].name,
        email: staffMap[a.staff_user_id].email
      } : null,
      site: siteMap[a.site_id] || null
    }));
    
    return NextResponse.json(enriched, { headers: corsHeaders });
  } catch (error) {
    console.error('Get staff assignments error:', error);
    return NextResponse.json({ error: 'Failed to get assignments' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateStaffAssignment(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Verify staff exists and is actually a staff member
    const staff = await db.collection('users').findOne({ id: data.staff_user_id });
    if (!staff || staff.role !== 'staff') {
      return NextResponse.json({ error: 'Invalid staff user' }, { status: 400, headers: corsHeaders });
    }
    
    // CRITICAL: Verify operator has access to this site
    const operatorHasAccess = await db.collection('operator_site_assignments').findOne({
      operator_user_id: data.assigned_by_operator_id,
      site_id: data.site_id
    });
    
    if (!operatorHasAccess) {
      return NextResponse.json({ 
        error: 'Operator does not have access to this site' 
      }, { status: 403, headers: corsHeaders });
    }
    
    // Check for duplicate assignment
    const existing = await db.collection('staff_site_assignments').findOne({
      staff_user_id: data.staff_user_id,
      site_id: data.site_id
    });
    
    if (existing) {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 400, headers: corsHeaders });
    }
    
    const assignment = {
      id: uuidv4(),
      staff_user_id: data.staff_user_id,
      site_id: data.site_id,
      assigned_by_operator_id: data.assigned_by_operator_id,
      created_at: new Date().toISOString()
    };
    
    await db.collection('staff_site_assignments').insertOne(assignment);
    
    return NextResponse.json(assignment, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create staff assignment error:', error);
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteStaffAssignment(assignmentId) {
  try {
    const db = await getDb();
    await db.collection('staff_site_assignments').deleteOne({ id: assignmentId });
    return NextResponse.json({ message: 'Assignment deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete staff assignment error:', error);
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500, headers: corsHeaders });
  }
}

// ============== SITES MANAGEMENT ==============
async function handleGetSites(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      const assignments = await db.collection('user_site_assignments').find({ user_id: userId }).toArray();
      const siteIds = assignments.map(a => a.site_id);
      const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
      return NextResponse.json(sites, { headers: corsHeaders });
    }
    
    const sites = await db.collection('sites').find({}).toArray();
    return NextResponse.json(sites, { headers: corsHeaders });
  } catch (error) {
    console.error('Get sites error:', error);
    return NextResponse.json({ error: 'Failed to get sites' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateSite(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const site = {
      id: uuidv4(),
      name: data.name,
      code: data.code,
      location: data.location || '',
      owner_id: data.owner_id,
      status: 'active',
      created_at: new Date().toISOString()
    };
    
    await db.collection('sites').insertOne(site);
    
    // Auto-assign site to owner
    await db.collection('user_site_assignments').insertOne({
      id: uuidv4(),
      user_id: data.owner_id,
      site_id: site.id,
      assigned_by_user_id: data.owner_id,
      created_at: new Date().toISOString()
    });
    
    // Create default field configs for new site
    const fieldConfigs = DEFAULT_FIELD_CONFIG.map((f, idx) => ({
      id: uuidv4(),
      site_id: site.id,
      ...f,
      created_by_user_id: data.owner_id,
      created_at: new Date().toISOString()
    }));
    await db.collection('site_field_configs').insertMany(fieldConfigs);
    
    return NextResponse.json(site, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create site error:', error);
    return NextResponse.json({ error: 'Failed to create site' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateSite(siteId, request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const updateData = {};
    if (data.name) updateData.name = data.name;
    if (data.code) updateData.code = data.code;
    if (data.location) updateData.location = data.location;
    if (data.status) updateData.status = data.status;
    
    await db.collection('sites').updateOne({ id: siteId }, { $set: updateData });
    
    return NextResponse.json({ message: 'Site updated' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update site error:', error);
    return NextResponse.json({ error: 'Failed to update site' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetSiteById(siteId) {
  try {
    const db = await getDb();
    const site = await db.collection('sites').findOne({ id: siteId });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: corsHeaders });
    }
    
    return NextResponse.json(site, { headers: corsHeaders });
  } catch (error) {
    console.error('Get site error:', error);
    return NextResponse.json({ error: 'Failed to get site' }, { status: 500, headers: corsHeaders });
  }
}

// ============== SITE FIELD CONFIGS ==============
async function handleGetFieldConfigs(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId') || url.searchParams.get('site_id');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400, headers: corsHeaders });
    }
    
    const configs = await db.collection('site_field_configs')
      .find({ site_id: siteId })
      .sort({ display_order: 1 })
      .toArray();
    
    return NextResponse.json(configs, { headers: corsHeaders });
  } catch (error) {
    console.error('Get field configs error:', error);
    return NextResponse.json({ error: 'Failed to get field configs' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateFieldConfig(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // PERMISSION CHECK: Only operators can create field configs
    if (data.creatorRole && data.creatorRole !== 'operator') {
      return NextResponse.json({ error: 'Only operators can manage field configurations' }, { status: 403, headers: corsHeaders });
    }
    
    // Security: Prevent creating core fields - only custom fields allowed
    if (data.is_core === true || CORE_FIELDS.includes(data.key)) {
      return NextResponse.json({ error: 'Cannot create core fields via API' }, { status: 403, headers: corsHeaders });
    }
    
    const config = {
      id: uuidv4(),
      site_id: data.site_id,
      key: data.key || `custom_${Date.now()}`,
      label: data.label,
      field_type: data.field_type || 'number',
      is_core: false, // Always false for API-created fields
      is_enabled: true,
      display_order: data.display_order || 99,
      created_by_user_id: data.created_by_user_id,
      created_at: new Date().toISOString()
    };
    
    await db.collection('site_field_configs').insertOne(config);
    
    return NextResponse.json(config, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create field config error:', error);
    return NextResponse.json({ error: 'Failed to create field config' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateFieldConfig(configId, request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Prevent updating core field properties
    const config = await db.collection('site_field_configs').findOne({ id: configId });
    if (config?.is_core && data.is_enabled === false) {
      return NextResponse.json({ error: 'Cannot disable core fields' }, { status: 400, headers: corsHeaders });
    }
    
    const updateData = {};
    if (data.label !== undefined) updateData.label = data.label;
    if (data.is_enabled !== undefined && !config?.is_core) updateData.is_enabled = data.is_enabled;
    if (data.display_order !== undefined) updateData.display_order = data.display_order;
    
    await db.collection('site_field_configs').updateOne({ id: configId }, { $set: updateData });
    
    return NextResponse.json({ message: 'Field config updated' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update field config error:', error);
    return NextResponse.json({ error: 'Failed to update field config' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteFieldConfig(configId) {
  try {
    const db = await getDb();
    
    const config = await db.collection('site_field_configs').findOne({ id: configId });
    if (config?.is_core) {
      return NextResponse.json({ error: 'Cannot delete core fields' }, { status: 400, headers: corsHeaders });
    }
    
    await db.collection('site_field_configs').deleteOne({ id: configId });
    
    return NextResponse.json({ message: 'Field config deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete field config error:', error);
    return NextResponse.json({ error: 'Failed to delete field config' }, { status: 500, headers: corsHeaders });
  }
}

async function handleBulkUpdateFieldConfigs(request) {
  try {
    const db = await getDb();
    const { configs } = await request.json();
    
    for (const config of configs) {
      const existing = await db.collection('site_field_configs').findOne({ id: config.id });
      if (existing?.is_core && config.is_enabled === false) continue;
      
      await db.collection('site_field_configs').updateOne(
        { id: config.id },
        { $set: { label: config.label, is_enabled: config.is_enabled, display_order: config.display_order } }
      );
    }
    
    return NextResponse.json({ message: 'Field configs updated' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Bulk update field configs error:', error);
    return NextResponse.json({ error: 'Failed to update field configs' }, { status: 500, headers: corsHeaders });
  }
}

// ============== BANKING FORMULAS ==============
async function handleGetBankingFormulas(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId') || url.searchParams.get('site_id');
    
    let query = {};
    if (siteId) query.site_id = siteId;
    
    const formulas = await db.collection('site_banking_formulas').find(query).toArray();
    
    return NextResponse.json(formulas, { headers: corsHeaders });
  } catch (error) {
    console.error('Get banking formulas error:', error);
    return NextResponse.json({ error: 'Failed to get banking formulas' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateBankingFormula(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // PERMISSION CHECK: Only operators can create banking formulas
    if (data.creatorRole && data.creatorRole !== 'operator') {
      return NextResponse.json({ error: 'Only operators can manage banking formulas' }, { status: 403, headers: corsHeaders });
    }
    
    const formula = {
      id: uuidv4(),
      site_id: data.site_id,
      name: data.name,
      formula_json: data.formula_json,
      result_label: data.result_label || 'Banking Result',
      is_active: true,
      created_by_user_id: data.created_by_user_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await db.collection('site_banking_formulas').insertOne(formula);
    
    return NextResponse.json(formula, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create banking formula error:', error);
    return NextResponse.json({ error: 'Failed to create banking formula' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateBankingFormula(formulaId, request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const updateData = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.formula_json !== undefined) updateData.formula_json = data.formula_json;
    if (data.result_label !== undefined) updateData.result_label = data.result_label;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    
    await db.collection('site_banking_formulas').updateOne({ id: formulaId }, { $set: updateData });
    
    return NextResponse.json({ message: 'Banking formula updated' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update banking formula error:', error);
    return NextResponse.json({ error: 'Failed to update banking formula' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteBankingFormula(formulaId) {
  try {
    const db = await getDb();
    await db.collection('site_banking_formulas').deleteOne({ id: formulaId });
    return NextResponse.json({ message: 'Banking formula deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete banking formula error:', error);
    return NextResponse.json({ error: 'Failed to delete banking formula' }, { status: 500, headers: corsHeaders });
  }
}

// Calculate banking value from formula
function calculateBankingValue(formula, reportData) {
  try {
    const parsed = JSON.parse(formula.formula_json);
    const operations = parsed.operations || [];
    
    let result = 0;
    let currentOp = '+';
    
    for (const op of operations) {
      if (op.type === 'operator') {
        currentOp = op.value;
      } else if (op.type === 'field') {
        const value = parseFloat(reportData[op.value]) || 0;
        switch (currentOp) {
          case '+': result += value; break;
          case '-': result -= value; break;
          case '*': result *= value; break;
          case '/': result = value !== 0 ? result / value : result; break;
        }
      } else if (op.type === 'number') {
        const value = parseFloat(op.value) || 0;
        switch (currentOp) {
          case '+': result += value; break;
          case '-': result -= value; break;
          case '*': result *= value; break;
          case '/': result = value !== 0 ? result / value : result; break;
        }
      }
    }
    
    return Math.round(result * 100) / 100;
  } catch (e) {
    return 0;
  }
}

// ============== BANKING CALCULATOR ==============
async function handleBankingCalculate(request) {
  try {
    const { formula_json } = await request.json();
    
    if (!formula_json) {
      return NextResponse.json({ error: 'formula_json required' }, { status: 400, headers: corsHeaders });
    }
    
    // Parse and evaluate the formula
    const parsed = typeof formula_json === 'string' ? JSON.parse(formula_json) : formula_json;
    
    // Support simple {operator, value1, value2} format
    if (parsed.operator && parsed.value1 !== undefined && parsed.value2 !== undefined) {
      const v1 = parseFloat(parsed.value1) || 0;
      const v2 = parseFloat(parsed.value2) || 0;
      let result = 0;
      
      switch (parsed.operator) {
        case '+': result = v1 + v2; break;
        case '-': result = v1 - v2; break;
        case '*': result = v1 * v2; break;
        case '/': 
          if (v2 === 0) {
            return NextResponse.json({ error: 'Division by zero' }, { status: 400, headers: corsHeaders });
          }
          result = v1 / v2; 
          break;
        default:
          return NextResponse.json({ error: 'Invalid operator. Use: +, -, *, /' }, { status: 400, headers: corsHeaders });
      }
      
      return NextResponse.json({ result: Math.round(result * 100) / 100 }, { headers: corsHeaders });
    }
    
    // Support complex operations array format
    if (parsed.operations && Array.isArray(parsed.operations)) {
      const mockData = {}; // For complex formulas with fields, pass empty object
      const result = calculateBankingValue({ formula_json: JSON.stringify(parsed) }, mockData);
      return NextResponse.json({ result }, { headers: corsHeaders });
    }
    
    return NextResponse.json({ error: 'Invalid formula format' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('Banking calculate error:', error);
    return NextResponse.json({ error: 'Calculation failed: ' + error.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== SITE ASSIGNMENTS ==============
async function handleGetAssignments(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const siteId = url.searchParams.get('siteId');
    
    let query = {};
    if (userId) query.user_id = userId;
    if (siteId) query.site_id = siteId;
    
    const assignments = await db.collection('user_site_assignments').find(query).toArray();
    
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    const siteIds = [...new Set(assignments.map(a => a.site_id))];
    
    const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    const enriched = assignments.map(a => ({
      ...a,
      user_name: userMap[a.user_id]?.name || 'Unknown',
      user_email: userMap[a.user_id]?.email || '',
      user_role: userMap[a.user_id]?.role || '',
      site_name: siteMap[a.site_id]?.name || 'Unknown',
      site_code: siteMap[a.site_id]?.code || ''
    }));
    
    return NextResponse.json(enriched, { headers: corsHeaders });
  } catch (error) {
    console.error('Get assignments error:', error);
    return NextResponse.json({ error: 'Failed to get assignments' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateAssignment(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const existing = await db.collection('user_site_assignments').findOne({
      user_id: data.user_id,
      site_id: data.site_id
    });
    
    if (existing) {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 400, headers: corsHeaders });
    }
    
    const assigner = await db.collection('users').findOne({ id: data.assigned_by_user_id });
    if (assigner.role !== 'owner') {
      const assignerAccess = await db.collection('user_site_assignments').findOne({
        user_id: data.assigned_by_user_id,
        site_id: data.site_id
      });
      if (!assignerAccess) {
        return NextResponse.json({ error: 'You do not have access to assign this site' }, { status: 403, headers: corsHeaders });
      }
    }
    
    const assignment = {
      id: uuidv4(),
      user_id: data.user_id,
      site_id: data.site_id,
      assigned_by_user_id: data.assigned_by_user_id,
      created_at: new Date().toISOString()
    };
    
    await db.collection('user_site_assignments').insertOne(assignment);
    
    return NextResponse.json(assignment, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create assignment error:', error);
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500, headers: corsHeaders });
  }
}

async function handleDeleteAssignment(assignmentId) {
  try {
    const db = await getDb();
    await db.collection('user_site_assignments').deleteOne({ id: assignmentId });
    return NextResponse.json({ message: 'Assignment deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500, headers: corsHeaders });
  }
}

// ============== SHIFT REPORTS ==============
async function handleGetReports(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const siteId = url.searchParams.get('siteId');
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const status = url.searchParams.get('status');
    
    let query = {};
    
    if (siteId) {
      query.site_id = siteId;
    } else if (siteIds && siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    
    if (userId) {
      query.submitted_by_user_id = userId;
    }
    
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query.date = { $gte: startDate };
    } else if (endDate) {
      query.date = { $lte: endDate };
    }
    
    if (status) {
      query.status = status;
    }
    
    const reports = await db.collection('shift_reports')
      .find(query)
      .sort({ submitted_at: -1 })
      .toArray();
    
    const userIds = [...new Set(reports.map(r => r.submitted_by_user_id))];
    const reportSiteIds = [...new Set(reports.map(r => r.site_id))];
    
    const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: reportSiteIds } }).toArray();
    
    // Get banking formulas for all sites
    const bankingFormulas = await db.collection('site_banking_formulas')
      .find({ site_id: { $in: reportSiteIds }, is_active: true })
      .toArray();
    const formulaMap = {};
    bankingFormulas.forEach(f => {
      if (!formulaMap[f.site_id]) formulaMap[f.site_id] = [];
      formulaMap[f.site_id].push(f);
    });
    
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    const enrichedReports = reports.map(r => {
      // Calculate banking for this report
      let banking_value = 0;
      const siteFormulas = formulaMap[r.site_id] || [];
      siteFormulas.forEach(f => {
        banking_value += calculateBankingValue(f, r);
      });
      
      return {
        ...r,
        staff_name: userMap[r.submitted_by_user_id]?.name || 'Unknown',
        site_name: siteMap[r.site_id]?.name || 'Unknown',
        site_code: siteMap[r.site_id]?.code || '',
        banking_value: Math.round(banking_value * 100) / 100
      };
    });
    
    return NextResponse.json(enrichedReports, { headers: corsHeaders });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json({ error: 'Failed to get reports' }, { status: 500, headers: corsHeaders });
  }
}

// ============== DAILY ROLLUPS ==============
async function handleGetDailyRollups(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean) || [];
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    let query = {};
    if (siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const reports = await db.collection('shift_reports').find(query).toArray();
    const sites = await db.collection('sites').find(
      siteIds.length > 0 ? { id: { $in: siteIds } } : {}
    ).toArray();
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    // Get banking formulas
    const bankingFormulas = await db.collection('site_banking_formulas')
      .find({ site_id: { $in: siteIds }, is_active: true })
      .toArray();
    const formulaMap = {};
    bankingFormulas.forEach(f => {
      if (!formulaMap[f.site_id]) formulaMap[f.site_id] = [];
      formulaMap[f.site_id].push(f);
    });
    
    // Group by site_id + date
    const rollupMap = {};
    
    reports.forEach(r => {
      const key = `${r.site_id}_${r.date}`;
      if (!rollupMap[key]) {
        rollupMap[key] = {
          site_id: r.site_id,
          site_name: siteMap[r.site_id]?.name || 'Unknown',
          site_code: siteMap[r.site_id]?.code || '',
          date: r.date,
          total_sales: 0,
          fuel_sales: 0,
          total_litres: 0,
          eftpos: 0,
          motorpass: 0,
          cash: 0,
          shop_sales: 0,
          beverages: 0,
          hot_food: 0,
          accounts: 0,
          drive_offs: 0,
          dips: 0,
          total_revenue: 0,
          banking_value: 0,
          shift_count: 0,
          shifts: [],
          pending_count: 0,
          reviewed_count: 0
        };
      }
      
      const rollup = rollupMap[key];
      rollup.total_sales += r.total_sales || 0;
      rollup.fuel_sales += r.fuel_sales || 0;
      rollup.total_litres += r.total_litres || 0;
      rollup.eftpos += r.eftpos || 0;
      rollup.motorpass += r.motorpass || 0;
      rollup.cash += r.cash || 0;
      rollup.shop_sales += r.shop_sales || 0;
      rollup.beverages += r.beverages || 0;
      rollup.hot_food += r.hot_food || 0;
      rollup.accounts += r.accounts || 0;
      rollup.drive_offs += r.drive_offs || 0;
      rollup.dips += r.dips || 0;
      rollup.total_revenue += r.total_revenue || 0;
      rollup.shift_count++;
      rollup.shifts.push({
        id: r.id,
        shift_type: r.shift_type,
        total_revenue: r.total_revenue,
        status: r.status,
        submitted_at: r.submitted_at
      });
      if (r.status === 'pending') rollup.pending_count++;
      else rollup.reviewed_count++;
    });
    
    // Calculate banking for rollups
    const rollups = Object.values(rollupMap).map(r => {
      const siteFormulas = formulaMap[r.site_id] || [];
      let bankingValue = 0;
      siteFormulas.forEach(f => {
        bankingValue += calculateBankingValue(f, r);
      });
      
      return {
        ...r,
        total_sales: Math.round(r.total_sales * 100) / 100,
        fuel_sales: Math.round(r.fuel_sales * 100) / 100,
        total_litres: Math.round(r.total_litres * 100) / 100,
        eftpos: Math.round(r.eftpos * 100) / 100,
        motorpass: Math.round(r.motorpass * 100) / 100,
        cash: Math.round(r.cash * 100) / 100,
        shop_sales: Math.round(r.shop_sales * 100) / 100,
        beverages: Math.round(r.beverages * 100) / 100,
        hot_food: Math.round(r.hot_food * 100) / 100,
        accounts: Math.round(r.accounts * 100) / 100,
        drive_offs: Math.round(r.drive_offs * 100) / 100,
        dips: Math.round(r.dips * 100) / 100,
        total_revenue: Math.round(r.total_revenue * 100) / 100,
        banking_value: Math.round(bankingValue * 100) / 100
      };
    });
    
    // Sort by date descending, then by site
    rollups.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.site_name.localeCompare(b.site_name);
    });
    
    return NextResponse.json(rollups, { headers: corsHeaders });
  } catch (error) {
    console.error('Get daily rollups error:', error);
    return NextResponse.json({ error: 'Failed to get daily rollups' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateReport(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    const requiredFields = ['site_id', 'submitted_by_user_id', 'date', 'shift_type'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400, headers: corsHeaders });
      }
    }
    
    const assignment = await db.collection('user_site_assignments').findOne({
      user_id: data.submitted_by_user_id,
      site_id: data.site_id
    });
    
    if (!assignment) {
      return NextResponse.json({ error: 'You are not authorized for this site' }, { status: 403, headers: corsHeaders });
    }
    
    const fuelSales = parseFloat(data.fuel_sales) || 0;
    const shopSales = parseFloat(data.shop_sales) || 0;
    
    const report = {
      id: uuidv4(),
      site_id: data.site_id,
      submitted_by_user_id: data.submitted_by_user_id,
      date: data.date,
      shift_type: data.shift_type,
      total_sales: fuelSales + shopSales,
      fuel_sales: fuelSales,
      total_litres: parseFloat(data.total_litres) || 0,
      eftpos: parseFloat(data.eftpos) || 0,
      motorpass: parseFloat(data.motorpass) || 0,
      cash: parseFloat(data.cash) || 0,
      shop_sales: shopSales,
      beverages: parseFloat(data.beverages) || 0,
      hot_food: parseFloat(data.hot_food) || 0,
      accounts: parseFloat(data.accounts) || 0,
      drive_offs: parseFloat(data.drive_offs) || 0,
      dips: parseFloat(data.dips) || 0,
      notes: data.notes || '',
      total_revenue: fuelSales + shopSales,
      difference_value: null,
      status: 'pending',
      submitted_at: new Date().toISOString(),
      reviewed_by_user_id: null,
      reviewed_at: null,
      custom_values: data.custom_values || {}
    };
    
    await db.collection('shift_reports').insertOne(report);
    
    return NextResponse.json(report, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create report error:', error);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetReportById(reportId) {
  try {
    const db = await getDb();
    const report = await db.collection('shift_reports').findOne({ id: reportId });
    
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404, headers: corsHeaders });
    }
    
    const user = await db.collection('users').findOne({ id: report.submitted_by_user_id });
    const site = await db.collection('sites').findOne({ id: report.site_id });
    const reviewer = report.reviewed_by_user_id ? 
      await db.collection('users').findOne({ id: report.reviewed_by_user_id }) : null;
    
    // Get banking formulas and calculate
    const formulas = await db.collection('site_banking_formulas')
      .find({ site_id: report.site_id, is_active: true })
      .toArray();
    
    let banking_value = 0;
    formulas.forEach(f => {
      banking_value += calculateBankingValue(f, report);
    });
    
    return NextResponse.json({
      ...report,
      staff_name: user?.name || 'Unknown',
      site_name: site?.name || 'Unknown',
      site_code: site?.code || '',
      reviewed_by_name: reviewer?.name || null,
      banking_value: Math.round(banking_value * 100) / 100
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get report error:', error);
    return NextResponse.json({ error: 'Failed to get report' }, { status: 500, headers: corsHeaders });
  }
}

async function handleUpdateReportStatus(reportId, request) {
  try {
    const db = await getDb();
    const { status, reviewed_by_user_id } = await request.json();
    
    if (!['pending', 'reviewed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400, headers: corsHeaders });
    }
    
    const updateData = { status };
    if (status === 'reviewed' && reviewed_by_user_id) {
      updateData.reviewed_by_user_id = reviewed_by_user_id;
      updateData.reviewed_at = new Date().toISOString();
    } else if (status === 'pending') {
      updateData.reviewed_by_user_id = null;
      updateData.reviewed_at = null;
    }
    
    const result = await db.collection('shift_reports').updateOne(
      { id: reportId },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404, headers: corsHeaders });
    }
    
    return NextResponse.json({ message: 'Status updated', status }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update status error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500, headers: corsHeaders });
  }
}

// ============== DASHBOARD STATS ==============
async function handleGetDashboardStats(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean) || [];
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    let query = {};
    if (siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const reports = await db.collection('shift_reports').find(query).toArray();
    
    // Get banking formulas
    const bankingFormulas = await db.collection('site_banking_formulas')
      .find({ site_id: { $in: siteIds }, is_active: true })
      .toArray();
    const formulaMap = {};
    bankingFormulas.forEach(f => {
      if (!formulaMap[f.site_id]) formulaMap[f.site_id] = [];
      formulaMap[f.site_id].push(f);
    });
    
    const stats = {
      totalShopSales: 0,
      totalFuelSales: 0,
      totalRevenue: 0,
      totalDips: 0,
      totalDriveOffs: 0,
      totalBanking: 0,
      totalReports: reports.length,
      pendingReports: 0,
      reviewedReports: 0
    };
    
    reports.forEach(r => {
      stats.totalShopSales += r.shop_sales || 0;
      stats.totalFuelSales += r.fuel_sales || 0;
      stats.totalRevenue += r.total_revenue || 0;
      stats.totalDips += r.dips || 0;
      stats.totalDriveOffs += r.drive_offs || 0;
      
      // Calculate banking
      const siteFormulas = formulaMap[r.site_id] || [];
      siteFormulas.forEach(f => {
        stats.totalBanking += calculateBankingValue(f, r);
      });
      
      if (r.status === 'pending') stats.pendingReports++;
      else stats.reviewedReports++;
    });
    
    stats.totalShopSales = Math.round(stats.totalShopSales * 100) / 100;
    stats.totalFuelSales = Math.round(stats.totalFuelSales * 100) / 100;
    stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
    stats.totalDips = Math.round(stats.totalDips * 100) / 100;
    stats.totalDriveOffs = Math.round(stats.totalDriveOffs * 100) / 100;
    stats.totalBanking = Math.round(stats.totalBanking * 100) / 100;
    
    // Calculate top and lowest performing sites
    // Calculate per-site revenue for top/lowest performers
    const siteRevenue = {};
    reports.forEach(r => {
      if (!siteRevenue[r.site_id]) {
        siteRevenue[r.site_id] = 0;
      }
      siteRevenue[r.site_id] += r.total_revenue || 0;
    });
    
    if (Object.keys(siteRevenue).length > 0) {
      const sites = await db.collection('sites').find({ id: { $in: Object.keys(siteRevenue) } }).toArray();
      const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
      
      const sitesWithRevenue = Object.entries(siteRevenue).map(([siteId, revenue]) => ({
        siteId,
        siteName: siteMap[siteId]?.name || 'Unknown Site',
        siteCode: siteMap[siteId]?.code || '',
        revenue: Math.round(revenue * 100) / 100
      }));
      
      sitesWithRevenue.sort((a, b) => b.revenue - a.revenue);
      
      stats.topPerformingSite = sitesWithRevenue[0] || null;
      stats.lowestPerformingSite = sitesWithRevenue[sitesWithRevenue.length - 1] || null;
    } else {
      stats.topPerformingSite = null;
      stats.lowestPerformingSite = null;
    }
    
    return NextResponse.json(stats, { headers: corsHeaders });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetSiteStats(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean) || [];
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    let query = {};
    if (siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const reports = await db.collection('shift_reports').find(query).toArray();
    const sites = await db.collection('sites').find(
      siteIds.length > 0 ? { id: { $in: siteIds } } : {}
    ).toArray();
    
    const siteStats = sites.map(site => {
      const siteReports = reports.filter(r => r.site_id === site.id);
      return {
        siteId: site.id,
        siteName: site.name,
        siteCode: site.code,
        shopSales: Math.round(siteReports.reduce((sum, r) => sum + (r.shop_sales || 0), 0) * 100) / 100,
        fuelSales: Math.round(siteReports.reduce((sum, r) => sum + (r.fuel_sales || 0), 0) * 100) / 100,
        totalRevenue: Math.round(siteReports.reduce((sum, r) => sum + (r.total_revenue || 0), 0) * 100) / 100,
        dips: Math.round(siteReports.reduce((sum, r) => sum + (r.dips || 0), 0) * 100) / 100,
        driveOffs: Math.round(siteReports.reduce((sum, r) => sum + (r.drive_offs || 0), 0) * 100) / 100,
        reportCount: siteReports.length
      };
    });
    
    return NextResponse.json(siteStats, { headers: corsHeaders });
  } catch (error) {
    console.error('Site stats error:', error);
    return NextResponse.json({ error: 'Failed to get site stats' }, { status: 500, headers: corsHeaders });
  }
}

async function handleGetRevenueChart(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean) || [];
    const days = parseInt(url.searchParams.get('days')) || 7;
    
    let query = {};
    if (siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    query.date = {
      $gte: startDate.toISOString().split('T')[0],
      $lte: endDate.toISOString().split('T')[0]
    };
    
    const reports = await db.collection('shift_reports').find(query).toArray();
    
    const dateMap = {};
    for (let i = 0; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - i));
      const dateStr = d.toISOString().split('T')[0];
      dateMap[dateStr] = { date: dateStr, revenue: 0, shopSales: 0, fuelSales: 0 };
    }
    
    reports.forEach(r => {
      if (dateMap[r.date]) {
        dateMap[r.date].revenue += r.total_revenue || 0;
        dateMap[r.date].shopSales += r.shop_sales || 0;
        dateMap[r.date].fuelSales += r.fuel_sales || 0;
      }
    });
    
    const chartData = Object.values(dateMap).map(d => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
      shopSales: Math.round(d.shopSales * 100) / 100,
      fuelSales: Math.round(d.fuelSales * 100) / 100
    }));
    
    return NextResponse.json(chartData, { headers: corsHeaders });
  } catch (error) {
    console.error('Revenue chart error:', error);
    return NextResponse.json({ error: 'Failed to get chart data' }, { status: 500, headers: corsHeaders });
  }
}

// ============== EXPORT ==============
async function handleExport(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'xlsx';
    const siteIds = url.searchParams.get('siteIds')?.split(',').filter(Boolean) || [];
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const viewType = url.searchParams.get('viewType') || 'daily';
    
    let query = {};
    if (siteIds.length > 0) {
      query.site_id = { $in: siteIds };
    }
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const reports = await db.collection('shift_reports').find(query).sort({ date: -1 }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    const users = await db.collection('users').find({}).toArray();
    
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    
    let exportData = [];
    
    if (viewType === 'daily') {
      // Group by site + date for daily view
      const rollupMap = {};
      reports.forEach(r => {
        const key = `${r.site_id}_${r.date}`;
        if (!rollupMap[key]) {
          rollupMap[key] = {
            Site: siteMap[r.site_id]?.name || 'Unknown',
            'Site Code': siteMap[r.site_id]?.code || '',
            Date: r.date,
            'Total Revenue': 0,
            'Fuel Sales': 0,
            'Shop Sales': 0,
            'Total Litres': 0,
            'EFTPOS': 0,
            'Motorpass': 0,
            'Cash': 0,
            'Accounts': 0,
            'Beverages': 0,
            'Hot Food': 0,
            'Drive Offs': 0,
            'Dips': 0,
            'Shift Count': 0
          };
        }
        const rollup = rollupMap[key];
        rollup['Total Revenue'] += r.total_revenue || 0;
        rollup['Fuel Sales'] += r.fuel_sales || 0;
        rollup['Shop Sales'] += r.shop_sales || 0;
        rollup['Total Litres'] += r.total_litres || 0;
        rollup['EFTPOS'] += r.eftpos || 0;
        rollup['Motorpass'] += r.motorpass || 0;
        rollup['Cash'] += r.cash || 0;
        rollup['Accounts'] += r.accounts || 0;
        rollup['Beverages'] += r.beverages || 0;
        rollup['Hot Food'] += r.hot_food || 0;
        rollup['Drive Offs'] += r.drive_offs || 0;
        rollup['Dips'] += r.dips || 0;
        rollup['Shift Count']++;
      });
      
      exportData = Object.values(rollupMap).map(r => ({
        ...r,
        'Total Revenue': Math.round(r['Total Revenue'] * 100) / 100,
        'Fuel Sales': Math.round(r['Fuel Sales'] * 100) / 100,
        'Shop Sales': Math.round(r['Shop Sales'] * 100) / 100,
        'Total Litres': Math.round(r['Total Litres'] * 100) / 100,
        'EFTPOS': Math.round(r['EFTPOS'] * 100) / 100,
        'Motorpass': Math.round(r['Motorpass'] * 100) / 100,
        'Cash': Math.round(r['Cash'] * 100) / 100,
        'Accounts': Math.round(r['Accounts'] * 100) / 100,
        'Beverages': Math.round(r['Beverages'] * 100) / 100,
        'Hot Food': Math.round(r['Hot Food'] * 100) / 100,
        'Drive Offs': Math.round(r['Drive Offs'] * 100) / 100,
        'Dips': Math.round(r['Dips'] * 100) / 100
      }));
    } else {
      // Shift view
      exportData = reports.map(r => ({
        Site: siteMap[r.site_id]?.name || 'Unknown',
        'Site Code': siteMap[r.site_id]?.code || '',
        Date: r.date,
        Shift: r.shift_type,
        'Staff Name': userMap[r.submitted_by_user_id]?.name || 'Unknown',
        'Total Revenue': r.total_revenue || 0,
        'Fuel Sales': r.fuel_sales || 0,
        'Shop Sales': r.shop_sales || 0,
        'Total Litres': r.total_litres || 0,
        'EFTPOS': r.eftpos || 0,
        'Motorpass': r.motorpass || 0,
        'Cash': r.cash || 0,
        'Accounts': r.accounts || 0,
        'Beverages': r.beverages || 0,
        'Hot Food': r.hot_food || 0,
        'Drive Offs': r.drive_offs || 0,
        'Dips': r.dips || 0,
        'Status': r.status,
        'Submitted At': r.submitted_at
      }));
    }
    
    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, viewType === 'daily' ? 'Daily Summary' : 'Shift Reports');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(buffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="workflowlite_export_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      });
    } else if (format === 'json') {
      return NextResponse.json(exportData, { headers: corsHeaders });
    }
    
    return NextResponse.json({ error: 'Unsupported format' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export: ' + error.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== ROUTE HANDLER ==============
export async function GET(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'reports' && path[1] === 'daily-rollup') {
    return handleGetDailyRollups(request);
  }
  if (path[0] === 'reports' && path[1]) {
    return handleGetReportById(path[1]);
  }
  if (path[0] === 'reports') {
    return handleGetReports(request);
  }
  // Backward compatibility with old path
  if (path[0] === 'daily-rollups') {
    return handleGetDailyRollups(request);
  }
  if (path[0] === 'sites' && path[1]) {
    return handleGetSiteById(path[1]);
  }
  if (path[0] === 'sites') {
    return handleGetSites(request);
  }
  if (path[0] === 'users') {
    return handleGetUsers(request);
  }
  if (path[0] === 'operator-assignments') {
    return handleGetOperatorAssignments(request);
  }
  if (path[0] === 'staff-assignments') {
    return handleGetStaffAssignments(request);
  }
  if (path[0] === 'assignments') {
    return handleGetAssignments(request);
  }
  // New correct path
  if (path[0] === 'site-field-configs') {
    return handleGetFieldConfigs(request);
  }
  // Backward compatibility
  if (path[0] === 'field-configs') {
    return handleGetFieldConfigs(request);
  }
  // New correct path
  if (path[0] === 'site-banking-formulas') {
    return handleGetBankingFormulas(request);
  }
  // Backward compatibility
  if (path[0] === 'banking-formulas') {
    return handleGetBankingFormulas(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'stats') {
    return handleGetDashboardStats(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'site-stats') {
    return handleGetSiteStats(request);
  }
  if (path[0] === 'dashboard' && path[1] === 'revenue-chart') {
    return handleGetRevenueChart(request);
  }
  if (path[0] === 'export') {
    return handleExport(request);
  }
  if (path[0] === 'health') {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { headers: corsHeaders });
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function POST(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'auth' && path[1] === 'login') {
    return handleLogin(request);
  }
  if (path[0] === 'seed') {
    return handleSeed();
  }
  if (path[0] === 'reports') {
    return handleCreateReport(request);
  }
  if (path[0] === 'sites') {
    return handleCreateSite(request);
  }
  if (path[0] === 'users') {
    return handleCreateUser(request);
  }
  if (path[0] === 'operator-assignments') {
    return handleCreateOperatorAssignment(request);
  }
  if (path[0] === 'staff-assignments') {
    return handleCreateStaffAssignment(request);
  }
  if (path[0] === 'assignments') {
    return handleCreateAssignment(request);
  }
  // New correct path
  if (path[0] === 'site-field-configs') {
    if (path[1] === 'bulk') {
      return handleBulkUpdateFieldConfigs(request);
    }
    return handleCreateFieldConfig(request);
  }
  // Backward compatibility
  if (path[0] === 'field-configs') {
    if (path[1] === 'bulk') {
      return handleBulkUpdateFieldConfigs(request);
    }
    return handleCreateFieldConfig(request);
  }
  // New correct path
  if (path[0] === 'site-banking-formulas') {
    return handleCreateBankingFormula(request);
  }
  // Backward compatibility
  if (path[0] === 'banking-formulas') {
    return handleCreateBankingFormula(request);
  }
  // New banking calculate endpoint
  if (path[0] === 'banking' && path[1] === 'calculate') {
    return handleBankingCalculate(request);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function PUT(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'reports' && path[1] && path[2] === 'status') {
    return handleUpdateReportStatus(path[1], request);
  }
  if (path[0] === 'sites' && path[1]) {
    return handleUpdateSite(path[1], request);
  }
  if (path[0] === 'users' && path[1]) {
    return handleUpdateUser(path[1], request);
  }
  // New correct path
  if (path[0] === 'site-field-configs' && path[1]) {
    return handleUpdateFieldConfig(path[1], request);
  }
  // Backward compatibility
  if (path[0] === 'field-configs' && path[1]) {
    return handleUpdateFieldConfig(path[1], request);
  }
  // New correct path
  if (path[0] === 'site-banking-formulas' && path[1]) {
    return handleUpdateBankingFormula(path[1], request);
  }
  // Backward compatibility
  if (path[0] === 'banking-formulas' && path[1]) {
    return handleUpdateBankingFormula(path[1], request);
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
  if (path[0] === 'assignments' && path[1]) {
    return handleDeleteAssignment(path[1]);
  }
  // New correct path
  if (path[0] === 'site-field-configs' && path[1]) {
    return handleDeleteFieldConfig(path[1]);
  }
  // Backward compatibility
  if (path[0] === 'field-configs' && path[1]) {
    return handleDeleteFieldConfig(path[1]);
  }
  // New correct path
  if (path[0] === 'site-banking-formulas' && path[1]) {
    return handleDeleteBankingFormula(path[1]);
  }
  // Backward compatibility
  if (path[0] === 'banking-formulas' && path[1]) {
    return handleDeleteBankingFormula(path[1]);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}
