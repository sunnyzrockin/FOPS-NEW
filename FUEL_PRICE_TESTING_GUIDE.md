# Fuel Price Management - Setup & Testing Guide

## ✅ Implementation Complete!

All components have been implemented:
- ✅ Owner: Create price changes
- ✅ Operator: View notifications and notify staff
- ✅ Staff: See banner alerts and acknowledge
- ✅ Global escalation polling (5-minute intervals)
- ✅ Complete API backend with escalation logic

## 🗄️ Database Schema Setup (REQUIRED FIRST STEP)

**IMPORTANT:** You MUST apply the database schema before testing!

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to: **SQL Editor** (left sidebar)
3. Click **+ New Query**
4. Copy the ENTIRE contents of `/app/lib/supabase-fuel-prices-schema.sql`
5. Paste into the SQL editor
6. Click **RUN** or press `Ctrl+Enter`
7. You should see: "Success. No rows returned"

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push
```

### Verify Tables Created

Run this query in Supabase SQL Editor to verify:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'fuel_price%';
```

You should see:
- fuel_price_changes
- fuel_price_notifications
- fuel_price_acknowledgements
- fuel_price_escalations

## 🧪 End-to-End Testing Guide

### Test Scenario 1: Owner Creates Price Change

1. **Login as Owner**
   - Email: `owner@fopsapp.com`
   - Password: `WorkflowDemo2026!`

2. **Navigate to Fuel Prices Tab**
   - Click "Fuel Prices" in the top navigation

3. **Create a Price Change**
   - Select a site (e.g., "Sunstate Fuel - Brisbane CBD")
   - Choose fuel type: ULP
   - Enter current price: 189.9
   - Enter new price: 195.9
   - Set effective date: Today
   - Set effective time: Current time + 5 minutes
   - Add note: "Market price increase"
   - Click "Create & Notify Operators"

4. **Verify**
   - ✅ Success message appears
   - ✅ Price change appears in "Recent Price Changes" widget
   - ✅ Status shows as "notified"
   - ✅ Full log table shows the entry

### Test Scenario 2: Operator Receives Notification

1. **Login as Operator**
   - You'll need to create an operator account or use existing one
   - Operator must be assigned to the same site as the price change

2. **Navigate to Fuel Pricing Tab**
   - Click "Fuel Pricing" in navigation
   - **Should auto-open to "Price Change Notifications" sub-tab**

3. **View Pending Notification**
   - ✅ Price change appears in pending list
   - ✅ Shows: Site, Fuel Type, Old → New Price, Effective Time
   - ✅ Status: "New" badge

4. **Notify Staff**
   - Click "Notify Staff" button
   - ✅ Success message appears
   - ✅ Status changes to "✓ Notified"
   - ✅ Shows timestamp of notification

### Test Scenario 3: Staff Acknowledges Price Change

1. **Login as Staff**
   - Staff member must be assigned to the same site

2. **See Banner Alert**
   - ✅ Yellow banner appears at top of dashboard
   - ✅ Shows: Site, Fuel Type, New Price, Effective Time
   - ✅ "Acknowledge" button is visible

3. **Acknowledge**
   - Click "Acknowledge" button
   - ✅ Banner disappears immediately
   - ✅ No error messages

4. **Verify in Operator View**
   - Login back as Operator
   - Go to Fuel Pricing → Price Change Notifications
   - ✅ Shows "X staff acknowledged"
   - ✅ If all staff acknowledged, status = "acknowledged"

### Test Scenario 4: Escalation System

**15-Minute Urgent Alert:**

1. Create price change as Owner
2. Operator notifies staff
3. **Wait 15 minutes** (or modify time in `/app/app/api/fuel-prices/escalate/route.js` for faster testing)
4. Staff dashboard should show:
   - ✅ Banner changes to **RED background**
   - ✅ Shows "⚠️ URGENT" label
   - ✅ Message: "notified over 15 minutes ago"

5. Operator dashboard should show:
   - ✅ Price change card has **orange border**
   - ✅ Badge shows "⚠️ URGENT"

**30-Minute Operator Escalation:**

1. Continue from above (don't acknowledge)
2. **Wait 30 minutes** total from notification time
3. Operator dashboard should show:
   - ✅ Price change card has **RED border**
   - ✅ Badge shows "🚨 CRITICAL"
   - ✅ Message: "Escalated - 30+ min unacknowledged"

### Test Scenario 5: Global Polling

1. **Escalation Polling**:
   - Runs automatically every 5 minutes in background
   - Creates escalation records in database
   - Check browser console for: "Escalation check" logs

2. **Price Change Polling**:
   - Operator and Staff components auto-refresh every 5 minutes
   - You can also click "Refresh" button manually

## 🐛 Troubleshooting

### Database Errors

**Error: "relation fuel_price_changes does not exist"**
- Solution: Run the SQL schema in Supabase dashboard (see setup above)

**Error: "permission denied for table fuel_price_changes"**
- Solution: RLS is enabled. For pilot testing, temporarily disable:
  ```sql
  ALTER TABLE fuel_price_changes DISABLE ROW LEVEL SECURITY;
  ALTER TABLE fuel_price_notifications DISABLE ROW LEVEL SECURITY;
  ALTER TABLE fuel_price_acknowledgements DISABLE ROW LEVEL SECURITY;
  ALTER TABLE fuel_price_escalations DISABLE ROW LEVEL SECURITY;
  ```

### API Errors

**404 on /api/fuel-prices**
- Check if files exist in `/app/app/api/fuel-prices/`
- Restart Next.js server: `sudo supervisorctl restart nextjs`

**500 Internal Server Error**
- Check logs: `tail -100 /var/log/supervisor/nextjs.out.log`
- Verify Supabase credentials in `/app/.env`

### UI Issues

**Owner tab not showing**
- Clear browser cache and localStorage
- Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`

**Staff banner not appearing**
- Verify staff is assigned to the same site as price change
- Check browser console for API errors
- Manually call: `fetch('/api/fuel-prices/pending?userId=STAFF_ID&role=staff')`

**Operator notifications not loading**
- Verify operator is assigned to site
- Check: `fetch('/api/fuel-prices/pending?userId=OPERATOR_ID&role=operator')`

## 📊 Database Queries for Verification

**Check all price changes:**
```sql
SELECT * FROM fuel_price_changes ORDER BY created_at DESC;
```

**Check notifications:**
```sql
SELECT pcn.*, pc.site_id, s.name as site_name, u.name as operator_name
FROM fuel_price_notifications pcn
JOIN fuel_price_changes pc ON pc.id = pcn.price_change_id
JOIN sites s ON s.id = pc.site_id
JOIN users u ON u.id = pcn.operator_user_id
ORDER BY pcn.notified_at DESC;
```

**Check acknowledgements:**
```sql
SELECT pca.*, u.name as staff_name, pc.fuel_type, pc.new_price
FROM fuel_price_acknowledgements pca
JOIN users u ON u.id = pca.staff_user_id
JOIN fuel_price_changes pc ON pc.id = pca.price_change_id
ORDER BY pca.acknowledged_at DESC;
```

**Check escalations:**
```sql
SELECT e.*, pc.site_id, s.name as site_name, pc.fuel_type, pc.new_price
FROM fuel_price_escalations e
JOIN fuel_price_changes pc ON pc.id = e.price_change_id
JOIN sites s ON s.id = pc.site_id
ORDER BY e.escalated_at DESC;
```

## ⏱️ Testing Escalations Faster

To test escalations without waiting 15/30 minutes, temporarily modify `/app/app/api/fuel-prices/escalate/route.js`:

Change:
```javascript
if (minutesElapsed >= 15) {  // Line ~58
if (minutesElapsed >= 30) {  // Line ~78
```

To:
```javascript
if (minutesElapsed >= 1) {   // Test: 1 minute instead of 15
if (minutesElapsed >= 2) {   // Test: 2 minutes instead of 30
```

**Remember to change it back after testing!**

## ✅ Success Criteria

All features are working if:

1. ✅ Owner can create price changes
2. ✅ Operators see notifications automatically
3. ✅ Operators can notify staff
4. ✅ Staff see banner alerts
5. ✅ Staff can acknowledge
6. ✅ Banner disappears after acknowledgement
7. ✅ 15-min urgent alerts appear (red banner for staff, orange card for operator)
8. ✅ 30-min escalations appear (red card for operator)
9. ✅ Complete log shows all price changes with status
10. ✅ Acknowledgement counts update in real-time

## 🚀 Next Steps

After successful testing:

1. **Re-enable RLS** for production security
2. **Add email notifications** (optional)
3. **Add audit logging** for compliance
4. **Consider WebSockets** instead of polling for real-time updates
5. **Add mobile push notifications** for critical alerts

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Check server logs: `tail -100 /var/log/supervisor/nextjs.out.log`
3. Verify database schema is applied
4. Verify user assignments (operators to sites, staff to sites)
5. Check Supabase credentials in `.env`
