# FOPS – Field Operations System
## Complete Project Documentation

> **Last updated**: June 2025  
> **Status**: Pilot-ready, production deployed on Vercel  
> **Owner**: Sumanth (Vinamay Traders) — `vinamaytraders@gmail.com`

---

## 📋 Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Core Features](#3-core-features)
4. [3-Tier Hierarchy](#4-3-tier-hierarchy)
5. [Deployment](#5-deployment)
6. [Demo Credentials](#6-demo-credentials)
7. [Environment Variables](#7-environment-variables)
8. [Database Schema](#8-database-schema)
9. [API Endpoints](#9-api-endpoints)
10. [File Structure](#10-file-structure)
11. [Recent Fixes (Session Log)](#11-recent-fixes-session-log)
12. [Known Issues / Backlog](#12-known-issues--backlog)
13. [How To Deploy Updates](#13-how-to-deploy-updates)
14. [Troubleshooting Runbook](#14-troubleshooting-runbook)

---

## 1. Project Overview

**FOPS (Field Operations System)** — formerly WorkflowLite — is a lightweight multi-site shift-reporting and fuel-price-intelligence platform built for fuel-station owners and operators.

### Problem Solved
- **Owners** with multiple fuel stations need visibility into each site's daily performance without micromanaging every shift.
- **Operators** managing 2–5 sites need to review shift reports, configure custom fields, set banking formulas, and manage fuel pricing.
- **Staff** need a simple, mobile-friendly way to submit shift reports (cash reconciliation, fuel sales, drive-offs, etc.).

### Key Value Props
1. Real-time multi-site visibility for owners
2. Dynamic, per-site shift-report field configuration
3. Automated banking formula calculations
4. Fuel-price intelligence with competitor tracking
5. Daily rollups aggregating all shifts
6. Fuel price change notifications with escalation polling

---

## 2. Architecture & Tech Stack

### Unified Next.js Architecture
```
┌────────────────────────────────────────────────────────┐
│   Vercel  (https://fopsapp.com)                       │
│   ┌─────────────────────────────────────────────────┐  │
│   │   Next.js 15.1 App (single deployment)         │  │
│   │   • /login, /app/*        ← UI routes          │  │
│   │   • /api/**               ← serverless funcs   │  │
│   └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
         │                                │
         ▼                                ▼
   ┌──────────────┐              ┌──────────────────┐
   │ Supabase     │              │ Supabase         │
   │ Auth (JWT)   │              │ PostgreSQL DB    │
   └──────────────┘              └──────────────────┘
   xjpelthxnnetecfympmv.supabase.co
```

### Tech Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.1.10 |
| Language | JavaScript / JSX | ES2024 |
| UI Library | React | 19 |
| Styling | Tailwind CSS | 3.x |
| Components | shadcn/ui + Radix | latest |
| Icons | lucide-react | latest |
| DB | Supabase (PostgreSQL) | managed |
| Auth | Supabase Auth (email/password + JWT) | managed |
| File/XLSX | xlsx package | 0.18.x |
| Hosting | Vercel (serverless) | free/hobby tier |
| CI | GitHub → Vercel auto-deploy | - |

### Why Next.js unified?
- One codebase, one deploy. No CORS headaches.
- `/api/*` routes run as Vercel serverless Node functions.
- Environment variables shared between frontend and API.

---

## 3. Core Features

### 3.1 Authentication
- Real Supabase email/password auth (JWT sessions)
- Session persistence via `localStorage`
- Role-scoped redirects (owner → `/app`, operator → `/app`, staff → `/app`)
- Sign-up flow (currently direct — invite-based planned)

### 3.2 Owner Dashboard
- View all sites (multi-site map + list)
- Create/edit/delete sites
- Assign operators to sites
- Top/lowest performer analytics
- Fuel price management (set new prices with effective datetime)
- Owner-wide reports, rollups, competitor comparison

### 3.3 Operator Dashboard
- View assigned sites only
- Staff management: create, assign sites, delete
- Daily rollups (Day/Shift toggle)
- Dynamic field configuration per site
- Banking formula builder with visibility controls
- Fuel price entry + competitor pricing
- Notify staff of new prices

### 3.4 Staff Dashboard
- Submit shift reports for assigned sites
- 14+ core fields (cash, pump readings, drive-offs, etc.)
- Custom fields defined by operator
- Live calculations (auto-computed banking formulas)
- My Reports history
- Acknowledge fuel price changes (15/30min escalation)

### 3.5 Fuel Price Intelligence
- Per-site per-fuel-type price entries
- Track competitor prices (up to 3 competitors per site)
- Insight engine (good/neutral/warning/danger)
- Morning price brief (ULP-focused)
- Map view (Owner dashboard)

### 3.6 Fuel Price Change Management (New Module)
- Owner creates price change with effective datetime
- Operator notifies staff
- Staff acknowledges
- Escalation polling every 5 minutes (15/30 min thresholds)

---

## 4. 3-Tier Hierarchy

```
  Owner
    │
    ├── creates ──▶  Operator (via /api/users)
    │                    │
    │                    ├── assigned sites (operator_site_assignments)
    │                    │
    │                    └── creates ──▶  Staff (via /api/users)
    │                                       │
    │                                       └── assigned sites (staff_site_assignments)
    │                                           [constrained to operator's own sites]
    │
    └── sees: all their sites + all downstream data
```

### Permission Boundaries
| Action | Owner | Operator | Staff |
|--------|-------|----------|-------|
| Create operator | ✅ | ❌ | ❌ |
| Create staff | ❌ | ✅ | ❌ |
| Manage sites | ✅ | ❌ | ❌ |
| Assign sites to operator | ✅ | ❌ | ❌ |
| Assign sites to staff | ❌ | ✅ (own sites only) | ❌ |
| Configure fields per site | ❌ | ✅ | ❌ |
| Build banking formulas | ❌ | ✅ | ❌ |
| Submit shift reports | ❌ | ❌ | ✅ |
| Review reports | ✅ | ✅ | ❌ |

---

## 5. Deployment

### 5.1 Production
- **URL**: https://fopsapp.com
- **Platform**: Vercel (free/hobby tier)
- **Region**: Auto (Vercel Edge Network)
- **Runtime**: Node.js 20.x (explicitly set via `export const runtime = 'nodejs'`)
- **Max function duration**: 60 seconds

### 5.2 Deploy Flow
1. Code lives in GitHub repo
2. User clicks **"Save to GitHub"** in Emergent chat → pushes commits
3. Vercel webhook fires → auto-builds + deploys
4. Typical deploy time: 1–2 minutes
5. Rollback: available via Vercel dashboard

### 5.3 Local Development
- Runs via `supervisor` (controlled by Emergent platform)
- Command: `yarn dev` on port `3000`
- Hot reload enabled (file changes trigger rebuild)
- Log file: `/var/log/supervisor/nextjs.out.log`

---

## 6. Demo Credentials

**Universal password for all demo accounts:** `WorkflowDemo2026!`

### Owner (1)
| Email | Name | Access |
|-------|------|--------|
| `owner@workflowlite.com` | Michael Roberts | All 5 sites |

### Operators (2)
| Email | Name | Assigned Sites |
|-------|------|----------------|
| `operator@workflowlite.com` | Sarah Johnson | Brisbane Central, Gold Coast, Sunshine Coast |
| `operator2@workflowlite.com` | David Chen | Toowoomba, Cairns |

### Staff (6)
| Email | Name | Assigned Sites |
|-------|------|----------------|
| `staff@workflowlite.com` | Emma Wilson | Brisbane Central |
| `staff2@workflowlite.com` | James Taylor | Brisbane, Gold Coast |
| `staff3@workflowlite.com` | Lisa Brown | Gold Coast, Sunshine Coast |
| `staff4@workflowlite.com` | Mark Davis | Sunshine Coast, Toowoomba |
| `staff5@workflowlite.com` | Anna Martinez | Toowoomba, Cairns |
| `staff6@workflowlite.com` | Tom Anderson | Cairns |

### Real User
- `vinamaytraders@gmail.com` — Sumanth (Operator role, user-managed password)

---

## 7. Environment Variables

All env vars are managed in Vercel dashboard. **Never hardcode these.**

### Public (safe in browser)
| Variable | Value (example) | Usage |
|----------|----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xjpelthxnnetecfympmv.supabase.co` | Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` | Browser auth |
| `NEXT_PUBLIC_BASE_URL` | `https://fopsapp.com` | Base URL for app |

### Server-only (never exposed to browser)
| Variable | Usage |
|----------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB ops (bypasses RLS). Used by API routes only. |

### Local `.env`
File: `/app/.env` — identical keys for local dev.

---

## 8. Database Schema (Supabase PostgreSQL)

### Tables

#### `users`
- `id` (text, PK — UUIDs or custom e.g. `owner-001`)
- `auth_user_id` (text, FK → Supabase Auth)
- `name`, `email`, `role` (`owner|operator|staff`)
- `status` (`active|disabled`)
- `created_at`

#### `sites`
- `id` (text, PK)
- `name`, `code`, `location`
- `owner_id` (FK → users.id)
- `latitude`, `longitude`
- `created_at`

#### `operator_site_assignments`
- `id`, `operator_user_id`, `site_id`, `assigned_by_owner_id`
- `created_at`

#### `staff_site_assignments`
- `id`, `staff_user_id`, `site_id`, `assigned_by_operator_id`
- `created_at`

#### `reports`
- `id`, `site_id`, `staff_user_id`, `shift_date`, `shift_type` (`Morning|Afternoon|Night`)
- `status` (`pending|approved|rejected`)
- `reviewed_by_user_id`
- `custom_values` (jsonb)
- Core fields: opening/closing cash, drive-offs, pump readings, etc.

#### `site_field_configs`
- Per-site dynamic shift report fields
- `id`, `site_id`, `field_key`, `label`, `type`, `visible_to_staff`, `sort_order`

#### `site_banking_formulas`
- `id`, `site_id`, `name`, `formula_json`
- `visible_to_staff`, `visible_in_operator_daily_summary`

#### `site_competitors`
- Per-site competitor stations
- `id`, `site_id`, `name`, `brand`, `distance_km`

#### `fuel_price_entries`
- `id`, `site_id`, `fuel_type`, `price`, `effective_date`

#### `competitor_prices`
- `id`, `competitor_id`, `fuel_type`, `price`, `captured_date`

#### Fuel Price Change Module (new)
- `fuel_price_changes` — `id`, `site_id`, `fuel_type`, `old_price`, `new_price`, `effective_datetime`, `status`
- `fuel_price_notifications` — `id`, `price_change_id`, `operator_user_id`
- `fuel_price_acknowledgements` — `id`, `price_change_id`, `staff_user_id`
- `fuel_price_escalations` — `id`, `price_change_id`, `escalated_at`, `level`

#### `user_invites` (planned — schema ready)
- `id`, `email`, `role`, `invited_by_user_id`, `site_id`, `status`, `expires_at`, `created_at`

### Row Level Security (RLS)
- **Currently DISABLED** on operational tables (`sites`, `assignments`, `reports`) for pilot
- Enabled on `users` (blocks anon reads) — backend uses `supabaseAdmin` to bypass
- **Planned**: Re-enable with `SECURITY DEFINER` functions to avoid previous infinite recursion issue

---

## 9. API Endpoints

### Auth
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Email/password login, returns user + sites + JWT |
| POST | `/api/auth/signup` | Create new account (rare — mostly admin-created) |

### Users (dedicated lightweight route — `/app/app/api/users/`)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/users?role=staff` | List users by role |
| POST | `/api/users` | Create user (auth + DB in one call) |
| PUT | `/api/users/:id` | Update user fields |
| DELETE | `/api/users/:id` | Delete user (DB + auth) |

### Sites
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sites?userId=:id` | Get sites for user (role-scoped) |
| GET | `/api/sites?ownerId=:id` | Get sites for owner |
| GET | `/api/sites/:id` | Single site details |
| POST | `/api/sites` | Create site |
| PUT | `/api/sites/:id` | Update site |
| DELETE | `/api/sites/:id` | Delete site |

### Assignments
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/operator-assignments?ownerId=:id` | Owner's operator assignments |
| GET | `/api/operator-assignments?operatorId=:id` | Operator's own assignments |
| POST | `/api/operator-assignments` | Create assignment |
| DELETE | `/api/operator-assignments/:id` | Remove assignment |
| GET | `/api/staff-assignments?operatorId=:id` | Operator's staff assignments |
| GET | `/api/staff-assignments?ownerId=:id` | Owner's scope of staff assignments |
| POST | `/api/staff-assignments` | Assign staff to site |
| DELETE | `/api/staff-assignments/:id` | Unassign |

### Reports
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/reports?siteIds=…&startDate=…&endDate=…` | Filtered reports |
| GET | `/api/reports/:id` | Single report |
| POST | `/api/reports` | Submit shift report |
| PUT | `/api/reports/:id/status` | Approve/reject |
| GET | `/api/daily-rollups?siteIds=…&startDate=…&endDate=…` | Daily aggregates |
| GET | `/api/reports/daily-rollup?...` | Alternative path |

### Dynamic Fields & Banking
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST/PUT/DELETE | `/api/field-configs` or `/api/site-field-configs` | CRUD dynamic fields |
| POST | `/api/field-configs/bulk` | Bulk update |
| GET/POST/PUT/DELETE | `/api/banking-formulas` or `/api/site-banking-formulas` | CRUD formulas |
| POST | `/api/banking/calculate` | Evaluate formula |

### Fuel Price Intelligence
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST/PUT/DELETE | `/api/site-competitors` | Manage competitors |
| GET/POST/PUT/DELETE | `/api/fuel-price-entries` | Manage own prices |
| GET/POST/PUT/DELETE | `/api/competitor-prices` | Manage competitor prices |
| GET | `/api/fuel-price-comparison?siteIds=…&date=…` | Comparison view |

### Fuel Price Change Module (new)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/fuel-prices?siteId=…&userId=…&role=…` | List price changes |
| POST | `/api/fuel-prices` | Owner creates price change |
| GET | `/api/fuel-prices/pending?userId=…&role=…` | Pending for user |
| POST | `/api/fuel-prices/:id/notify-staff` | Operator notifies staff |
| POST | `/api/fuel-prices/:id/acknowledge` | Staff acknowledges |
| POST | `/api/fuel-prices/escalate` | Escalation polling |
| GET | `/api/fuel-prices/verify-schema` | Schema health check |
| POST | `/api/setup-fuel-prices` | One-time setup |

### Diagnostics (new)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/debug-env` | Verify env vars set on Vercel |
| GET | `/api/test-create-user?run=1` | Diagnose user creation end-to-end |
| POST | `/api/test-create-user` | Manual test |

### Seeding & Misc
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/seed` or `/api/seed-supabase` | Populate demo data |
| POST | `/api/rls-fix` | Apply RLS patches |
| GET/POST | `/api/invites` | Invite CRUD (planned UI) |

---

## 10. File Structure

```
/app
├── app/                          # Next.js App Router
│   ├── page.js                   # Landing page (redirects to /login)
│   ├── layout.js                 # Root layout
│   ├── login/
│   │   └── page.js               # Premium login page
│   ├── app/
│   │   ├── page.js               # ⚠️  MONOLITH (~3.8k lines) — main protected dashboard
│   │   ├── page-old-dashboard.js # backup
│   │   └── dashboard-backup.js   # backup
│   ├── dev-login/                # Dev-only login (bypass)
│   └── api/                      # Backend routes
│       ├── [[...path]]/route.js  # Catch-all (legacy mega route)
│       ├── users/route.js        # 🆕 Dedicated user CRUD
│       ├── users/[id]/route.js   # 🆕 PUT/DELETE user
│       ├── auth/
│       │   ├── login/route.js
│       │   └── signup/route.js
│       ├── fuel-prices/
│       │   ├── route.js
│       │   ├── pending/route.js
│       │   ├── escalate/route.js
│       │   ├── verify-schema/route.js
│       │   ├── [id]/notify-staff/route.js
│       │   └── [id]/acknowledge/route.js
│       ├── setup-fuel-prices/route.js
│       ├── debug-env/route.js          # 🆕 Diagnostic
│       └── test-create-user/route.js   # 🆕 Diagnostic
│
├── lib/
│   ├── supabase.js                 # Client + admin client + status helper
│   ├── supabase-seed.js            # Seed script
│   ├── supabase-schema.sql         # Table definitions
│   └── supabase-fuel-prices-simple.sql  # 🆕 Fuel price module schema
│
├── components/ui/                  # shadcn/ui components
├── middleware.js                   # Route protection (client-side check)
├── next.config.js                  # Next.js config (serverExternalPackages, headers)
├── tailwind.config.js
├── package.json                    # yarn-managed
├── .env                            # Local env (gitignored)
│
├── memory/
│   └── test_credentials.md         # Demo credentials reference
│
├── test_result.md                  # Agent testing log
├── PROJECT_DETAILS.md              # 📄 This file
├── FUEL_PRICE_IMPLEMENTATION.md    # Fuel price module notes
├── VERCEL_ENV_SETUP.md             # Env var checklist
└── VERCEL_ENV_CHECKLIST.md         # Deployment checklist
```

### Key Files to Know
| File | Why it matters |
|------|---------------|
| `/app/app/app/page.js` | **The monolith** — 3.8k lines, contains all dashboard UI. Due for refactor. |
| `/app/app/api/users/route.js` | Dedicated lightweight user CRUD (fixes Vercel cold-start issue). |
| `/app/app/api/[[...path]]/route.js` | Legacy catch-all — handles most other routes. |
| `/app/lib/supabase.js` | Client factories + lazy init (does NOT throw at load). |
| `/app/app/api/auth/login/route.js` | Login + role-scoped sites lookup. |

---

## 11. Recent Fixes (Session Log)

### P0 Production Blocker: User Creation Failing on Vercel

**Symptom**: Owner/operator could not create downstream users on https://fopsapp.com — got "empty response" error. Worked locally. Env vars were verified correct.

**Root Causes (stacked)**:
1. Catch-all `/api/[[...path]]/route.js` imported `xlsx` (1MB+) and `supabase-seed` — Vercel cold-start failures returning empty bodies.
2. No explicit `runtime` declaration — Vercel could infer Edge runtime (incompatible with Supabase admin client).
3. `/lib/supabase.js` threw at module load when env vars not loaded yet → crashed route silently.
4. `handleSignup` was nested *inside* `handleRLSFix`'s try block — block-scoped in strict mode (broke `/api/auth/signup`).
5. Frontend showed misleading "Check Vercel env vars" for any empty response.

**Fixes**:
1. Created dedicated `/app/app/api/users/route.js` + `/users/[id]/route.js` with minimal imports.
2. Added `export const runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 60` to all admin routes.
3. Refactored `lib/supabase.js` to return `null` clients + expose `supabaseStatus()` helper instead of throwing.
4. Moved `handleSignup` to module scope.
5. Frontend now shows real Supabase error codes (e.g. `email_exists`).

### Related Fixes (Assignment Flow)
6. `/api/auth/login` switched to `supabaseAdmin` → operator/staff now receive their sites correctly.
7. `/api/staff-assignments` GET now accepts `?operatorId=` / `?ownerId=` (frontend doesn't forward JWT).
8. `/api/staff-assignments` POST/DELETE use `supabaseAdmin` to bypass RLS.
9. Same refactor for `/api/operator-assignments`.
10. `/api/sites` GET now supports `?userId=` in addition to `?ownerId=`.
11. Frontend `StaffAccessManagement`: `cache: 'no-store'`, defensive `Array.isArray`, inline Debug panel + Refresh button.
12. Empty-state UX on Assign Sites dialog when operator has no sites.

### Validation
- ✅ Backend E2E: **96.7% pass** (29/30 tests) — full Owner → Operator → Staff hierarchy flow
- ✅ Frontend E2E: **85% pass** (17/20) — all critical flows + permission boundaries

---

## 12. Known Issues / Backlog

### 🟡 P1 — Should fix before scale
- **Invite-based signup**: Tables ready (`user_invites`), UI not wired. Owners should invite via email instead of picking passwords.
- **Fuel Price Module production verification**: Implemented, needs end-to-end test on Vercel with real data.

### 🟢 P2 — Nice to have
- **Refactor `/app/app/app/page.js`** (3.8k lines) into:
  - `components/dashboards/OwnerDashboard.jsx`
  - `components/dashboards/OperatorDashboard.jsx`
  - `components/dashboards/StaffDashboard.jsx`
  - `components/shared/*`
- **Re-enable RLS** with `SECURITY DEFINER` functions to avoid the prior infinite-recursion issue.
- **Orphan auth user cleanup**: emails that failed creation before fix are still in Supabase Auth — manual cleanup in Supabase dashboard.
- **Catch-all route slimming**: move more endpoints out of `[[...path]]/route.js` to lightweight dedicated routes.

### 🔵 Future features
- Email notifications via SendGrid/Resend (currently placeholder)
- Mobile app (React Native / PWA)
- Multi-tenant (multi-company) support
- Exportable PDF reports
- Real-time updates via Supabase Realtime subscriptions

---

## 13. How To Deploy Updates

### Via Emergent Chat (standard)
1. Make code changes (either through chat or directly).
2. Click **"Save to GitHub"** button in Emergent chat.
3. GitHub webhook triggers Vercel auto-deploy.
4. Watch Vercel dashboard for status (~1–2 minutes).
5. Visit https://fopsapp.com to verify.

### Rollback
- In Vercel dashboard → Deployments → pick a previous successful deploy → "Promote to Production".

### Emergency
- If a deploy breaks production, immediately roll back in Vercel.
- Then debug locally via `yarn dev` on `localhost:3000`.

---

## 14. Troubleshooting Runbook

### "Server returned empty response" on Vercel
- Hit `/api/debug-env` → verify env vars all show ✅
- Hit `/api/test-create-user?run=1` → should return detailed step logs
- If fails: check Vercel function logs (dashboard → Functions tab)
- 99% of the time: missing `runtime='nodejs'` on a new route, or heavy bundle causing cold-start failures

### User creation works locally but not on Vercel
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel dashboard
- Check `/api/debug-env` — `SERVICE_KEY_LENGTH` should be ~200+ chars
- Verify route uses dedicated `/api/users/route.js` (not catch-all)

### Staff list shows 0 but DB has rows
- Check if `users` table has RLS enabled — if yes, backend must use `supabaseAdmin`
- Click **"Show Debug"** button on Staff Management to see raw API response
- Hard refresh (`Cmd/Ctrl + Shift + R`)

### Operator can't see any sites to assign
- Owner must first assign sites to the operator via Owner Dashboard → Operators → Assign Sites
- Log in, log out, log back in as operator

### Login returns empty sites
- Ensure `/api/auth/login` uses `supabaseAdmin` (not anon `supabase`)
- Verify user exists in `operator_site_assignments` or `staff_site_assignments` tables

### Browser caching stale data
- All dashboard fetches use `cache: 'no-store'` + `_t=Date.now()` cache buster
- Hard refresh if issue persists
- Try incognito mode to rule out extension interference

---

## 📞 Contact & Credits

- **Product Owner / Pilot**: Sumanth (Vinamay Traders) — vinamaytraders@gmail.com
- **Built via**: Emergent platform (AI-assisted full-stack development)
- **Supabase Project**: `xjpelthxnnetecfympmv`
- **Vercel Project**: `fopsv2` (production)
- **Domain**: https://fopsapp.com

---

_End of PROJECT_DETAILS.md_
