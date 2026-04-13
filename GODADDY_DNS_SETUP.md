# 🌐 GoDaddy DNS Setup for fopsapp.com → Vercel

## Quick Setup (5 minutes)

### **Step 1: Login to GoDaddy**
1. Go to: https://dcc.godaddy.com/
2. Login with your GoDaddy account
3. Click on your name (top right) → **My Products**

### **Step 2: Access DNS Management**
1. Find **fopsapp.com** in your domains list
2. Click the **DNS** button (or three dots → **Manage DNS**)

### **Step 3: Add Vercel DNS Records**

You'll see a list of existing DNS records. Here's what to do:

#### **Option A: Using A Record (Recommended)**

**Delete existing records:**
- Delete any existing **A records** with name `@`
- Delete any **CNAME records** with name `@`
- Delete GoDaddy parking page records

**Add new A record:**
```
Type: A
Name: @
Value: 76.76.21.21
TTL: 600 seconds (or 1 hour)
```
Click **Save**

**Add www CNAME:**
```
Type: CNAME  
Name: www
Value: cname.vercel-dns.com
TTL: 1 hour
```
Click **Save**

#### **Option B: Using CNAME (Alternative)**

**Important**: GoDaddy may not allow CNAME for root domain (@). If this doesn't work, use Option A.

```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: 1 hour
```

### **Step 4: Common GoDaddy DNS Settings**

Your final DNS records should look like this:

| Type  | Name | Value                    | TTL      |
|-------|------|--------------------------|----------|
| A     | @    | 76.76.21.21             | 600/1hr  |
| CNAME | www  | cname.vercel-dns.com    | 1 hour   |

**Remove these if present:**
- A record pointing to `184.168.131.241` (GoDaddy parking)
- CNAME with `@domaincontrol.com`
- Any other A or CNAME for @ or www

### **Step 5: Save and Wait**

1. Click **Save** on all changes
2. DNS propagation typically takes **5-30 minutes** (max 48 hours)
3. You can check status at: https://dnschecker.org/#A/fopsapp.com

---

## 📋 Vercel Domain Setup

### **After DNS is configured, add domain in Vercel:**

1. Go to your Vercel project dashboard
2. Click **Settings** → **Domains**
3. Click **Add** 
4. Enter: `fopsapp.com`
5. Click **Add**

Vercel will:
- Verify DNS is pointing correctly
- Issue free SSL certificate (HTTPS)
- Configure automatic redirects (www → non-www or vice versa)

### **Add both domains for best results:**
```
fopsapp.com          (primary)
www.fopsapp.com      (redirects to primary)
```

---

## ✅ Verification Steps

**1. Check DNS Propagation:**
```bash
nslookup fopsapp.com
# Should return: 76.76.21.21
```

**2. Check CNAME:**
```bash
nslookup www.fopsapp.com
# Should return: cname.vercel-dns.com
```

**3. Test in Browser:**
- http://fopsapp.com (should redirect to https)
- https://fopsapp.com (should show your app)
- https://www.fopsapp.com (should redirect to main domain)

---

## 🔧 Troubleshooting

### **"Domain not verified" in Vercel**
- DNS records not propagated yet (wait 15-30 minutes)
- Wrong DNS values (double-check A record IP)
- GoDaddy nameservers not correct (should be ns**.domaincontrol.com)

### **"SSL certificate pending"**
- Wait 10-15 minutes after DNS verification
- Vercel auto-issues Let's Encrypt certificate
- Check Vercel dashboard for SSL status

### **"This site can't be reached"**
- DNS not propagated yet
- Check https://dnschecker.org/#A/fopsapp.com
- Clear browser cache or try incognito mode

### **Redirecting to GoDaddy parking page**
- Old A records still active
- Go back to GoDaddy DNS and remove parking page records
- Wait for DNS cache to clear (up to 1 hour)

### **Mixed content warnings (HTTPS issues)**
- Ensure all API calls use HTTPS
- Check Supabase URLs are HTTPS
- Vercel handles SSL automatically

---

## 📞 Support

**GoDaddy DNS Help:**
- https://www.godaddy.com/help/manage-dns-680

**Vercel Domain Help:**
- https://vercel.com/docs/concepts/projects/domains

**DNS Checker:**
- https://dnschecker.org/

---

## 🎯 Expected Timeline

- **DNS Setup**: 2-3 minutes
- **DNS Propagation**: 5-30 minutes (can take up to 48 hours)
- **SSL Certificate**: 5-10 minutes after DNS verified
- **Total Time**: Usually 15-45 minutes for everything to go live

---

## ✨ What You'll Have

Once complete, **fopsapp.com** will:
- ✅ Load your WorkflowLite app
- ✅ Have HTTPS (secure green padlock)
- ✅ Auto-redirect www to non-www (or vice versa)
- ✅ Work globally with Vercel's CDN
- ✅ Have automatic deployments on git push

**Your pilot is ready! 🚀**
