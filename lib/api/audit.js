/**
 * FOPS Audit Logger — captures every mutating action across the app.
 *
 * Usage from any handler:
 *
 *   import { logAudit } from '@/lib/api/audit';
 *   await logAudit({
 *     request,                       // optional, gives us IP + UA
 *     actor: authResult.user,        // optional but recommended
 *     action: 'update',
 *     tableName: 'shift_reports',
 *     recordId: report.id,
 *     siteId: report.site_id,
 *     before: previousRow,
 *     after: updatedRow,
 *     metadata: { reason: 'status_change' },
 *   });
 *
 * Audit writes go through the supabase service-role client so they
 * bypass RLS. Failures are caught and logged — audit is never allowed
 * to break the action it's auditing.
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';

const db = () => supabaseAdmin || supabase;

function safeJson(v) {
  if (v == null) return null;
  try {
    // Strip functions / undefined; jsonb can't store them.
    return JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

function extractIp(request) {
  if (!request) return null;
  const h = request.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null
  );
}

export async function logAudit({
  request = null,
  actor = null,
  action,
  tableName = null,
  recordId = null,
  siteId = null,
  before = null,
  after = null,
  metadata = null,
  actorEmailOverride = null,
  actorRoleOverride = null,
  actorUserIdOverride = null,
} = {}) {
  if (!action) return;
  try {
    const row = {
      action,
      table_name: tableName,
      record_id: recordId != null ? String(recordId) : null,
      site_id: siteId != null ? String(siteId) : null,
      actor_user_id: actorUserIdOverride || actor?.id || null,
      actor_email: actorEmailOverride || actor?.email || null,
      actor_role: actorRoleOverride || actor?.role || null,
      ip_address: extractIp(request),
      user_agent: request?.headers?.get('user-agent') || null,
      before_state: safeJson(before),
      after_state: safeJson(after),
      metadata: safeJson(metadata) || {},
    };
    const { error } = await db().from('audit_log').insert(row);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[audit] insert failed (non-fatal):', error.message);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[audit] threw (non-fatal):', e?.message);
  }
}

/**
 * Fire-and-forget version — use for hot paths where you don't want to
 * await the audit insert. The actual writes still happen via the same
 * client, just in the background.
 */
export function logAuditAsync(args) {
  // Intentionally not awaited.
  logAudit(args);
}
