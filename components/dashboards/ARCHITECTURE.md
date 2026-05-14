# FOPS Component Architecture — Refactor Roadmap

> Status: **Planning phase** (current monolith is functional & tested at 96.7% backend / 85% frontend)

## Current State
The main dashboard (`/app/app/app/page.js`) is a **3,940-line monolith** that contains:
- Auth/routing logic (~200 lines)
- 3 role-based dashboard views (Owner / Operator / Staff)
- 8+ feature management components
- Helper functions and shared UI

While functional and tested, this monolith is hard to maintain. The refactor plan below extracts it incrementally **without breaking working code**.

---

## Target Structure

```
/app
├── app/app/page.js                              ← Auth + routing only (~200 lines)
└── components/
    ├── shared/
    │   ├── header.jsx                           ← Top nav with logout
    │   ├── morning-price-brief.jsx              ← Used by all dashboards
    │   └── _imports.js                          ← Shared shadcn imports + lucide icons
    ├── owner/
    │   ├── owner-dashboard.jsx                  ← Main Owner view
    │   ├── site-management.jsx                  ← CRUD sites
    │   ├── operator-management.jsx              ← Manage operators + assignments
    │   └── owner-fuel-pricing.jsx               ← Owner-side fuel price entry
    ├── operator/
    │   ├── operator-dashboard.jsx               ← Main Operator view
    │   ├── staff-access-management.jsx          ← Manage staff + assignments
    │   ├── field-configuration.jsx              ← Dynamic shift report fields
    │   ├── banking/
    │   │   ├── banking-management.jsx           ← Wrapper
    │   │   └── banking-formula-builder.jsx      ← The complex builder UI
    │   └── operator-fuel-pricing.jsx            ← Operator notify-staff
    └── staff/
        ├── staff-dashboard.jsx                  ← Main Staff view
        ├── submit-report.jsx                    ← Shift report form
        └── my-reports.jsx                       ← Past reports
```

## Refactor Strategy (Incremental)

### Phase A — Scaffolding (this commit)
- ✅ Create directory structure
- ✅ Document the plan
- ⬜ Move ONE small self-contained component as proof-of-pattern

### Phase B — Extract leaf components (1 session each, low risk)
- ✅ `BankingFormulaBuilder` (~200 lines, self-contained, no parent state) — extracted to `/app/components/operator/banking/banking-formula-builder.jsx`
- ✅ `MorningPriceBrief` (~80 lines, used in multiple places) — extracted to `/app/components/shared/morning-price-brief.jsx`
- ✅ Shared `formatCurrency` / `formatDate` / `formatDateTime` extracted to `/app/lib/format.js`

### Phase C — Extract feature managers (medium risk, needs prop drilling carefully)
- ✅ `BankingManagement` — extracted to `/app/components/operator/banking/banking-management.jsx`
- ✅ `FieldConfiguration` — extracted to `/app/components/operator/field-configuration.jsx`
- ✅ `StaffAccessManagement` — extracted to `/app/components/operator/staff-access-management.jsx`
- ✅ `OperatorManagement` — extracted to `/app/components/owner/operator-management.jsx`

### Phase D — Extract dashboards (highest risk, lots of state passing)
- ✅ **Batch 1**: Shared UI leaves — `Header`, `StatCard`, `ViewToggle`, `DailyRollupRow`, `ReportRow`, `ReportDetail`, `ExportDialog` → `/app/components/shared/*`
- ✅ **Batch 2a**: `ShiftReportForm` → `/app/components/staff/`, `StaffPriceChangeBanner` → `/app/components/staff/`, `SiteManagement` → `/app/components/owner/`, `authedFetch` → `/app/lib/authed-fetch.js`, legacy `UserManagement` deleted (dead code)
- ✅ **Batch 2b**: Fuel-pricing family — `LeafletMapInner`, `LeafletMapClient`, `FuelPriceMapView`, `FuelPriceComparisonSection`, `OperatorPriceChangeNotifications`, `PriceChangeHistory`, `FuelPriceEntry`, `CompetitorManagement`, `FuelPricingManagement`, `OwnerFuelPriceManagement` → `/app/components/fuel-pricing/*`
- ✅ **Batch 2c**: `OwnerDashboard`, `OperatorDashboard`, `StaffDashboard`, `LoginPage` → `/app/components/{owner,operator,staff,auth}/*`. `page.js` rewritten as 162-line slim role-router.

### Phase E — Slim `page.js` to <200 lines (auth + role-router only)
- ✅ **DONE**: `page.js` is now **162 lines** containing only: hydration from localStorage, the 5-min escalation poller, logout flow, refreshSites, and the role-routed JSX (`<Header>` + `<{Staff|Operator|Owner}Dashboard>`).

### Phase E — Slim page.js to just routing
- ⬜ Keep only auth check + role-based dashboard switch
- ⬜ Target: page.js < 300 lines

---

## Why Not All At Once?

The monolith works. Extracting 3,940 lines in a single pass would:
- Risk breaking the working build
- Burn deployment quota on diagnostic redeploys
- Be impossible to bisect if something regresses

**Better approach**: each component extraction gets its own commit + test cycle. After each, we verify the dashboards still render and functional flows still work.

---

## Refactoring Checklist (per component)

When extracting any component:
1. Identify all `useState`, `useEffect`, `useCallback` it owns
2. Identify all props it receives from parent
3. Identify all helper functions it uses (e.g. `formatCurrency`, API fetchers)
4. Move helpers to `components/shared/utils.js` if used by 2+ components
5. Create new `.jsx` file with proper imports
6. Update parent's import to point to new file
7. Run lint + smoke test the affected dashboard
8. Commit with clear message: `refactor: extract <ComponentName>`

---

## Notes for Future Agents

- All backend API routes are stable; refactor is purely frontend
- The `useCallback` pattern is heavily used — preserve dependency arrays exactly
- Some components share state via parent (e.g. `sites`, `user`) — pass as props
- shadcn/ui imports are consistent; can be centralized in `_imports.js` later
- DO NOT change behavior during refactor; only restructure
