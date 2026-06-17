/**
 * scripts/test-sync-via-http.js
 *
 * Exercises the real Next.js `/api/sites` POST/DELETE path via HTTP so
 * we know the `await syncQuantityForOwner(...)` chain works inside the
 * server response cycle (NOT just when called from a node script).
 *
 * Requires the dev server running on localhost:3000.
 *
 * Usage:
 *   OWNER_EMAIL=owner@fopsapp.com node scripts/test-sync-via-http.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const Stripe = require('stripe');

  const OWNER_EMAIL = process.env.OWNER_EMAIL || 'owner@fopsapp.com';
  const OWNER_PASSWORD = process.env.BILLING_DEMO_OWNER_PASSWORD || 'WorkflowDemo2026!';
  const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  // 1. Login the owner via /api/auth/login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok) {
    console.error('login failed:', loginRes.status, loginJson);
    process.exit(1);
  }
  const token = loginJson.token || loginJson.access_token || loginJson.session?.access_token;
  if (!token) {
    console.error('no token in login response:', loginJson);
    process.exit(1);
  }
  console.log('Logged in OK');

  const auth = { Authorization: `Bearer ${token}` };

  // 2. Snapshot Stripe per-site qty
  const { data: owner } = await sb.from('users')
    .select('id').eq('email', OWNER_EMAIL).maybeSingle();
  const { data: subRow } = await sb.from('subscriptions')
    .select('id').eq('user_id', owner.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  async function stripeQty() {
    const s = await stripe.subscriptions.retrieve(subRow.id, { expand: ['items.data.price'] });
    const it = s.items.data.find((i) => i.price?.id === process.env.STRIPE_PRICE_PER_SITE);
    return it?.quantity;
  }

  console.log('Stripe per-site qty BEFORE :', await stripeQty());

  // 3. POST /api/sites — create a synthetic site
  const newCode = `HTTP_${Date.now().toString(36).toUpperCase()}`;
  const createRes = await fetch(`${BASE}/api/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ name: `__http_sync_test`, code: newCode, location: 'TEST' }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok) {
    console.error('POST /api/sites failed:', createRes.status, createJson);
    process.exit(1);
  }
  const createdId = createJson.id;
  console.log('POST /api/sites OK — created', createdId);
  console.log('Stripe per-site qty AFTER POST :', await stripeQty());

  // 4. DELETE /api/sites/:id
  const delRes = await fetch(`${BASE}/api/sites/${createdId}`, {
    method: 'DELETE',
    headers: { ...auth },
  });
  const delJson = await delRes.json();
  if (!delRes.ok) {
    console.error('DELETE /api/sites/:id failed:', delRes.status, delJson);
    process.exit(1);
  }
  console.log('DELETE /api/sites/:id OK');
  console.log('Stripe per-site qty AFTER DELETE:', await stripeQty());

  // 5. /api/billing/status should now show no drift.
  const statusRes = await fetch(`${BASE}/api/billing/status`, { headers: { ...auth } });
  const statusJson = await statusRes.json();
  console.log('billing/status:', {
    quantity: statusJson.quantity,
    site_count: statusJson.site_count,
    quantity_drift: statusJson.quantity_drift,
    phase: statusJson.phase,
  });
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
