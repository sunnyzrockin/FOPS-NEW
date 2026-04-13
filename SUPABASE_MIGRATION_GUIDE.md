# Supabase Migration Guide for WorkflowLite

## 📋 **Step-by-Step Migration Instructions**

### **Step 1: Run SQL Schema in Supabase**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/xjpelthxnnetecfympmv
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**
4. Open the file `/app/lib/supabase-schema.sql` from this project
5. **Copy the entire SQL script** and paste it into the Supabase SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Wait for the success message: "WorkflowLite database schema created successfully!"

**What this does:**
- Creates all database tables (users, sites, assignments, shift_reports, formulas, etc.)
- Sets up indexes for performance
- Configures Row Level Security (RLS) policies
- Adds the new `shift_formula_results` table
- Adds `visible_to_staff` and `visible_in_operator_daily_summary` fields to formulas

---

### **Step 2: Seed the Database**

After the schema is created, you have **two options** to seed demo data:

#### **Option A: API Endpoint (Recommended)**
Once the backend migration is complete, you can call:
```
POST /api/seed-supabase
```

#### **Option B: Direct Supabase Admin (Advanced)**
If you have admin access to Supabase, you can run the seeder script directly. However, user creation in Supabase Auth requires admin API access which we'll handle through the API endpoint.

---

### **Step 3: Verify Schema Creation**

After running the SQL script, verify the tables were created:

1. In Supabase Dashboard → **Table Editor**
2. You should see these tables:
   - ✅ users
   - ✅ sites
   - ✅ operator_site_assignments
   - ✅ staff_site_assignments
   - ✅ site_field_configs
   - ✅ shift_reports
   - ✅ site_banking_formulas
   - ✅ **shift_formula_results** (NEW)
   - ✅ fuel_price_entries
   - ✅ site_competitors
   - ✅ competitor_fuel_prices

---

### **Step 4: Check Authentication Setup**

1. Go to **Authentication** → **Providers** in Supabase Dashboard
2. Ensure **Email** provider is enabled
3. Go to **Authentication** → **Email Templates**
4. Confirm email templates are set up (signup confirmation, password reset, etc.)

---

## 🔑 **Important Notes**

### **About User Creation:**
The seeder will create users in both:
1. **Supabase Auth** (for authentication)
2. **users table** (for application metadata)

The seeder uses `supabase.auth.admin.createUser()` which requires the **Service Role Key** (not just the anon key). We'll handle this in the API route.

### **RLS (Row Level Security):**
Basic RLS policies are included, but for pilot testing, we're handling most access control in application logic. For production, you'd want to strengthen the RLS policies.

---

## ✅ **Once Complete:**

After running the schema, I'll migrate all API routes from MongoDB to Supabase, and you'll have:
- ✅ Real email/password authentication
- ✅ PostgreSQL database (production-ready)
- ✅ Banking formulas with visibility controls
- ✅ Live formula calculations during shift entry
- ✅ Daily formula rollups in operator dashboard
- ✅ Vercel-ready deployment

---

## 🚨 **Current Status:**
**Waiting for you to run the SQL schema in Supabase.**

Once you've done that, reply with "schema created" and I'll proceed with migrating the API routes and authentication!
