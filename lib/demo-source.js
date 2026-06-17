/**
 * lib/demo-source.js — single source of truth for "which tenant does
 * 'Explore the demo' bridge to?".
 *
 * Priority order:
 *   1. users.is_demo_source = TRUE   (PRIMARY — partial-unique index,
 *                                     guarded by signup, can never be
 *                                     set on a real customer row).
 *   2. process.env.BILLING_DEMO_SOURCE_OWNER_ID  (fallback during the
 *      rolling migration before is_demo_source is populated).
 *
 * Returns the owner id (TEXT) or null if no demo source is configured —
 * callers should treat null as "no demo data available; show empty
 * dashboard" rather than failing.
 */
import { supabaseAdmin } from '@/lib/supabase';

let _cachedId = null;
let _cachedAt = 0;

export async function getDemoSourceOwnerId() {
  // 60-second in-memory cache — the source rarely changes.
  if (_cachedId && Date.now() - _cachedAt < 60_000) return _cachedId;

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('is_demo_source', true)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) {
      _cachedId = data.id;
      _cachedAt = Date.now();
      return _cachedId;
    }
  } catch (_) { /* column may not exist yet during the rolling migration */ }

  // Fallback: env var. Only honoured during the rolling deploy; once
  // the SQL migration adds is_demo_source the flag wins.
  const envId = process.env.BILLING_DEMO_SOURCE_OWNER_ID;
  if (envId) {
    _cachedId = envId;
    _cachedAt = Date.now();
    return _cachedId;
  }
  return null;
}

/**
 * Guard used by the signup handler. Rejects any signup payload that
 * tries to land a real customer on the demo tenant — either by reusing
 * the demo source id or by attempting to set the is_demo_source flag.
 * Throws an Error if the payload would create a collision; returns
 * silently otherwise.
 */
export async function assertSignupNotDemoSource(candidate) {
  const demoId = await getDemoSourceOwnerId();
  if (demoId && candidate?.id === demoId) {
    throw new Error('Signup blocked: id collides with the demo source tenant');
  }
  if (candidate?.is_demo_source === true) {
    throw new Error('Signup blocked: is_demo_source must never be set via signup');
  }
}
