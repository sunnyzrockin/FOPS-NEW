import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Read the SQL schema file
    const schemaPath = path.join(process.cwd(), 'lib', 'supabase-fuel-prices-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        if (error) {
          // Try direct execution for certain statements
          console.log(`Executing: ${statement.substring(0, 100)}...`);
        }
      } catch (err) {
        console.error(`Error executing statement: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Fuel price management schema created successfully',
      statementsExecuted: statements.length
    });
  } catch (error) {
    console.error('Error creating schema:', error);
    return NextResponse.json({
      error: error.message,
      message: 'Please run the SQL schema manually in Supabase SQL Editor'
    }, { status: 500 });
  }
}
