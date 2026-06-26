import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/api/audit';
import { optionsHandler } from '@/lib/api/cors';
import { rateLimit, clientIp } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Admin client to bypass RLS for trusted server-side reads/writes
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : supabase;

export async function POST(request) {
  try {
    // ── Rate limit (B2, defence in depth on top of Supabase platform limits) ──
    // Keyed by IP+email so a single attacker can't fan out across many
    // emails from one IP, and can't easily bypass via a botnet against
    // one email. 8 attempts / 60s is generous for genuine fat-fingers;
    // Supabase enforces a tighter platform-wide limit underneath.
    // In-memory limiter is best-effort across serverless instances;
    // primary defence is the Supabase platform rate limit set in Part A3.
    const ip = clientIp(request);
    let emailLower = '';
    let bodyJson = null;
    try {
      bodyJson = await request.json();
      emailLower = (bodyJson?.email || '').toLowerCase().trim();
    } catch {
      // bodyless POST — fall through; the missing-email check below
      // returns a 400 anyway.
    }
    const rl = rateLimit(
      { key: `login:${ip}:${emailLower}`, limit: 8, windowMs: 60_000 },
      request,
    );
    if (!rl.ok) return rl.response;

    const { email, password } = bodyJson || {};
    
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
      await logAudit({
        request,
        action: 'login_failed',
        tableName: 'users',
        actorEmailOverride: email,
        metadata: { reason: authError?.message || 'Invalid credentials' },
      });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Get user from database (use admin to bypass RLS)
    const { data: user, error: userError } = await supabaseAdmin
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

    // Get sites based on role (use admin to bypass RLS)
    let sites = [];
    
    if (user.role === 'owner') {
      const { data: ownerSites } = await supabaseAdmin
        .from('sites')
        .select('*')
        .eq('owner_id', user.id);
      sites = ownerSites || [];
      
    } else if (user.role === 'operator') {
      const { data: assignments } = await supabaseAdmin
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data: operatorSites } = await supabaseAdmin
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = operatorSites || [];
      }
      
    } else if (user.role === 'staff') {
      const { data: assignments } = await supabaseAdmin
        .from('staff_site_assignments')
        .select('site_id')
        .eq('staff_user_id', user.id);
      
      if (assignments && assignments.length > 0) {
        const siteIds = assignments.map(a => a.site_id);
        const { data: staffSites } = await supabaseAdmin
          .from('sites')
          .select('*')
          .in('id', siteIds);
        sites = staffSites || [];
      }
    }

    await logAudit({
      request,
      action: 'login',
      tableName: 'users',
      recordId: user.id,
      actor: { id: user.id, email: user.email, role: user.role },
      metadata: { siteCount: sites.length },
    });

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
export const OPTIONS = optionsHandler;
