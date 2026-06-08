/**
 * POST /api/auth/signup
 *
 * Public self-serve signup endpoint. Creates a NEW OWNER tenant.
 *
 * Security (PART 1 fix): role is HARD-CODED to 'owner' server-side. We never
 * read `role` from the request body — doing so was a privilege-escalation
 * hole that let any caller register as a staff/operator/founder by passing
 * a role string. Operators and staff are NOT creatable via this endpoint;
 * they are invited downwards via /api/invites (operator-only flow) and
 * staff (operator-invites-staff flow).
 *
 * Rationale: each owner is a new tenant. Self-signup = owner only.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // IMPORTANT: do NOT destructure `role` here. Public signup is OWNER-only;
    // accepting role from the body would re-introduce the privilege-escalation
    // bug this commit fixes.
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    // Hard-coded server-side. Never trust the client.
    const role = 'owner';

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (authError) {
      console.error('Auth signup error:', authError);
      return NextResponse.json(
        { error: authError.message || 'Failed to create account' },
        { status: 400 }
      );
    }

    // Create user in database. first_login=true so the onboarding modal
    // fires the first time the new owner logs in.
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      status: 'active',
      first_login: true,
    };

    const { data: user, error: dbError } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();

    if (dbError) {
      console.error('Database user creation error:', dbError);
      // Roll back the auth user so we don't leave orphan auth rows behind.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user,
      message: 'Account created successfully'
    });

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export const OPTIONS = optionsHandler;
