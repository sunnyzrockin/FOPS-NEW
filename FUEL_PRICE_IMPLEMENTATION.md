# Fuel Price Management Module - Implementation Guide

## ✅ Completed Components

### Backend API Routes (Next.js)
1. `/api/fuel-prices` - GET (list) and POST (create)
2. `/api/fuel-prices/[id]/notify-staff` - POST (operator notifies staff)
3. `/api/fuel-prices/[id]/acknowledge` - POST (staff acknowledges)
4. `/api/fuel-prices/pending` - GET (pending changes for user)
5. `/api/fuel-prices/escalate` - POST (check and create escalations)
6. `/api/setup-fuel-prices` - POST (apply database schema)

### Database Schema
- Created `/app/lib/supabase-fuel-prices-schema.sql`
- Tables: fuel_price_changes, fuel_price_notifications, fuel_price_acknowledgements, fuel_price_escalations
- RLS enabled but set to permissive for pilot

### Frontend - Owner
- ✅ Added "Fuel Prices" tab to Owner dashboard
- ✅ Create price change form with site, fuel type, price, effective datetime
- ✅ Recent price changes list
- ✅ Complete price change log table

## 🔨 TODO: Operator & Staff Components

### Operator Component (For existing "Fuel Pricing" tab)
Add to OperatorDashboard around line 2580, check for `activeTab === 'pricing'`:

```javascript
// Show pending price change notifications
// Display: Site, Fuel Type, Old → New Price, Effective Time
// Button: "Notify Staff" - calls /api/fuel-prices/[id]/notify-staff
// Show escalated items in red
// Add client-side polling every 5 minutes to check /api/fuel-prices/pending?userId={user.id}&role=operator
```

### Staff Component (Banner Alert)
Add at the TOP of StaffDashboard component (before other content):

```javascript
// Check /api/fuel-prices/pending?userId={user.id}&role=staff
// If pending changes exist, show banner at top:
// Banner: "{Site} - {FuelType}: New price {newPrice}¢ effective {datetime}"
// Button: "Acknowledge" - calls /api/fuel-prices/[id]/acknowledge
// Color: Yellow for normal, Red for escalated (15+ min)
// Add client-side polling every 5 minutes
```

### Escalation Polling (Global)
Add to main App component `useEffect`:

```javascript
useEffect(() => {
  const interval = setInterval(async () => {
    // Call /api/fuel-prices/escalate
    // This checks all unacknowledged changes and creates escalations
  }, 5 * 60 * 1000); // Every 5 minutes
  
  return () => clearInterval(interval);
}, []);
```

## 📋 Setup Instructions

### 1. Apply Database Schema
Run the SQL in Supabase SQL Editor:
```sql
-- Copy content from /app/lib/supabase-fuel-prices-schema.sql
-- Execute in Supabase dashboard
```

### 2. Test Owner Flow
1. Login as owner@fopsapp.com
2. Navigate to "Fuel Prices" tab
3. Create a price change
4. Verify operators are notified (check fuel_price_notifications table)

### 3. Test Operator Flow (To be implemented)
1. Login as operator
2. See notification in "Fuel Pricing" tab
3. Click "Notify Staff"
4. Verify staff_notified_at timestamp updated

### 4. Test Staff Flow (To be implemented)
1. Login as staff
2. See banner alert at top of dashboard
3. Click "Acknowledge"
4. Banner should disappear

### 5. Test Escalation
1. Create price change
2. Operator notifies staff
3. Wait 15 minutes (or modify time in /api/fuel-prices/escalate for testing)
4. Escalation polling should create urgent alert
5. Wait 30 minutes → escalate to operator
6. Verify escalation records created

## 🎨 UI Components Needed

### OperatorFuelPriceNotifications
- List of pending price changes for operator's sites
- "Notify Staff" button for each
- Visual indicator for escalated items
- Auto-refresh every 5 minutes

### StaffPriceChangeBanner
- Sticky banner at top when unacknowledged changes exist
- Shows: site, fuel type, price, effective datetime
- "Acknowledge" button
- Red background if escalated (15+ min unacknowledged)
- Auto-refresh every 5 minutes

## 🔧 Code Style Notes
- Use existing FOPS component patterns
- shadcn/ui components (Card, Button, Badge, etc.)
- Tailwind CSS for styling
- Match existing color scheme (blue-600 for primary)
- Use formatCurrency and formatDateTime helpers from existing code
- Follow existing error handling patterns (try-catch with console.error)

## 🐛 Known Limitations
- RLS is disabled for pilot (needs fixing for production)
- No email notifications (in-app only as requested)
- Client-side polling (consider WebSockets for production)
- Alert sounds not implemented
- No mobile push notifications
