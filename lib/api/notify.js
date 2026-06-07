/**
 * lib/api/notify.js
 *
 * Single helper used by API routes to drop a notification onto a user's
 * bell. Uses the supabaseAdmin (service-role) client so we bypass RLS
 * — the caller is always an authenticated route, and RLS would otherwise
 * block one user (eg. a staff submitter) from creating a row addressed to
 * a different user (the operator who needs to review).
 *
 * The table schema we target (already created in Supabase) is:
 *   id          uuid pk default uuid_generate_v4()
 *   user_id     uuid not null   (recipient, FK users.id)
 *   type        text not null   ('report_submitted' | 'report_status_changed'
 *                                | 'site_assigned'   | 'site_unassigned'
 *                                | 'staff_assigned'  | 'staff_unassigned' | ...)
 *   title       text not null
 *   body        text
 *   link        text
 *   read_at     timestamptz
 *   created_at  timestamptz default now()
 *
 * The helper is intentionally fire-and-forget by default: any failure to
 * write a notification must NEVER break the primary operation (eg. a shift
 * report submit). Errors are logged and swallowed.
 *
 * Usage:
 *
 *   import { notify, notifyMany, notifyOperatorsOfSite } from '@/lib/api/notify';
 *
 *   // Single recipient
 *   notify({
 *     userId: operatorId,
 *     type: 'report_submitted',
 *     title: 'New shift report to review',
 *     body: `${staffName} submitted a ${shiftType} shift report for ${siteName}.`,
 *     link: `/app?tab=submissions&id=${reportId}`,
 *   });
 *
 *   // All operators assigned to a site
 *   notifyOperatorsOfSite({ siteId, ... });
 */

import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';

const ALLOWED_TYPES = new Set([
  'report_submitted',
  'report_status_changed',
  'site_assigned',
  'site_unassigned',
  'staff_assigned',
  'staff_unassigned',
  'generic',
]);

function sanitiseType(t) {
  return ALLOWED_TYPES.has(t) ? t : 'generic';
}

function clampStr(s, max) {
  if (s == null) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) : str;
}

/**
 * Insert a single notification row. Returns the created row on success,
 * or null on failure (errors are logged but not thrown).
 *
 * Pass `await: true` if a caller actually needs to wait for the write.
 * By default this is fire-and-forget; you can chain .catch() on the
 * returned promise yourself if you want to handle failure.
 */
export async function notify({ userId, type, title, body, link } = {}) {
  if (!userId || !title) {
    console.warn('[notify] missing userId or title — skipping');
    return null;
  }
  if (!supabaseAdmin) {
    console.warn('[notify] supabaseAdmin not configured — skipping');
    return null;
  }

  const row = {
    id: uuidv4(),
    user_id: userId,
    type: sanitiseType(type),
    title: clampStr(title, 200),
    body: clampStr(body, 1000),
    link: clampStr(link, 500),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert([row])
      .select()
      .single();
    if (error) {
      console.error('[notify] insert failed:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[notify] threw:', e?.message);
    return null;
  }
}

/**
 * Insert one notification per user in `userIds` (deduplicated, drops
 * falsy values). Used when an action affects multiple recipients.
 */
export async function notifyMany({ userIds = [], type, title, body, link } = {}) {
  const unique = Array.from(new Set((userIds || []).filter(Boolean)));
  if (unique.length === 0) return [];
  return Promise.all(
    unique.map((userId) => notify({ userId, type, title, body, link }))
  );
}

/**
 * Fan out a notification to every operator currently assigned to `siteId`.
 * Used on shift-report submission: every operator who oversees the site
 * gets a heads-up that there's a new submission waiting for review.
 *
 * `excludeUserId` lets the caller skip a specific user — typically the
 * actor themselves (an operator who somehow submitted their own report,
 * or self-actions where the trigger and recipient happen to be the same
 * person).
 */
export async function notifyOperatorsOfSite({
  siteId,
  type,
  title,
  body,
  link,
  excludeUserId = null,
} = {}) {
  if (!siteId || !supabaseAdmin) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('operator_site_assignments')
      .select('operator_user_id')
      .eq('site_id', siteId);
    if (error) {
      console.error('[notify] failed to lookup operators for site:', error.message);
      return [];
    }
    const userIds = (data || [])
      .map((r) => r.operator_user_id)
      .filter((id) => id && id !== excludeUserId);
    return notifyMany({ userIds, type, title, body, link });
  } catch (e) {
    console.error('[notify] notifyOperatorsOfSite threw:', e?.message);
    return [];
  }
}
