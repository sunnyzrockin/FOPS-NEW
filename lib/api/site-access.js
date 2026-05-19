/**
 * Resolve the set of site IDs the given FOPS user is allowed to act on.
 * Used by /api/dips and any other endpoint that needs site-scoping.
 *
 *   owner    → all sites where sites.owner_id = user.id
 *   operator → all sites in operator_site_assignments
 *   staff    → all sites in staff_site_assignments
 *   anything else → []
 */

import supabase, { supabaseAdmin } from '@/lib/supabase';

export async function getAllowedSiteIds(currentUser) {
  const admin = supabaseAdmin || supabase;
  if (!currentUser?.role) return [];

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
