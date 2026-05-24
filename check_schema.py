import os
from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

# Check sites table columns
print("=== SITES TABLE ===")
result = supabase.table('sites').select('*').limit(1).execute()
if result.data:
    print("Columns:", list(result.data[0].keys()))

# Check site_field_configs table columns
print("\n=== SITE_FIELD_CONFIGS TABLE ===")
result = supabase.table('site_field_configs').select('*').limit(1).execute()
if result.data:
    print("Columns:", list(result.data[0].keys()))

# Check site_banking_formulas table columns
print("\n=== SITE_BANKING_FORMULAS TABLE ===")
result = supabase.table('site_banking_formulas').select('*').limit(1).execute()
if result.data:
    print("Columns:", list(result.data[0].keys()))
