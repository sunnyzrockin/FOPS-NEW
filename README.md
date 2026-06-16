# FOPS — Field Operations System

> A lightweight multi-site shift-reporting and fuel-price-intelligence platform for fuel-station owners and operators.

[![Deploy Status](https://img.shields.io/badge/deploy-live-success)](https://fopsapp.com)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ECF8E)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/hosted%20on-Vercel-black)](https://vercel.com/)

🌐 **Production**: [fopsapp.com](https://fopsapp.com)

---

## ✨ What is FOPS?

FOPS is a real-world pilot product for fuel-station chains that need:

- 📊 **Multi-site visibility** for owners — see daily performance across all stations
- 📝 **Dynamic shift reporting** for staff — submit cash, fuel, drive-offs in seconds
- ⛽ **Fuel-price intelligence** — track competitor prices and get insights
- 🔔 **Price change management** — owner posts price → operator notifies → staff acknowledges (with escalation)
- 🧮 **Banking formula builder** — operators define custom calculation logic per site
- 👥 **Strict 3-tier hierarchy** — Owner → Operator → Staff with enforced permission boundaries

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────┐
│   Vercel (https://fopsapp.com)            │
│   ┌──────────────────────────────────────┐ │
│   │   Next.js 15.1 (App Router)         │ │
│   │   • UI routes  (/login, /app/*)     │ │
│   │   • API routes (/api/**)            │ │
│   │     ↳ Node.js serverless functions  │ │
│   └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
              │                    │
              ▼                    ▼
       ┌─────────────┐     ┌─────────────────┐
       │ Supabase    │     │ Supabase        │
       │ Auth (JWT)  │     │ PostgreSQL DB   │
       └─────────────┘     └─────────────────┘
```

**Tech stack**: Next.js 15.1 · React 19 · Tailwind CSS · shadcn/ui · Supabase (Auth + Postgres) · Vercel

---

## 🚀 Quick Start

### 1. Try the live demo
Visit [fopsapp.com](https://fopsapp.com) and log in with any demo account below.

### 2. Demo Credentials
**Universal password**: `WorkflowDemo2026!`

| Role | Email | What you'll see |
|------|-------|-----------------|
| 👑 Owner | `owner@fopsapp.com` | All 5 sites, all operators, all staff |
| 👤 Operator | `operator@fopsapp.com` | 3 assigned sites, manage staff |
| 👷 Staff | `staff@fopsapp.com` | 1 site, submit shift reports |

### 3. Run locally
```bash
git clone <repo-url>
cd fops
yarn install
cp .env.example .env  # add your Supabase keys
yarn dev
# open http://localhost:3000
```

---

## 🔐 Required Environment Variables

| Variable | Where used | Notes |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Public anon key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Admin key — bypasses RLS, NEVER expose |
| `NEXT_PUBLIC_BASE_URL` | Browser | App's public URL |

Set these in:
- Local: `/app/.env`
- Production: Vercel Dashboard → Project Settings → Environment Variables

---

## 📂 Project Structure

```
/
├── app/                       # Next.js App Router
│   ├── login/page.js          # Login page
│   ├── app/page.js            # Main dashboard (3-tier UI)
│   └── api/                   # Backend serverless routes
│       ├── users/             # User CRUD (dedicated, lightweight)
│       ├── auth/              # login, signup
│       ├── fuel-prices/       # Price change module
│       └── [[...path]]/       # Catch-all (sites, reports, etc.)
├── lib/
│   ├── supabase.js            # Client + admin factory
│   └── supabase-seed.js       # Demo data seeder
├── components/ui/             # shadcn/ui components
├── middleware.js              # Route protection
├── PROJECT_DETAILS.md         # 📖 Full project bible
└── memory/test_credentials.md # Demo accounts reference
```

---

## 🎯 Core Features

### Owner Dashboard
- Multi-site map + list view
- Create/edit sites, assign operators
- Top/lowest performer analytics
- Set new fuel prices with effective datetime
- Full reports & rollups

### Operator Dashboard
- Manage assigned sites only
- **Create staff & assign them to sites** (constrained to their own sites)
- Daily rollups (Day/Shift toggle)
- Configure dynamic fields per site
- Build banking formulas with visibility controls
- Track competitor pricing
- Notify staff of price changes

### Staff Dashboard
- Submit shift reports (14+ core fields + custom)
- Live calculations (auto-computed banking formulas)
- View report history
- Acknowledge fuel price changes (15/30 min escalation)

---

## 🔄 3-Tier Permission Boundaries

| Action | Owner | Operator | Staff |
|--------|:-----:|:--------:|:-----:|
| Manage sites | ✅ | ❌ | ❌ |
| Create operators | ✅ | ❌ | ❌ |
| Create staff | ❌ | ✅ | ❌ |
| Assign sites to operators | ✅ | ❌ | ❌ |
| Assign sites to staff | ❌ | ✅ (own only) | ❌ |
| Configure fields | ❌ | ✅ | ❌ |
| Submit reports | ❌ | ❌ | ✅ |
| Review reports | ✅ | ✅ | ❌ |
| Set fuel prices | ✅ | ❌ | ❌ |

---

## 🚢 Deployment

This project auto-deploys to Vercel via GitHub webhook.

```
Code change → Save to GitHub → Vercel webhook → Auto deploy → fopsapp.com
                                                         ↑
                                                  ~1-2 minutes
```

**Rollback**: Vercel Dashboard → Deployments → pick previous → "Promote to Production"

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Server returned empty response" | Visit `/api/debug-env` — verify env vars set |
| Login returns no sites | Owner must assign sites to operator first |
| Staff list shows 0 | Click "Show Debug" on Staff Management for raw API response |
| Stale data on dashboard | Hard refresh (`Cmd/Ctrl+Shift+R`) |

See [`PROJECT_DETAILS.md`](./PROJECT_DETAILS.md) → Section 14 for the full troubleshooting runbook.

---

## 🧪 Testing Status

- ✅ Backend E2E: **96.7% pass** (29/30 tests) — full Owner→Operator→Staff hierarchy
- ✅ Frontend E2E: **85% pass** (17/20) — critical flows + permission boundaries
- ✅ Production verified: User creation, login, assignments, staff list

---

## 📚 Documentation

- **[PROJECT_DETAILS.md](./PROJECT_DETAILS.md)** — Complete project bible (14 sections)
- **[FUEL_PRICE_IMPLEMENTATION.md](./FUEL_PRICE_IMPLEMENTATION.md)** — Fuel price module details
- **[VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)** — Vercel env var setup guide
- **[memory/test_credentials.md](./memory/test_credentials.md)** — Demo account reference

---

## 🛠️ Built With

- **[Next.js 15.1](https://nextjs.org/)** — Full-stack React framework (App Router)
- **[React 19](https://react.dev/)** — UI library
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first styling
- **[shadcn/ui](https://ui.shadcn.com/)** — Accessible component primitives (Radix)
- **[lucide-react](https://lucide.dev/)** — Icons
- **[Supabase](https://supabase.com/)** — PostgreSQL + Auth + RLS
- **[Vercel](https://vercel.com/)** — Hosting + serverless functions

---

## 📋 Roadmap

### 🟡 Next up (P1)
- [ ] Invite-based signup (table schema ready, UI pending)
- [ ] Fuel Price Module — full production verification
- [ ] Email notifications via SendGrid/Resend

### 🟢 Backlog (P2)
- [ ] Refactor `/app/app/page.js` (3.8k-line monolith) into modular components
- [ ] Re-enable RLS with `SECURITY DEFINER` functions
- [ ] Mobile-friendly PWA / React Native app
- [ ] Multi-tenant (multi-company) support
- [ ] Real-time updates via Supabase Realtime

---

## 👥 Credits

- **Product Owner / Pilot**: Sumanth (Vinamay Traders)
- **Built with**: [Emergent](https://emergent.sh) (AI-assisted full-stack development)

---

## 📄 License

Internal pilot project. All rights reserved.

---

<p align="center">
  <a href="https://fopsapp.com">🌐 Live Demo</a> ·
  <a href="./PROJECT_DETAILS.md">📖 Full Documentation</a> ·
  <a href="./memory/test_credentials.md">🔑 Demo Credentials</a>
</p>
