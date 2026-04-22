# 🚀 FUEL PRICE MANAGEMENT - FINAL SETUP

## ⚡ Quick 3-Step Setup

### Step 1: Apply Database Schema (2 minutes)

**Option A: Supabase Dashboard (Recommended)**
1. Open: https://supabase.com/dashboard
2. Select your FOPS project
3. Click **SQL Editor** (left sidebar)
4. Click **+ New Query**
5. Copy ENTIRE content from `/app/APPLY_THIS_SQL.sql`
6. Paste into editor
7. Click **RUN** (or Ctrl/Cmd + Enter)
8. Expected result: "Success. No rows returned"

**Option B: One-by-one (If you get errors)**
Run each CREATE TABLE statement separately in SQL Editor:

1. First, run:
```sql
CREATE TABLE fuel_price_changes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('ULP', 'PULP', 'Diesel')),
  old_price DECIMAL(10, 3),
  new_price DECIMAL(10, 3) NOT NULL,
  effective_datetime TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'acknowledged', 'escalated')),
  notes TEXT
);
```

2. Then run the other 3 CREATE TABLE statements one at a time

3. Finally run all the CREATE INDEX statements together

### Step 2: Verify Tables Created

**Method 1: Check in browser**
Visit: `http://localhost:3000/api/fuel-prices/verify-schema`
or
Visit: `https://fopsapp.com/api/fuel-prices/verify-schema`

**Expected response:**
```json
{
  "tables": {
    "fuel_price_changes": { "exists": true, "rowCount": 0 },
    "fuel_price_notifications": { "exists": true, "rowCount": 0 },
    "fuel_price_acknowledgements": { "exists": true, "rowCount": 0 },
    "fuel_price_escalations": { "exists": true, "rowCount": 0 }
  },
  "ready": true
}
```

**Method 2: Check in Supabase**
1. Go to Supabase Dashboard → Table Editor
2. You should see 4 new tables:
   - fuel_price_changes
   - fuel_price_notifications
   - fuel_price_acknowledgements
   - fuel_price_escalations

### Step 3: Test the Module

**As Owner:**
1. Login to FOPS
2. Click **"Fuel Prices"** tab (new tab in navigation)
3. Create a test price change:
   - Site: Any site
   - Fuel Type: ULP
   - New Price: 195.9
   - Effective Date: Today
   - Effective Time: Now + 10 minutes
4. Click "Create & Notify Operators"
5. Verify it appears in the list

**As Operator (optional):**
1. Login as operator
2. Go to **"Fuel Pricing"** tab
3. Should see price change notification
4. Click "Notify Staff"

**As Staff (optional):**
1. Login as staff
2. Should see yellow banner at top
3. Click "Acknowledge"
4. Banner disappears

## ✅ Success Criteria

All features working if you can:
- ✅ Create price changes as Owner
- ✅ See price changes in the log
- ✅ (After schema applied) No database errors

## 🐛 Troubleshooting

**Error: "relation does not exist"**
→ Tables not created yet. Go to Step 1.

**Error: "permission denied"**
→ Run this in Supabase SQL Editor:
```sql
ALTER TABLE fuel_price_changes DISABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_acknowledgements DISABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_price_escalations DISABLE ROW LEVEL SECURITY;
```

**Error: "foreign key constraint failed"**
→ Make sure `sites` and `users` tables exist first. They should be created from the main FOPS schema.

**Verification endpoint shows "exists: false"**
→ Tables not created. Retry Step 1.

## 📊 What You Get

✅ **Owner Dashboard:**
- "Fuel Prices" tab with create form
- Recent price changes widget
- Complete audit log

✅ **Operator Dashboard:**
- "Fuel Pricing" → "Price Change Notifications" tab
- See pending price changes
- Notify staff button
- Urgency indicators (orange/red for overdue)

✅ **Staff Dashboard:**
- Automatic banner alerts at top
- Yellow banner (normal) → Red banner (15+ min urgent)
- One-click acknowledge

✅ **Escalation System:**
- 15 min → Urgent alert
- 30 min → Critical escalation
- Auto-polling every 5 minutes

## 🎯 After Setup Complete

Once verified:
1. ✅ Push to GitHub (click "Save to GitHub")
2. ✅ Deploys automatically to Vercel
3. ✅ Test on https://fopsapp.com

---

**Need Help?**
Check `/app/FUEL_PRICE_TESTING_GUIDE.md` for detailed testing scenarios.
