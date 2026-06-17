/**
 * POST /api/auth/demo-login
 *
 * Auto-logs the caller in as the read-only demo owner. Returns the
 * Supabase session in the same shape /api/auth/login does so the
 * frontend can reuse the same persistence code.
 *
 * Read-only is enforced SERVER-SIDE in every write handler via
 * lib/billing.js → assertNotDemo(user). The frontend hides edit
 * controls too, but the server is the source of truth.
 *
 * The demo user is provisioned by scripts/setup-demo-owner.js — set
 * its credentials via BILLING_DEMO_OWNER_EMAIL / BILLING_DEMO_OWNER_PASSWORD.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function POST(request) {
  try {
    const email = process.env.BILLING_DEMO_OWNER_EMAIL;
    const password = process.env.BILLING_DEMO_OWNER_PASSWORD;
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Demo mode is not configured on this server.' },
        { status: 503 },
      );
    }

    // Use the public anon client just for password sign-in (returns a session).
    const { createClient: createPublic } = await import('@supabase/supabase-js');
    const sb = createPublic(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      console.error('[demo-login] failed:', error?.message);
      return NextResponse.json({ error: 'Demo login failed' }, { status: 500 });
    }

    const { data: userRow } = await supabaseAdmin
      .from('users').select('*').eq('email', email).maybeSingle();

    // Demo bridge (Defect 5): the seeded sites are owned by the canonical
    // seed owner, not the demo user. Surface those sites in the login
    // response so the dashboard renders populated immediately.
    const { getDemoSourceOwnerId } = await import('@/lib/demo-source');
    const demoSourceOwnerId = await getDemoSourceOwnerId();
    const { data: sites } = demoSourceOwnerId
      ? await supabaseAdmin.from('sites').select('*').eq('owner_id', demoSourceOwnerId)
      : { data: [] };

    return NextResponse.json({
      user: userRow,
      session: data.session,
      sites: sites || [],
      demo: true,
    });
  } catch (e) {
    console.error('[demo-login] error:', e);
    return NextResponse.json({ error: 'Unexpected error', detail: e?.message }, { status: 500 });
  }
}

export const OPTIONS = optionsHandler;
