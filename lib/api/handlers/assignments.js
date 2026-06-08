/**
 * Operator/Staff Site Assignments module.
 *
 * Phase 2 modular extraction + Security Sprint Part 2 hardening.
 *
 * Endpoints:
 *   GET    /api/operator-assignments?siteId=&operatorId=&ownerId=
 *   POST   /api/operator-assignments
 *   DELETE /api/operator-assignments/:id
 *   GET    /api/staff-assignments?siteId=&staffId=&operatorId=&ownerId=
 *   POST   /api/staff-assignments
 *   DELETE /api/staff-assignments/:id
 *
 * Authorization model (Security Sprint Part 2):
 *   - All endpoints require Bearer auth (no allowAnon).
 *   - GETs are role-scoped (owner sees own sites, operator sees own rows,
 *     staff sees own rows). Query params ?ownerId/?operatorId are honoured
 *     only for 'support' role; otherwise ignored to prevent cross-tenant
 *     reads.
 *   - POSTs require role + site-ownership intersection. *_by_*_id columns
 *     are FORCED to JWT user.id (no body spoofing).
 *   - DELETEs require role + site-ownership intersection on the row.
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import { jsonWithCors } from '@/lib/api/cors';
import { logAuditAsync } from '@/lib/api/audit';
import { notify } from '@/lib/api/notify';

const db = () => supabaseAdmin || supabase;

// ============== OPERATOR ASSIGNMENTS ==============

export async function handleGetOperatorAssignments(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;

    const url = new URL(request.url);
    const siteIdFilter = url.searchParams.get('siteId');
    const operatorIdFilter = url.searchParams.get('operatorId');
    const ownerIdFilter = url.searchParams.get('ownerId');

    const admin = db();
    let query = admin
      .from('operator_site_assignments')
      .select(`*, operator:users!operator_user_id(id, name, email), site:sites(id, name, code)`);

    if (currentUser.role === 'owner') {
      // Owner sees assignments only on sites they own (canonical: via sites.owner_id)
      const allowed = await getAllowedSiteIds(currentUser);
      if (!allowed.length) return jsonWithCors([]);
      query = query.in('site_id', allowed);
    } else if (currentUser.role === 'operator') {
      // Operator can only see their own assignments
      query = query.eq('operator_user_id', currentUser.id);
    } else if (currentUser.role === 'support') {
      // Support sees everything; honour the query filters
      if (ownerIdFilter) query = query.eq('assigned_by_owner_id', ownerIdFilter);
      if (operatorIdFilter) query = query.eq('operator_user_id', operatorIdFilter);
    } else {
      // Staff / unknown role → no operator assignments visible
      return jsonWithCors({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (siteIdFilter) query = query.eq('site_id', siteIdFilter);

    const { data, error } = await query;
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[operator-assignments] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch assignments', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateOperatorAssignment(request) {
  try {
    const auth = await requireRole(request, ['owner', 'support']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { operator_user_id, site_id } = body || {};
    if (!operator_user_id || !site_id) {
      return jsonWithCors({ error: 'operator_user_id and site_id are required' }, { status: 400 });
    }

    // Verify caller has access to site_id
    if (auth.user.role !== 'support') {
      const allowed = await getAllowedSiteIds(auth.user);
      if (!allowed.includes(site_id)) {
        return jsonWithCors({
          error: 'You do not own this site',
          foreign_site_ids: [site_id],
        }, { status: 403 });
      }
    }

    // Verify operator_user_id exists and has role='operator'
    const { data: target, error: tErr } = await db()
      .from('users')
      .select('id, role, name, email, status')
      .eq('id', operator_user_id)
      .single();
    if (tErr || !target) {
      return jsonWithCors({ error: 'Operator user not found' }, { status: 400 });
    }
    if (target.role !== 'operator') {
      return jsonWithCors({
        error: 'Target user is not an operator',
        actual_role: target.role,
      }, { status: 400 });
    }

    const newAssignment = {
      id: uuidv4(),
      operator_user_id,
      site_id,
      // FORCE assigned_by_owner_id to caller JWT — ignore any body value
      assigned_by_owner_id: auth.user.id,
    };

    const { data, error } = await db()
      .from('operator_site_assignments')
      .insert([newAssignment]).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'insert',
      tableName: 'operator_site_assignments', recordId: data.id, siteId: data.site_id, after: data,
    });

    // -------- Phase 2 Section E: notify the assigned operator --------
    let siteName = null;
    try {
      const { data: site } = await db()
        .from('sites').select('name').eq('id', site_id).single();
      siteName = site?.name || null;
    } catch (_) { /* best-effort lookup */ }
    notify({
      userId: operator_user_id,
      type: 'site_assigned',
      title: 'You\'ve been assigned a new site',
      body: siteName
        ? `${auth.user?.name || 'The owner'} has given you operator access to ${siteName}.`
        : `${auth.user?.name || 'The owner'} has given you operator access to a new site.`,
      link: `/app?tab=dashboard`,
    }).catch((e) => console.warn('[notify] site_assigned failed:', e?.message));

    return jsonWithCors(data);
  } catch (error) {
    console.error('[operator-assignments] create error:', error);
    return jsonWithCors({
      error: 'Failed to create assignment', message: error?.message, code: error?.code,
    }, { status: 500 });
  }
}

export async function handleDeleteOperatorAssignment(request, assignmentId) {
  try {
    const auth = await requireRole(request, ['owner', 'support']);
    if (!auth.ok) return auth.response;

    const admin = db();
    // Pre-fetch the row with joined operator + site so we can send an
    // email AFTER the delete succeeds.
    const { data: before } = await admin
      .from('operator_site_assignments')
      .select('*, operator:users!operator_user_id(id, name, email), site:sites(id, name)')
      .eq('id', assignmentId)
      .single();

    if (!before) {
      return jsonWithCors({ error: 'Assignment not found' }, { status: 404 });
    }

    // Verify caller has site access
    if (auth.user.role !== 'support') {
      const allowed = await getAllowedSiteIds(auth.user);
      if (!allowed.includes(before.site_id)) {
        return jsonWithCors({
          error: 'You do not own this site',
          foreign_site_ids: [before.site_id],
        }, { status: 403 });
      }
    }

    const operatorEmail = before?.operator?.email || null;
    const operatorName = before?.operator?.name || null;
    const siteName = before?.site?.name || null;

    const { error } = await admin.from('operator_site_assignments').delete().eq('id', assignmentId);
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'delete',
      tableName: 'operator_site_assignments', recordId: assignmentId,
      siteId: before?.site_id, before,
    });

    // Best-effort email notification (non-blocking)
    if (operatorEmail && siteName) {
      import('@/lib/mailer')
        .then(({ sendOperatorRemovedEmail }) =>
          sendOperatorRemovedEmail({
            to: operatorEmail,
            operatorName,
            siteName,
            ownerName: auth.user?.name,
          })
        )
        .catch((e) => console.warn('[operator-removed] email send failed:', e?.message));
    }

    // -------- Phase 2 Section E: in-app notification for the same event ---
    if (before?.operator_user_id) {
      notify({
        userId: before.operator_user_id,
        type: 'site_unassigned',
        title: 'Site access removed',
        body: siteName
          ? `${auth.user?.name || 'The owner'} has removed your operator access to ${siteName}.`
          : `${auth.user?.name || 'The owner'} has removed your operator access to a site.`,
        link: `/app?tab=dashboard`,
      }).catch((e) => console.warn('[notify] site_unassigned failed:', e?.message));
    }

    return jsonWithCors({ message: 'Assignment deleted', notified: !!operatorEmail });
  } catch (error) {
    console.error('[operator-assignments] delete error:', error);
    return jsonWithCors({ error: 'Failed to delete assignment', message: error?.message }, { status: 500 });
  }
}

// ============== STAFF ASSIGNMENTS ==============

export async function handleGetStaffAssignments(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const currentUser = auth.user;

    const url = new URL(request.url);
    const siteIdFilter = url.searchParams.get('siteId');
    const staffIdFilter = url.searchParams.get('staffId');
    const operatorIdFilter = url.searchParams.get('operatorId');
    const ownerIdFilter = url.searchParams.get('ownerId');

    const admin = db();
    let query = admin
      .from('staff_site_assignments')
      .select(`*, staff:users!staff_user_id(id, name, email), site:sites(id, name, code)`);

    if (currentUser.role === 'owner') {
      const allowed = await getAllowedSiteIds(currentUser);
      if (!allowed.length) return jsonWithCors([]);
      query = query.in('site_id', allowed);
    } else if (currentUser.role === 'operator') {
      // Operator sees staff assignments on sites they manage (canonical)
      // — broader than 'assigned_by_operator_id' so it survives re-assignment.
      const allowed = await getAllowedSiteIds(currentUser);
      if (!allowed.length) return jsonWithCors([]);
      query = query.in('site_id', allowed);
    } else if (currentUser.role === 'staff') {
      query = query.eq('staff_user_id', currentUser.id);
    } else if (currentUser.role === 'support') {
      if (operatorIdFilter) query = query.eq('assigned_by_operator_id', operatorIdFilter);
      if (ownerIdFilter) {
        const { data: ownerSites } = await admin.from('sites').select('id').eq('owner_id', ownerIdFilter);
        if (!ownerSites?.length) return jsonWithCors([]);
        query = query.in('site_id', ownerSites.map((s) => s.id));
      }
    } else {
      return jsonWithCors({ error: 'Insufficient permissions' }, { status: 403 });
    }

    if (siteIdFilter) query = query.eq('site_id', siteIdFilter);
    if (staffIdFilter) query = query.eq('staff_user_id', staffIdFilter);

    const { data, error } = await query;
    if (error) throw error;
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[staff-assignments] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch assignments', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateStaffAssignment(request) {
  try {
    const auth = await requireRole(request, ['owner', 'operator', 'support']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { staff_user_id, site_id } = body || {};
    if (!staff_user_id || !site_id) {
      return jsonWithCors({ error: 'staff_user_id and site_id are required' }, { status: 400 });
    }

    // Verify caller has access to site_id
    if (auth.user.role !== 'support') {
      const allowed = await getAllowedSiteIds(auth.user);
      if (!allowed.includes(site_id)) {
        return jsonWithCors({
          error: 'You do not have access to this site',
          foreign_site_ids: [site_id],
        }, { status: 403 });
      }
    }

    // Verify staff_user_id exists and has role='staff'
    const { data: target, error: tErr } = await db()
      .from('users')
      .select('id, role, name, email, status')
      .eq('id', staff_user_id)
      .single();
    if (tErr || !target) {
      return jsonWithCors({ error: 'Staff user not found' }, { status: 400 });
    }
    if (target.role !== 'staff') {
      return jsonWithCors({
        error: 'Target user is not a staff member',
        actual_role: target.role,
      }, { status: 400 });
    }

    const newAssignment = {
      id: uuidv4(),
      staff_user_id,
      site_id,
      // FORCE assigned_by_operator_id to caller JWT — ignore any body value
      assigned_by_operator_id: auth.user.id,
    };

    const { data, error } = await db()
      .from('staff_site_assignments')
      .insert([newAssignment]).select().single();
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'insert',
      tableName: 'staff_site_assignments', recordId: data.id, siteId: data.site_id, after: data,
    });

    // -------- Phase 2 Section E: notify the assigned staff member --------
    let staffSiteName = null;
    try {
      const { data: site } = await db()
        .from('sites').select('name').eq('id', site_id).single();
      staffSiteName = site?.name || null;
    } catch (_) { /* best-effort lookup */ }
    notify({
      userId: staff_user_id,
      type: 'staff_assigned',
      title: 'You have access to a new site',
      body: staffSiteName
        ? `${auth.user?.name || 'Your operator'} has added you to ${staffSiteName}. You can now submit shift reports for it.`
        : `${auth.user?.name || 'Your operator'} has added you to a new site. You can now submit shift reports for it.`,
      link: `/app?tab=submit`,
    }).catch((e) => console.warn('[notify] staff_assigned failed:', e?.message));

    return jsonWithCors(data);
  } catch (error) {
    console.error('[staff-assignments] create error:', error);
    return jsonWithCors({
      error: 'Failed to create assignment', message: error?.message, code: error?.code,
    }, { status: 500 });
  }
}

export async function handleDeleteStaffAssignment(request, assignmentId) {
  try {
    const auth = await requireRole(request, ['owner', 'operator', 'support']);
    if (!auth.ok) return auth.response;

    const admin = db();
    const { data: before } = await admin
      .from('staff_site_assignments')
      .select('*')
      .eq('id', assignmentId)
      .single();

    if (!before) {
      return jsonWithCors({ error: 'Assignment not found' }, { status: 404 });
    }

    // Verify caller has site access
    if (auth.user.role !== 'support') {
      const allowed = await getAllowedSiteIds(auth.user);
      if (!allowed.includes(before.site_id)) {
        return jsonWithCors({
          error: 'You do not have access to this site',
          foreign_site_ids: [before.site_id],
        }, { status: 403 });
      }
    }

    const { error } = await admin.from('staff_site_assignments').delete().eq('id', assignmentId);
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'delete',
      tableName: 'staff_site_assignments', recordId: assignmentId,
      siteId: before?.site_id, before,
    });

    // -------- Phase 2 Section E: notify the staff member --------
    if (before?.staff_user_id) {
      let siteName = null;
      try {
        if (before.site_id) {
          const { data: site } = await admin
            .from('sites').select('name').eq('id', before.site_id).single();
          siteName = site?.name || null;
        }
      } catch (_) { /* best-effort lookup */ }
      notify({
        userId: before.staff_user_id,
        type: 'staff_unassigned',
        title: 'Site access removed',
        body: siteName
          ? `${auth.user?.name || 'Your operator'} has removed your access to ${siteName}.`
          : `${auth.user?.name || 'Your operator'} has removed your access to a site.`,
        link: `/app?tab=submit`,
      }).catch((e) => console.warn('[notify] staff_unassigned failed:', e?.message));
    }

    return jsonWithCors({ message: 'Assignment deleted' });
  } catch (error) {
    console.error('[staff-assignments] delete error:', error);
    return jsonWithCors({ error: 'Failed to delete assignment', message: error?.message }, { status: 500 });
  }
}
