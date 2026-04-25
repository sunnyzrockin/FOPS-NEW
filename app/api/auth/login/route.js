import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authData.user.id)
      .single();
    
    if (userError) {
      console.error('User lookup error:', userError);
      return NextResponse.json(
        { error: 'User not found in database' },
        { status: 404 }
      );
    }

    // Get sites based on role
    let sites = [];
    
    if (user.role === 'owner') {
      const { data: ownerSites } = await supabase
        .from('sites')
        .select('*')
        .eq('owner_id', user.id);
      sites = ownerSites || [];
      
    } else if (user.role === 'operator') {
      const { data: assignments } = await supabase
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data: operatorSites } = await supabase
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = operatorSites || [];
      }
      
    } else if (user.role === 'staff') {
      const { data: assignments } = await supabase
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data: staffSites } = await supabase
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = staffSites || [];
      }
    }

    return NextResponse.json({
      user,
      sites,
      session: authData.session
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
