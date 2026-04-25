import { NextResponse } from 'next/server';
import { supabaseStatus } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const envCheck = {
    runtime: 'nodejs',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),

    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ? '✅ Set' : '❌ Missing',

    SERVICE_KEY_PREVIEW: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 4)}...${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(
          process.env.SUPABASE_SERVICE_ROLE_KEY.length - 4
        )}`
      : 'Not set',
    SERVICE_KEY_LENGTH: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,

    SUPABASE_URL_VALUE: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set',

    // From the lib (post module-init)
    libStatus: supabaseStatus(),
  };

  return NextResponse.json(envCheck);
}
