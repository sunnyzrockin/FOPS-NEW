# 🚨 CRITICAL: Vercel Environment Variable Missing

## Problem
Staff/Operator creation fails on production (Vercel) with "Unexpected end of JSON input" because the `SUPABASE_SERVICE_ROLE_KEY` environment variable is not set on Vercel.

## Solution

### Step 1: Add Environment Variable to Vercel

1. **Go to**: https://vercel.com/dashboard
2. **Select** your FOPS project
3. **Click** "Settings" tab
4. **Click** "Environment Variables" (left sidebar)
5. **Add** new variable:
   - **Name**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcGVsdGh4bm5ldGVjZnltcG12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyOTcxOCwiZXhwIjoyMDkxNjA1NzE4fQ.6pKn0BW2xSSr5y8O_hZnqKlM5qSEjNXgh0k1ZTNLrVc`
   - **Environment**: Select all (Production, Preview, Development)
6. **Click** "Save"

### Step 2: Redeploy

**Option A: Trigger Manual Redeploy**
1. Go to "Deployments" tab in Vercel
2. Click "..." menu on latest deployment
3. Click "Redeploy"

**Option B: Push to GitHub**
1. Make any small change (add a space to a file)
2. Push to GitHub
3. Vercel auto-redeploys

### Step 3: Verify

After redeployment completes (~2 minutes):
1. Go to https://fopsapp.com/app
2. Login as owner
3. Try creating operator or staff
4. ✅ Should work!

---

## How to Get Your Service Role Key

If you need to find your Supabase service role key:

1. Go to: https://supabase.com/dashboard
2. Select your FOPS project
3. Click "Settings" (gear icon)
4. Click "API" (left sidebar)
5. Under "Project API keys", copy the **service_role** key
6. Use that value in Vercel

---

## Why This Happened

**Localhost**: Has `.env` file with all keys ✅
**Vercel**: Only has environment variables you manually add ❌

The `.env` file is NOT deployed to Vercel (it's in `.gitignore`). You must manually add environment variables to Vercel dashboard.

---

## Required Environment Variables on Vercel

Make sure ALL of these are set in Vercel:

✅ `NEXT_PUBLIC_SUPABASE_URL`
✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
✅ `SUPABASE_SERVICE_ROLE_KEY` ← **THIS IS MISSING!**
✅ `NEXT_PUBLIC_BASE_URL`

Check your Vercel environment variables now and add any missing ones!
