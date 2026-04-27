import { NextResponse } from 'next/server';
import { supabaseAdmin, supabase, supabaseStatus } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

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
export async function POST(request) {
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
