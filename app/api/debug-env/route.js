import { NextResponse } from 'next/server';

export async function GET() {
  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing',
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ? '✅ Set' : '❌ Missing',
    
    // Show first/last 4 chars of service key to verify it's correct
    SERVICE_KEY_PREVIEW: process.env.SUPABASE_SERVICE_ROLE_KEY 
      ? `${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 4)}...${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(process.env.SUPABASE_SERVICE_ROLE_KEY.length - 4)}`
      : 'Not set',
      
    // Full URL for debugging
    SUPABASE_URL_VALUE: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set',
  };

  return NextResponse.json(envCheck);
}
