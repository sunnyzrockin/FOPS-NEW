# 🔍 VERCEL ENVIRONMENT VARIABLES CHECKLIST

## ✅ Required Environment Variables for Staff/Operator Creation

Copy these EXACT names to Vercel:

### 1. NEXT_PUBLIC_SUPABASE_URL
- **Name**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: `https://xjpelthxnnetecfympmv.supabase.co`
- **Required**: Yes
- **Environments**: Production, Preview, Development

### 2. NEXT_PUBLIC_SUPABASE_ANON_KEY  
- **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: `sb_publishable_qWlmWcHoiwSqZlzLi9YmWw_xlB-kpsr`
- **Required**: Yes
- **Environments**: Production, Preview, Development

### 3. SUPABASE_SERVICE_ROLE_KEY
- **Name**: `SUPABASE_SERVICE_ROLE_KEY` (NO "NEXT_PUBLIC_" prefix!)
- **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcGVsdGh4bm5ldGVjZnltcG12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyOTcxOCwiZXhwIjoyMDkxNjA1NzE4fQ.6pKn0BW2xSSr5y8O_hZnqKlM5qSEjNXgh0k1ZTNLrVc`
- **Required**: YES - Critical for user creation!
- **Environments**: Production, Preview, Development

### 4. NEXT_PUBLIC_BASE_URL
- **Name**: `NEXT_PUBLIC_BASE_URL`
- **Value**: `https://fopsapp.com` (your production domain)
- **Required**: Yes
- **Environments**: Production, Preview, Development

---

## 🧪 Verify Environment Variables on Vercel

**After deploying, test with this URL:**

```
https://fopsapp.com/api/debug-env
```

**Expected response (all should show ✅ Set):**
```json
{
  "NEXT_PUBLIC_SUPABASE_URL": "✅ Set",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY": "✅ Set",
  "SUPABASE_SERVICE_ROLE_KEY": "✅ Set",
  "NEXT_PUBLIC_BASE_URL": "✅ Set",
  "SERVICE_KEY_PREVIEW": "eyJh...LrVc",
  "SUPABASE_URL_VALUE": "https://xjpelthxnnetecfympmv.supabase.co"
}
```

If any show `❌ Missing`, add that variable to Vercel!

---

## ⚠️ Common Mistakes

### Mistake 1: Wrong Variable Name
❌ `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` 
✅ `SUPABASE_SERVICE_ROLE_KEY`

The service role key should NOT have `NEXT_PUBLIC_` prefix!

### Mistake 2: Wrong Supabase URL
❌ `https://supabase.co/dashboard/project/...`
✅ `https://xjpelthxnnetecfympmv.supabase.co`

Use the API URL, not the dashboard URL!

### Mistake 3: Forgot to Redeploy
Adding environment variables doesn't auto-redeploy.
You must manually redeploy after adding variables!

---

## 📋 Step-by-Step Verification

### Step 1: Check Vercel Environment Variables

1. Go to: https://vercel.com/dashboard
2. Select FOPS project
3. Settings → Environment Variables
4. Verify these 4 variables exist:
   - ✅ `NEXT_PUBLIC_SUPABASE_URL`
   - ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   - ✅ `SUPABASE_SERVICE_ROLE_KEY`
   - ✅ `NEXT_PUBLIC_BASE_URL`

### Step 2: Check Values Match

Click "reveal" on each variable and compare with values above.

**IMPORTANT**: The anon key should start with `sb_publishable_` or `eyJ...`
The service role key should start with `eyJ...` and be much longer

### Step 3: Verify Environments

Each variable should be checked for:
- ✅ Production
- ✅ Preview  
- ✅ Development

### Step 4: Redeploy

1. Deployments tab
2. Latest deployment → "..." menu
3. Click "Redeploy"
4. Wait 2-3 minutes

### Step 5: Test

```
https://fopsapp.com/api/debug-env
```

Should return all ✅

---

## 🐛 Troubleshooting

### If debug-env shows "❌ Missing"

**Problem**: Variable not set or typo in name

**Solution**: 
1. Double-check spelling (case-sensitive!)
2. Verify no extra spaces
3. Make sure it's added to correct project
4. Redeploy after fixing

### If still getting "empty response" error

**Check Vercel logs:**
1. Vercel → Deployments → Latest
2. Click "View Function Logs"  
3. Look for "CRITICAL: SUPABASE_SERVICE_ROLE_KEY not set"
4. Or look for other error messages

### If logs show "service key not set"

The environment variable isn't loading. Verify:
1. Variable name is exactly: `SUPABASE_SERVICE_ROLE_KEY`
2. No typos, no extra characters
3. Selected all environments
4. Redeployed after adding

---

## ✅ Success Checklist

Before testing staff creation:

- [ ] All 4 environment variables added to Vercel
- [ ] Values match exactly (no typos)
- [ ] All environments selected (Production, Preview, Development)
- [ ] Redeployed after adding variables
- [ ] `/api/debug-env` returns all ✅ Set
- [ ] Push latest code to GitHub (with improved error handling)

When all checked, staff/operator creation should work!

---

## 🔑 Where to Get Supabase Keys

If you need to verify or get fresh keys:

1. **Go to**: https://supabase.com/dashboard
2. **Select** your project (xjpelthxnnetecfympmv)
3. **Settings** (gear icon) → **API**
4. **Copy**:
   - Project URL → Use for `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → Use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → Use for `SUPABASE_SERVICE_ROLE_KEY`

---

**Once all variables are set and you've redeployed, test by creating a staff member on fopsapp.com!**
