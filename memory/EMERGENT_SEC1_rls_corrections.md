# EMERGENT — Revise SEC1 RLS hardening spec (4 blocking corrections) + generate deliverables. DO NOT EXECUTE.

**Context:** An independent review of `memory/upcoming_prompts/SEC1_rls_hardening.md` against the live schema found the plan *structure* sound but the *SQL* written for an idealized all-UUID, single-identity schema that does not match production. Four blockers must be fixed in the spec, then generate the deliverable SQL files — but **run nothing**. The execution gate (owner sign-off + PITR backup + staging rehearsal) still applies and is unchanged. Hand the revised spec + generated migration back for re-review before any SQL touches a database.

Full rationale is in `SEC1_PLAN_REVIEW.md`. Summary of required changes:

---

## 🔴 Blocker 1 — Fix the identity + type model (this is the critical one)

Production identity model (from `lib/supabase-schema.sql`):
- `users.id` is **TEXT** (e.g. `"operator-001"`); `users.auth_user_id` is **UUID** → `auth.users(id)`.
- `auth.uid()` returns the **auth UUID** = `users.auth_user_id`, **NOT** `users.id`.
- `sites.id`, `sites.owner_id`, and all `*_user_id` assignment columns are **TEXT** referencing `users(id)`.

The spec's helpers (`RETURNS SETOF UUID`, `WHERE owner_id = auth.uid()`) therefore fail-closed AND type-error. **This fail-closed lockout is masked by the test suite** because the app queries via the service-role key (RLS-bypassing) — so a broken helper still passes 45/45 while every authenticated/anon path returns zero rows. Rewrite the helpers to bridge `auth_user_id → users.id` and use TEXT throughout:

```sql
CREATE OR REPLACE FUNCTION public.user_site_ids(auth_uid UUID)
RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT id FROM users WHERE auth_user_id = auth_uid)
  SELECT s.id       FROM sites s                     WHERE s.owner_id         IN (SELECT id FROM me)
  UNION
  SELECT o.site_id  FROM operator_site_assignments o WHERE o.operator_user_id IN (SELECT id FROM me)
  UNION
  SELECT st.site_id FROM staff_site_assignments st   WHERE st.staff_user_id   IN (SELECT id FROM me);
$$;

CREATE OR REPLACE FUNCTION public.user_role(auth_uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM users WHERE auth_user_id = auth_uid;
$$;

CREATE OR REPLACE FUNCTION public.user_is_owner_of(auth_uid UUID, sid TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sites s JOIN users u ON u.id = s.owner_id
                 WHERE s.id = sid AND u.auth_user_id = auth_uid);
$$;
```

Every policy predicate that compares an app-id column to `auth.uid()` must translate first, e.g.:
`submitted_by_user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())`.
Policy site predicates become `site_id IN (SELECT public.user_site_ids(auth.uid()))` (TEXT IN SETOF TEXT).

**Pre-flight (add to Phase 0):** prove `auth.uid()` actually resolves for this custom-auth setup with a real Supabase session JWT. If the frontend never holds a Supabase session (all data via `/api/*` service-role), RLS is pure defence-in-depth with zero app impact — the ideal outcome — but the authenticated-JWT smoke tests then require a genuinely minted session to mean anything.

## 🔴 Blocker 2 — Cover ALL business tables, with an explicit decision each

The schema has 27 business tables; the spec covers ~13. Expand the scope to every table below with the stated policy. Omitting billing/invite/audit tables while locking the rest is the exact "weakest lock" hole the spec warns against.

| Table | Decision |
|---|---|
| `sites` | owner-own + assigned (canonical parent — Phase 3) |
| `operator_site_assignments`, `staff_site_assignments` | site-scoped; **RLS first (Phase 2)**, leaf tables, can't recurse |
| `shift_reports` | read: site member; write: owner/operator (submitter check via `auth_user_id→id`) |
| `shift_formula_results` | via parent `shift_report_id` |
| `dip_readings` | via parent shift_report / site |
| `site_field_configs`, `site_banking_formulas` | site-scoped read; owner/operator write |
| `fuel_price_entries`, `fuel_price_acknowledgements`, `fuel_price_changes`, `fuel_price_escalations`, `fuel_price_notifications` | site-scoped (the pricing pipeline) |
| `fuel_deliveries`, `fuel_grades` | site-scoped |
| `tanks`, `tank_reconciliation` | site-scoped (template already correct — reuse) |
| `site_competitors`, `competitor_fuel_prices` | site-scoped |
| `subscriptions`, `stripe_customers` | 🔴 owner-own (read self via owner→user); writes service-only |
| `user_invites` | 🔴 inviter/owner-scoped read; service writes (anon read would leak invite tokens) |
| `audit_log` | site-scoped read owner/operator if it carries `site_id`; else service-only |
| `stripe_webhook_events`, `fuel_price_sync_meta` | RLS ON, **no JWT policy** = deny-all (service-role only) |
| `fuel_prices_live`, `fuel_stations` | **explicit decision required**: QLD public reference data → public/all-read with service-only writes, OR locked. Don't omit silently. |
| `users` | already RLS — keep (self-read + service) |

## 🔴 Blocker 3 — Remove the phantom table

Phase 4 lists `daily_site_rollups`, which **does not exist** (rollups are computed on the fly by `/api/daily-rollups`). `ALTER TABLE … daily_site_rollups` will error and halt the phase. Remove it. Also reconcile the top "Scope" list with the Phase-4 list so the per-table count is authoritative (they currently disagree on `dip_readings`/`daily_site_rollups`).

## 🔴 Blocker 4 — Drop legacy policies before creating new ones

Disabling RLS did **not** drop the original recursive policies; their definitions still exist (e.g. `"Operators can view assigned sites"` on `sites`, in `lib/supabase-rls-infinite-recursion-fix.sql`, plus the legacy `get_operator_site_ids()` helper). Re-enabling RLS with these still attached reintroduces recursion / OR-combines duplicate policies. The migration must `DROP POLICY IF EXISTS <name> ON <table>` for **every** legacy policy (enumerate them from the Phase 0 `pg_policies` inventory) and `DROP FUNCTION` the obsolete helpers, **before** creating the new policies — not just `"Allow all for development"`.

## 🟡 Minor

- Align design-rule #5 with Phase 4: use `public.user_role(auth.uid())` everywhere; delete the `auth.jwt() ->> 'role'` reference (don't assume the custom JWT carries a role claim).

---

## Deliverables to GENERATE (against the revised spec) — but DO NOT RUN

- `lib/supabase-sec1-helpers.sql` (corrected helpers above)
- `lib/supabase-sec1-rls-hardening-migration.sql` (Phases 2–5; legacy-policy drops included; all 27 tables; TEXT throughout; no `daily_site_rollups`)
- `lib/supabase-sec1-rls-hardening-rollback.sql` (per-table reverse-order DISABLE + DROP)
- `scripts/verify-sec1-rls.js` (read-only; anon / authenticated-JWT-per-role / service; asserts each role sees exactly its own rows and anon sees none)
- `memory/SEC1_runbook.md` (per-table rollback ops)

## Execution gate (unchanged — still blocks running anything)

Owner sign-off in writing · backend baseline captured (target 45/45) · Supabase PITR backup tagged `pre-sec1-<date>` verified restorable · staging clone rehearsed Phases 1–5 + rollback at least once. **Add:** the staging rehearsal must prove role isolation with a **real Supabase session JWT** (a service-role/45-pass alone cannot detect a fail-closed helper).

**Return for re-review:** the revised spec + the generated migration. Do not open the execution gate until that re-review passes.
