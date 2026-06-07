/**
 * Operator/Staff Site Assignments module.
 *
 * Phase 2 modular extraction.
 *
 * Endpoints:
 *   GET    /api/operator-assignments?siteId=&operatorId=&ownerId=
 *   POST   /api/operator-assignments
 *   DELETE /api/operator-assignments/:id
 *   GET    /api/staff-assignments?siteId=&staffId=&operatorId=&ownerId=
 *   POST   /api/staff-assignments
 *   DELETE /api/staff-assignments/:id
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { jsonWithCors } from '@/lib/api/cors';
import { logAuditAsync } from '@/lib/api/audit';
import { notify } from '@/lib/api/notify';

const db = () => supabaseAdmin || supabase;

// ============== OPERATOR ASSIGNMENTS ==============

export async function handleGetOperatorAssignments(request) {
  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const operatorId = url.searchParams.get('operatorId');
    const ownerId = url.searchParams.get('ownerId');

    const admin = db();
    const auth = await verifyAuth(request, { allowAnon: true });
    const currentUser = auth.ok ? auth.user : null;

    let query = admin
      .from('operator_site_assignments')
      .select(`*, operator:users!operator_user_id(id, name, email), site:sites(id, name, code)`);

    if (currentUser) {
      if (currentUser.role === 'owner') {
        query = query.eq('assigned_by_owner_id', currentUser.id);
      } else if (currentUser.role === 'operator') {
        query = query.eq('operator_user_id', currentUser.id);
      } else if (currentUser.role !== 'support') {
        return jsonWithCors([]);
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
    return jsonWithCors(data || []);
  } catch (error) {
    console.error('[operator-assignments] get error:', error);
    return jsonWithCors({ error: 'Failed to fetch assignments', message: error?.message }, { status: 500 });
  }
}

export async function handleCreateOperatorAssignment(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { operator_user_id, site_id, assigned_by_owner_id } = body || {};
    if (!operator_user_id || !site_id) {
      return jsonWithCors({ error: 'operator_user_id and site_id are required' }, { status: 400 });
    }

    const newAssignment = {
      id: uuidv4(),
      operator_user_id,
      site_id,
      assigned_by_owner_id: assigned_by_owner_id || auth.user.id,
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
    // Look up the site's friendly name for a more useful notification body.
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
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const admin = db();
    // Pre-fetch the row with joined operator + site so we can send an
    // email AFTER the delete succeeds.
    let before = null;
    let operatorEmail = null;
    let operatorName = null;
    let siteName = null;
    try {
      const { data } = await admin
        .from('operator_site_assignments')
        .select('*, operator:users!operator_user_id(id, name, email), site:sites(id, name)')
        .eq('id', assignmentId)
        .single();
      before = data;
      operatorEmail = data?.operator?.email || null;
      operatorName = data?.operator?.name || null;
      siteName = data?.site?.name || null;
    } catch (_) { /* best-effort lookup */ }

    const { error } = await admin.from('operator_site_assignments').delete().eq('id', assignmentId);
    if (error) throw error;

    logAuditAsync({
      request, actor: auth.user, action: 'delete',
      tableName: 'operator_site_assignments', recordId: assignmentId,
      siteId: before?.site_id, before,
    });

    // Best-effort email notification (non-blocking) — failures here must
    // not break the API contract.
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
    // The email above goes to the operator's inbox; this in-app notification
    // ensures they see the change next time they open FOPS even if they miss
    // the email.
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
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const staffId = url.searchParams.get('staffId');
    const operatorId = url.searchParams.get('operatorId');
    const ownerId = url.searchParams.get('ownerId');

    const admin = db();
    const auth = await verifyAuth(request, { allowAnon: true });
    const currentUser = auth.ok ? auth.user : null;

    let query = admin
      .from('staff_site_assignments')
      .select(`*, staff:users!staff_user_id(id, name, email), site:sites(id, name, code)`);

    if (currentUser) {
      if (currentUser.role === 'owner') {
        const { data: ownerSites } = await admin.from('sites').select('id').eq('owner_id', currentUser.id);
        if (!ownerSites?.length) return jsonWithCors([]);
        query = query.in('site_id', ownerSites.map((s) => s.id));
      } else if (currentUser.role === 'operator') {
        query = query.eq('assigned_by_operator_id', currentUser.id);
      } else if (currentUser.role === 'staff') {
        query = query.eq('staff_user_id', currentUser.id);
      }
    } else if (operatorId) {
      query = query.eq('assigned_by_operator_id', operatorId);
    } else if (ownerId) {
      const { data: ownerSites } = await admin.from('sites').select('id').eq('owner_id', ownerId);
      if (!ownerSites?.length) return jsonWithCors([]);
      query = query.in('site_id', ownerSites.map((s) => s.id));
    }

    if (siteId) query = query.eq('site_id', siteId);
    if (staffId) query = query.eq('staff_user_id', staffId);

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
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { staff_user_id, site_id, assigned_by_operator_id } = body || {};
    if (!staff_user_id || !site_id) {
      return jsonWithCors({ error: 'staff_user_id and site_id are required' }, { status: 400 });
    }

    const newAssignment = {
      id: uuidv4(),
      staff_user_id, site_id,
      assigned_by_operator_id: assigned_by_operator_id || auth.user.id,
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
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    const admin = db();
    let before = null;
    try { const { data } = await admin.from('staff_site_assignments').select('*').eq('id', assignmentId).single(); before = data; } catch (_) { /* best-effort lookup */ }

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
