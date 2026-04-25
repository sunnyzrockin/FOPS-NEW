import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseStatus } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Force Node.js runtime — Supabase admin client requires Node APIs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET handler — diagnostic. Hitting in a browser shows a JSON status
// instead of a 405 with an empty body. Optionally creates a fully
// random test user when ?run=1 is passed.
export async function GET(request) {
  const url = new URL(request.url);
  const run = url.searchParams.get('run') === '1';

  const status = supabaseStatus();
  const base = {
    runtime: 'nodejs',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    supabaseStatus: status,
  };

  if (!run) {
    return NextResponse.json({
      ...base,
      hint: 'POST { name, email, password, role } to create a test user, or append ?run=1 to auto-create a random one.',
    });
  }

  // Auto-create a random user end-to-end
  const random = Math.random().toString(36).slice(2, 8);
  const fakeBody = {
    name: `Diag User ${random}`,
    email: `diag+${Date.now()}@fopsapp.com`,
    password: 'Diag-' + random + '!',
    role: 'staff',
  };
  return runCreateUser(fakeBody, base);
}

export async function POST(request) {
  const status = supabaseStatus();
  const base = {
    runtime: 'nodejs',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    supabaseStatus: status,
  };

  let body = null;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json(
      { ...base, error: 'Invalid JSON body', message: e.message },
      { status: 400 }
    );
  }
  return runCreateUser(body, base);
}

async function runCreateUser(body, base) {
  const logs = [];
  try {
    logs.push(`Step 0: body received: ${JSON.stringify({ ...body, password: '***' })}`);

    const { name, email, password, role } = body || {};
    if (!email || !role || !name) {
      logs.push('Step 1: validation failed');
      return NextResponse.json(
        { ...base, error: 'Missing required fields (name, email, role)', logs },
        { status: 400 }
      );
    }

    logs.push('Step 2: checking supabaseAdmin');
    if (!supabaseAdmin) {
      logs.push('Step 2: CRITICAL - supabaseAdmin is null');
      return NextResponse.json(
        {
          ...base,
          error: 'supabaseAdmin is null - SUPABASE_SERVICE_ROLE_KEY missing or NEXT_PUBLIC_SUPABASE_URL missing',
          logs,
        },
        { status: 500 }
      );
    }
    logs.push('Step 2: supabaseAdmin OK');

    logs.push('Step 3: calling auth.admin.createUser');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || 'tempPass123!',
      email_confirm: true,
      user_metadata: { name, role },
    });

    if (authError) {
      logs.push(`Step 3: auth error - ${authError.message}`);
      return NextResponse.json(
        {
          ...base,
          error: authError.message,
          code: authError.code,
          authStatus: authError.status,
          logs,
        },
        { status: 500 }
      );
    }
    logs.push(`Step 3: auth user created id=${authData.user.id}`);

    logs.push('Step 4: inserting into users table');
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
      logs.push(`Step 4: db error - ${error.message}`);
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        logs.push('Step 5: orphan auth user cleaned up');
      } catch (e) {
        logs.push(`Step 5: orphan cleanup failed - ${e.message}`);
      }
      return NextResponse.json(
        { ...base, error: error.message, code: error.code, details: error.details, logs },
        { status: 500 }
      );
    }
    logs.push('Step 4: db insert OK');

    return NextResponse.json({ ...base, success: true, user: data, logs });
  } catch (error) {
    logs.push(`EXCEPTION: ${error?.message}`);
    return NextResponse.json(
      {
        ...base,
        error: error?.message || 'unknown',
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 10).join('\n'),
        logs,
      },
      { status: 500 }
    );
  }
}
