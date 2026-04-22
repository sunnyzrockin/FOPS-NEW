import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const results = {
      tables: {},
      ready: false
    };

    // Check each table
    const tables = [
      'fuel_price_changes',
      'fuel_price_notifications',
      'fuel_price_acknowledgements',
      'fuel_price_escalations'
    ];

    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);

        if (error) {
          results.tables[tableName] = { exists: false, error: error.message };
        } else {
          results.tables[tableName] = { exists: true, rowCount: data ? data.length : 0 };
        }
      } catch (err) {
        results.tables[tableName] = { exists: false, error: err.message };
      }
    }

    // Check if all tables exist
    results.ready = Object.values(results.tables).every(t => t.exists);

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
