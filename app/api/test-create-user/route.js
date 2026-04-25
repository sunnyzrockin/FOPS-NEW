import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  const logs = [];
  
  try {
    logs.push('Step 1: Starting user creation test');
    
    const body = await request.json();
    logs.push(`Step 2: Body parsed: ${JSON.stringify(body)}`);
    
    const { name, email, password, role } = body;
    
    // Check if supabaseAdmin exists
    if (!supabaseAdmin) {
      logs.push('Step 3: CRITICAL - supabaseAdmin is null!');
      return NextResponse.json({ 
        error: 'supabaseAdmin is null',
        logs 
      }, { status: 500 });
    }
    logs.push('Step 3: supabaseAdmin exists ✓');
    
    // Try to create auth user
    logs.push('Step 4: Attempting to create auth user...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || 'tempPass123!',
      email_confirm: true,
      user_metadata: { name, role }
    });
    
    if (authError) {
      logs.push(`Step 4: Auth error: ${authError.message}`);
      return NextResponse.json({ 
        error: authError.message,
        logs 
      }, { status: 500 });
    }
    
    logs.push(`Step 4: Auth user created: ${authData.user.id} ✓`);
    
    // Create user in database
    logs.push('Step 5: Creating user in database...');
    const newUser = {
      id: uuidv4(),
      auth_user_id: authData.user.id,
      name,
      email,
      role,
      status: 'active'
    };
    
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([newUser])
      .select()
      .single();
    
    if (error) {
      logs.push(`Step 5: Database error: ${error.message}`);
      return NextResponse.json({ 
        error: error.message,
        logs 
      }, { status: 500 });
    }
    
    logs.push('Step 5: User created in database ✓');
    logs.push('SUCCESS: User created successfully!');
    
    return NextResponse.json({ 
      success: true,
      user: data,
      logs 
    });
    
  } catch (error) {
    logs.push(`EXCEPTION: ${error.message}`);
    logs.push(`Stack: ${error.stack}`);
    return NextResponse.json({ 
      error: error.message,
      logs 
    }, { status: 500 });
  }
}
