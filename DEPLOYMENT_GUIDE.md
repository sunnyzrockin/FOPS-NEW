# FOPS - Deployment Guide for fopsapp.com

## 🚀 Vercel Deployment Steps

### **1. Push to GitHub (if not already done)**
```bash
git init
git add .
git commit -m "FOPS - Production ready with Supabase"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### **2. Deploy to Vercel**

**Option A: Via Vercel Dashboard (Recommended)**
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Framework Preset: **Next.js** (auto-detected)
4. Root Directory: `app`
5. Click **Deploy**

**Option B: Via Vercel CLI**
```bash
npm i -g vercel
cd /app
vercel --prod
```

### **3. Add Environment Variables in Vercel**

After deployment, go to your Vercel project:
1. Click **Settings** → **Environment Variables**
2. Add these variables for **Production**, **Preview**, and **Development**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xjpelthxnnetecfympmv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_qWlmWcHoiwSqZlzLi9YmWw_xlB-kpsr
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqcGVsdGh4bm5ldGVjZnltcG12Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyOTcxOCwiZXhwIjoyMDkxNjA1NzE4fQ.6pKn0BW2xSSr5y8O_hZnqKlM5qSEjNXgh0k1ZTNLrVc
```

3. Click **Save** and **Redeploy**

---

## 🌐 GoDaddy DNS Configuration for fopsapp.com

### **Step 1: Get Vercel DNS Records**
1. In Vercel Dashboard → Your Project → **Settings** → **Domains**
2. Click **Add Domain**
3. Enter: `fopsapp.com`
4. Vercel will show you DNS records to add

### **Step 2: Configure DNS in GoDaddy**

1. **Login to GoDaddy**: https://dcc.godaddy.com/manage/dns
2. Find **fopsapp.com** in your domains list
3. Click **DNS** or **Manage DNS**

4. **Add these DNS records:**

#### **For Root Domain (fopsapp.com):**
- **Type**: A
- **Name**: @ (or leave blank)
- **Value**: `76.76.21.21` (Vercel's IP)
- **TTL**: 600 (or default)

#### **For www subdomain (www.fopsapp.com):**
- **Type**: CNAME
- **Name**: www
- **Value**: `cname.vercel-dns.com`
- **TTL**: 600 (or default)

**OR use Vercel's recommended CNAME (if provided):**
- **Type**: CNAME
- **Name**: @
- **Value**: `cname.vercel-dns.com`

5. **Delete any conflicting records:**
   - Remove existing A records for @ or www if they point elsewhere
   - Remove GoDaddy's default parking page records

6. **Save changes**

### **Step 3: Verify Domain in Vercel**
1. Go back to Vercel → **Domains**
2. Click **Refresh** or **Verify**
3. Wait 5-10 minutes for DNS propagation
4. Vercel will automatically issue SSL certificate (HTTPS)

---

## ✅ Post-Deployment Checklist

- [ ] Vercel deployment successful
- [ ] Environment variables configured
- [ ] fopsapp.com added in Vercel Domains
- [ ] GoDaddy DNS records updated (A record + CNAME)
- [ ] SSL certificate issued (wait ~10 minutes)
- [ ] Test login at https://fopsapp.com
- [ ] Verify Supabase connection working
- [ ] Test all 3 user roles (Owner, Operator, Staff)

---

## 🔧 Troubleshooting

**DNS not propagating?**
- Wait up to 48 hours (usually 5-30 minutes)
- Check DNS: https://dnschecker.org/#A/fopsapp.com
- Clear browser cache / try incognito mode

**SSL certificate not issued?**
- Ensure DNS is correctly pointing to Vercel
- Wait 10-15 minutes after DNS verification
- Check Vercel dashboard for SSL status

**Environment variables not working?**
- Verify they're set for **Production** environment
- Redeploy after adding variables
- Check Vercel deployment logs

**Supabase connection failing?**
- Verify NEXT_PUBLIC_SUPABASE_URL is correct
- Check Supabase dashboard for any issues
- Verify RLS policies aren't blocking connections

---

## 📱 Test URLs

After deployment:
- **Production**: https://fopsapp.com
- **Vercel Preview**: https://your-project.vercel.app

**Login Credentials:**
- Owner: `owner@fopsapp.com` / `WorkflowDemo2026!`
- Operator: `operator@fopsapp.com` / `WorkflowDemo2026!`
- Staff: `staff@fopsapp.com` / `WorkflowDemo2026!`

---

## 🎯 What's Deployed

✅ Real Supabase Authentication (PostgreSQL)
✅ Live Banking Formula Calculations
✅ Daily Formula Rollups with SUM aggregation
✅ 3-tier Role Hierarchy (Owner → Operator → Staff)
✅ Site Assignment Management
✅ Shift Report Submission
✅ Fuel Price Intelligence
✅ Dashboard Analytics
✅ Row Level Security

**Status**: Production-ready for pilot testing!
