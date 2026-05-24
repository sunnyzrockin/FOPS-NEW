import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase, supabaseStatus } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, rateLimit, clientIp } from '@/lib/auth-helpers';
import { logAuditAsync } from '@/lib/api/audit';

// Force Node runtime + dynamic so Vercel doesn't infer edge or cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/users  -> list users (optional ?role=staff|operator|owner)
export async function GET(request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server misconfigured', status: supabaseStatus() },
        { status: 500, headers: corsHeaders }
      );
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role');

    let query = (supabaseAdmin || supabase).from('users').select('*');
    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('[users GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/users  -> create user (auth + DB row)
//
// Security:
// - Rate-limited to 10 creations / minute per IP to slow brute-force abuse.
// - When an Authorization header IS provided, we verify the caller and
//   enforce role-based permissions (only owner can create operators,
//   only operator can create staff). When NO header is provided we
//   currently fall back to anonymous (legacy) — the frontend will
//   migrate to always-authenticated calls.
export async function POST(request) {
  // Rate-limit by IP
  const ip = clientIp(request);
  const rl = rateLimit({ key: `users:create:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const steps = [];
  try {
    steps.push('parse-body');
    const body = await request.json();
    const { name, email, password, role } = body || {};

    if (!name || !email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields (name, email, role)', steps },
        { status: 400, headers: corsHeaders }
      );
    }

    // ---- Optional auth check (non-breaking; only enforces if header present)
    const auth = await verifyAuth(request, { allowAnon: true });
    if (auth.user) {
      // Role-based permission check
      const allowedTransitions = {
        owner: ['operator', 'staff', 'owner'],
        operator: ['staff'],
      };
      const allowed = allowedTransitions[auth.user.role] || [];
      if (!allowed.includes(role)) {
        return NextResponse.json(
          {
            error: `Your role (${auth.user.role}) cannot create users with role "${role}"`,
            allowed,
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }
    // (When no auth header is sent we currently allow — to be removed once
    // frontend always forwards the JWT.)

    steps.push('admin-check');
    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          error:
            'Server configuration error: SUPABASE_SERVICE_ROLE_KEY not configured.',
          status: supabaseStatus(),
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    steps.push('auth-create');
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: password || 'tempPass123!',
        email_confirm: true,
        user_metadata: { name, role },
      });

    if (authError) {
      return NextResponse.json(
        {
          error: `Failed to create auth user: ${authError.message}`,
          code: authError.code,
          authStatus: authError.status,
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    steps.push('db-insert');
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      status: 'active',
    };

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();

    if (error) {
      // Cleanup orphan auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      } catch (_) {}
      return NextResponse.json(
        {
          error: `Failed to create user record: ${error.message}`,
          code: error.code,
          details: error.details,
          steps,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    logAuditAsync({
      request,
      actor: auth.user || null,
      action: 'insert',
      tableName: 'users',
      recordId: data.id,
      actorEmailOverride: auth.user?.email,
      after: { id: data.id, email, name, role, status: 'active' },
    });

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('[users POST]', error);
    return NextResponse.json(
      {
        error: `Failed to create user: ${error?.message || 'unknown'}`,
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 8).join('\n'),
        steps,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
