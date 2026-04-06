import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { demoUsers, demoSites, generateSiteAssignments, generateShiftReports } from '@/lib/seed';

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

// ============== AUTH ==============
async function handleLogin(request) {
  try {
    const { email, password } = await request.json();
    const db = await getDb();
    
    const user = await db.collection('users').findOne({ email, password });
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers: corsHeaders });
    }
    
    // Get user's assigned sites
    const assignments = await db.collection('user_site_assignments').find({ user_id: user.id }).toArray();
    const siteIds = assignments.map(a => a.site_id);
    const sites = await db.collection('sites').find({ id: { $in: siteIds } }).toArray();
    
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
    await db.collection('user_site_assignments').deleteMany({});
    await db.collection('shift_reports').deleteMany({});
    
    // Insert users
    const users = demoUsers.map(u => ({ ...u }));
    await db.collection('users').insertMany(users);
    
    // Insert sites
    const sites = demoSites.map(s => ({ ...s }));
    await db.collection('sites').insertMany(sites);
    
    // Insert assignments
    const assignments = generateSiteAssignments(users, sites);
    await db.collection('user_site_assignments').insertMany(assignments);
    
    // Insert shift reports
    const reports = generateShiftReports(users, sites, assignments);
    await db.collection('shift_reports').insertMany(reports);
    
    return NextResponse.json({
      message: 'Database seeded successfully',
      counts: {
        users: users.length,
        sites: sites.length,
        assignments: assignments.length,
        reports: reports.length
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Seeding failed: ' + error.message }, { status: 500, headers: corsHeaders });
  }
}

// ============== USERS MANAGEMENT ==============
async function handleGetUsers(request) {
  try {
    const db = await getDb();
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    
    let query = {};
    if (role) query.role = role;
    
    const users = await db.collection('users').find(query).toArray();
    
    // Remove passwords from response
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

async function handleCreateUser(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Check if email exists
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
    
    // Delete user and their assignments
    await db.collection('users').deleteOne({ id: userId });
    await db.collection('user_site_assignments').deleteMany({ user_id: userId });
    
    return NextResponse.json({ message: 'User deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500, headers: corsHeaders });
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
    
    // Enrich with user and site info
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
    
    // Check if assignment already exists
    const existing = await db.collection('user_site_assignments').findOne({
      user_id: data.user_id,
      site_id: data.site_id
    });
    
    if (existing) {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 400, headers: corsHeaders });
    }
    
    // Verify assigner has access to the site (if not owner)
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
    
    // Enrich with user and site names
    const userIds = [...new Set(reports.map(r => r.submitted_by_user_id))];
    const reportSiteIds = [...new Set(reports.map(r => r.site_id))];
    
    const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
    const sites = await db.collection('sites').find({ id: { $in: reportSiteIds } }).toArray();
    
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const siteMap = Object.fromEntries(sites.map(s => [s.id, s]));
    
    const enrichedReports = reports.map(r => ({
      ...r,
      staff_name: userMap[r.submitted_by_user_id]?.name || 'Unknown',
      site_name: siteMap[r.site_id]?.name || 'Unknown',
      site_code: siteMap[r.site_id]?.code || ''
    }));
    
    return NextResponse.json(enrichedReports, { headers: corsHeaders });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json({ error: 'Failed to get reports' }, { status: 500, headers: corsHeaders });
  }
}

async function handleCreateReport(request) {
  try {
    const db = await getDb();
    const data = await request.json();
    
    // Validate required fields
    const requiredFields = ['site_id', 'submitted_by_user_id', 'date', 'shift_type'];
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400, headers: corsHeaders });
      }
    }
    
    // Check if user is assigned to this site
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
      difference_value: null, // Placeholder for future formula
      status: 'pending',
      submitted_at: new Date().toISOString(),
      reviewed_by_user_id: null,
      reviewed_at: null
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
    
    // Get user and site info
    const user = await db.collection('users').findOne({ id: report.submitted_by_user_id });
    const site = await db.collection('sites').findOne({ id: report.site_id });
    const reviewer = report.reviewed_by_user_id ? 
      await db.collection('users').findOne({ id: report.reviewed_by_user_id }) : null;
    
    return NextResponse.json({
      ...report,
      staff_name: user?.name || 'Unknown',
      site_name: site?.name || 'Unknown',
      site_code: site?.code || '',
      reviewed_by_name: reviewer?.name || null
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
    
    const stats = {
      totalShopSales: 0,
      totalFuelSales: 0,
      totalRevenue: 0,
      totalDips: 0,
      totalDriveOffs: 0,
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
      if (r.status === 'pending') stats.pendingReports++;
      else stats.reviewedReports++;
    });
    
    // Round to 2 decimal places
    stats.totalShopSales = Math.round(stats.totalShopSales * 100) / 100;
    stats.totalFuelSales = Math.round(stats.totalFuelSales * 100) / 100;
    stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
    stats.totalDips = Math.round(stats.totalDips * 100) / 100;
    stats.totalDriveOffs = Math.round(stats.totalDriveOffs * 100) / 100;
    
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
    
    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    query.date = {
      $gte: startDate.toISOString().split('T')[0],
      $lte: endDate.toISOString().split('T')[0]
    };
    
    const reports = await db.collection('shift_reports').find(query).toArray();
    
    // Group by date
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

// ============== ROUTE HANDLER ==============
export async function GET(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'reports' && path[1]) {
    return handleGetReportById(path[1]);
  }
  if (path[0] === 'reports') {
    return handleGetReports(request);
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
  if (path[0] === 'assignments') {
    return handleGetAssignments(request);
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
  if (path[0] === 'assignments') {
    return handleCreateAssignment(request);
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
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}

export async function DELETE(request) {
  const path = getPathSegments(request);
  
  if (path[0] === 'users' && path[1]) {
    return handleDeleteUser(path[1]);
  }
  if (path[0] === 'assignments' && path[1]) {
    return handleDeleteAssignment(path[1]);
  }
  
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
}
