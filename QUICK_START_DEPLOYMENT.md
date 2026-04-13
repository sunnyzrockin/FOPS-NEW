# 🚀 WorkflowLite Deployment - Quick Start

## ✅ Your App is Ready!

**What's Built:**
- ✅ Real Supabase Authentication (PostgreSQL)
- ✅ Live Banking Formula Calculations
- ✅ Daily Formula Rollups with SUM aggregation
- ✅ 3-tier Role Hierarchy
- ✅ Shift Reporting & Management
- ✅ Fuel Price Intelligence
- ✅ Production-ready code

**Domain:** fopsapp.com (GoDaddy)
**Deployment:** Vercel (recommended)

---

## 📋 Deployment Checklist

### **Phase 1: Deploy to Vercel** (10 minutes)

**Option A: Use Emergent's "Save to GitHub" Feature**
1. Click "Save to GitHub" button in Emergent chat
2. Follow prompts to create/select repository
3. Go to https://vercel.com/new
4. Import your GitHub repository
5. Root Directory: `app`
6. Click **Deploy**

**Option B: Manual GitHub Push**
```bash
# In your local environment (if you have repo access)
cd /app
git init
git add .
git commit -m "WorkflowLite production deployment"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Then import to Vercel from GitHub.

---

### **Phase 2: Configure Environment Variables** (2 minutes)

In Vercel Dashboard → Settings → Environment Variables:

Add these for **Production, Preview, Development**:

```
NEXT_PUBLIC_SUPABASE_URL
Value: https://xjpelthxnnetecfympmv.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: sb_publishable_qWlmWcHoiwSqZlzLi9YmWw_xlB-kpsr

SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcGVsdGh4bm5ldGVjZnltcG12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyOTcxOCwiZXhwIjoyMDkxNjA1NzE4fQ.6pKn0BW2xSSr5y8O_hZnqKlM5qSEjNXgh0k1ZTNLrVc
```

Click **Save** → **Redeploy**

---

### **Phase 3: GoDaddy DNS Setup** (5 minutes)

1. **Login**: https://dcc.godaddy.com/
2. **Navigate**: My Products → fopsapp.com → DNS
3. **Add A Record**:
   - Type: `A`
   - Name: `@`
   - Value: `76.76.21.21`
   - TTL: `600` seconds

4. **Add CNAME**:
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com`
   - TTL: `1 hour`

5. **Delete** any GoDaddy parking page records

---

### **Phase 4: Link Domain in Vercel** (3 minutes)

1. Vercel Dashboard → **Settings** → **Domains**
2. Click **Add Domain**
3. Enter: `fopsapp.com`
4. Click **Add**
5. Wait for verification (5-15 minutes)
6. SSL certificate auto-issued

---

## ⏱️ Timeline

- **Vercel Deployment**: 5-10 minutes
- **DNS Propagation**: 15-30 minutes (max 48 hours)
- **SSL Certificate**: 5-10 minutes after DNS verified
- **Total**: 30-60 minutes

---

## 🧪 Test Your Deployment

Once DNS propagates, test at **https://fopsapp.com**:

**Login Credentials:**
```
Owner:    owner@workflowlite.com / WorkflowDemo2026!
Operator: operator@workflowlite.com / WorkflowDemo2026!
Staff:    staff@workflowlite.com / WorkflowDemo2026!
```

**Test Flow:**
1. Login as Owner → See all 5 sites
2. Login as Operator → See assigned sites (3 or 2 sites)
3. Login as Staff → Submit shift report
4. Verify live formula calculations appear
5. Check Operator dashboard for daily rollups

---

## 📚 Documentation Files

- `/app/DEPLOYMENT_GUIDE.md` - Full deployment documentation
- `/app/GODADDY_DNS_SETUP.md` - Detailed GoDaddy DNS instructions
- `/app/memory/test_credentials.md` - All test credentials
- `/app/SUPABASE_MIGRATION_GUIDE.md` - Database setup info

---

## 🆘 Need Help?

**DNS Issues:**
- Check propagation: https://dnschecker.org/#A/fopsapp.com
- GoDaddy support: https://www.godaddy.com/help/manage-dns-680

**Vercel Issues:**
- Docs: https://vercel.com/docs
- Domain setup: https://vercel.com/docs/concepts/projects/domains

**Supabase Issues:**
- Dashboard: https://supabase.com/dashboard/project/xjpelthxnnetecfympmv
- Check RLS policies if auth fails

---

## ✨ You're Ready!

Your WorkflowLite app is **production-ready** and waiting to go live at **fopsapp.com**! 

Just follow the 4 phases above and you'll be operational in under an hour. 🚀
