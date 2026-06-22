# SEC1 — Pre-production security hardening: re-enable RLS schema-wide (REVISED)

> **Status**: SPEC FINAL — awaiting owner re-review of revised spec + generated deliverables. **No SQL executed.**
> **Priority**: P0 — must complete before public production launch.
> **Owner**: TBD
> **Original**: 2026-06-15  ·  **Revised**: 2026-06-22
> **Revision basis**: `memory/EMERGENT_SEC1_rls_corrections.md` (4 blocking corrections) + live schema introspection (`scripts/introspect-sec1-schema.js`, `scripts/introspect-sec1-deep.js`).

---

## Why this exists

During pilot rollout `lib/supabase-disable-rls-emergency.sql` disabled RLS across every
business table because the original site-scoped policies caused infinite recursion
(`shift_reports` policy → `operator_site_assignments` → `sites` → `shift_reports` …).
The app currently runs with **application-level filtering only** via `supabaseAdmin`
(service-role key) + `resolveAccessibleSiteIds()` in the API handlers. Two gaps:

1. **Anon-key bypass risk.** Any client that obtains `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   can call PostgREST directly and read every site's data.
2. **Partial RLS is worse than none.** Enabling RLS on a few tables while the rest
   stay open is the weakest-lock anti-pattern.

Fix: re-enable RLS **once, across the whole 27-table business schema, with policies
that cannot recurse and that match the TEXT-PK identity model in production**.

---

## Identity & type model (the source of the original spec's failure)

Live schema (verified 2026-06-22 against production via service-role probe):

| Surface | Type | Example | Notes |
|---|---|---|---|
| `auth.uid()` | UUID | `9a05c352-13dc-…` | Returned by Supabase for an authenticated JWT. |
| `users.auth_user_id` | UUID (stored as text) | `9a05c352-13dc-…` | Bridge column to `auth.users(id)`. |
| `users.id` | TEXT | `operator-001`, `owner-001` | Application identity. Used by every `*_user_id` FK. |
| `sites.id` | TEXT | `site-001` AND UUID-shaped TEXT | Two formats coexist (legacy friendly + newer auto-UUID); column type is TEXT. |
| `sites.owner_id` | TEXT → `users.id` | `owner-001` | |
| `*.site_id` (every table) | TEXT → `sites.id` | matches whatever `sites.id` it points to | |
| `*.{operator,staff,submitted_by,reviewed_by,created_by,entered_by,invited_by,accepted_by,actor}_user_id` | TEXT → `users.id` | `operator-001` (some `actor_user_id` rows hold UUIDs for service-written events; column type is still TEXT) | |
| `shift_formula_results.shift_report_id`, `fuel_price_acknowledgements.price_change_id`, etc. | TEXT/UUID-shaped TEXT | — | Cross-table parent linkage; resolve via parent's `site_id`. |
| `users.role` | TEXT | `owner` | `auth.jwt() ->> 'role'` is **not** populated by our custom signup; use `public.user_role(auth.uid())` instead. |

**Implication.** Every policy that compares an app-id column to `auth.uid()` must
first translate UUID → TEXT via the `auth_user_id → users.id` bridge. Helpers
return `SETOF TEXT`. Direct `owner_id = auth.uid()` (UUID = TEXT) is a type error
*and* fails closed — and that failure is masked by the 45/45 backend test pass
rate because the API uses the service-role key (RLS-bypass).

---

## Scope — all 27 business tables, explicit decision each

Verified via `scripts/introspect-sec1-schema.js` (2026-06-22). `daily_site_rollups`
does **not** exist (rollups are computed on the fly by `/api/daily-rollups`) and
is removed from this spec.

| # | Table | rowcount | Read policy | Write policy | Notes |
|---|---|---:|---|---|---|
| 1 | `users` | 17 | self (`auth_user_id = auth.uid()`) + owners read all | service-only | Keep existing intent; consolidate policies. |
| 2 | `sites` | 7 | `id IN user_site_ids(auth.uid())` | owner-own (`owner_id = current_user_app_id()`) | Canonical parent. |
| 3 | `operator_site_assignments` | 8 | self (`operator_user_id = current_user_app_id()`) OR owner-of-site | owner-of-site | Leaf table. |
| 4 | `staff_site_assignments` | 8 | self (`staff_user_id = current_user_app_id()`) OR owner/operator-of-site | owner/operator-of-site | Leaf table. |
| 5 | `shift_reports` | 67 | site-member | INSERT: site-member + `submitted_by_user_id = current_user_app_id()`; UPDATE: owner/operator-of-site; DELETE: owner-of-site | |
| 6 | `shift_formula_results` | 32 | via parent `shift_report_id → shift_reports.site_id` | service-only | |
| 7 | `dip_readings` | 23 | site-member (direct `site_id`) | site-member + `operator_user_id = current_user_app_id()` (staff write own) | `operator_user_id` column holds staff IDs too — fine, it's TEXT. |
| 8 | `site_field_configs` | 68 | site-member | owner/operator-of-site | |
| 9 | `site_banking_formulas` | 18 | site-member | owner/operator-of-site | |
| 10 | `fuel_price_entries` | 92 | site-member | owner/operator-of-site | |
| 11 | `fuel_price_acknowledgements` | 3 | via parent `price_change_id → fuel_price_changes.site_id` | submitter-own (`staff_user_id` or `operator_user_id = current_user_app_id()`) | |
| 12 | `fuel_price_changes` | 4 | site-member (direct `site_id`) | owner/operator-of-site | |
| 13 | `fuel_price_escalations` | 407 | via parent `price_change_id → fuel_price_changes.site_id` | service-only | |
| 14 | `fuel_price_notifications` | 4 | via parent `price_change_id → fuel_price_changes.site_id` | service-only | |
| 15 | `fuel_deliveries` | 0 | **already RLS-on** (P2b) — keep existing `fd_*` policies OR replace with helpers (decision: REPLACE for naming consistency) | same | Empty in dev — column shape: `id, site_id, …` confirmed by P2b spec. |
| 16 | `fuel_grades` | 7 | any-authenticated read (global lookup) | owner-only write | Already RLS-on (P2b). Keep `fg_*` policies OR replace (decision: REPLACE). |
| 17 | `tanks` | 4 | site-member | owner/operator-of-site | |
| 18 | `tank_reconciliation` | 28 | site-member + role IN (owner,operator) | role IN (owner,operator) | Per product spec — staff cannot see reconciliation. |
| 19 | `site_competitors` | 150 | site-member (direct `site_id`) | owner/operator-of-site | |
| 20 | `competitor_fuel_prices` | 1350 | site-member (direct `site_id` — **no need** to JOIN through `site_competitors`) | owner/operator-of-site | |
| 21 | `subscriptions` | 2 | owner-self (`user_id = current_user_app_id()`) | service-only | |
| 22 | `stripe_customers` | 2 | owner-self (`user_id = current_user_app_id()`) | service-only | |
| 23 | `stripe_webhook_events` | 90 | **deny-all** (RLS ON, no policy) | service-only | |
| 24 | `user_invites` | 2 | inviter (`invited_by_user_id = current_user_app_id()`) OR site-member of `site_id` | service-only | **Critical**: anon read would leak `token` column. |
| 25 | `audit_log` | 938 | row-with-`site_id`: site-member + role IN (owner,operator); row-without-`site_id`: deny | service-only | 158/938 rows carry `site_id`; rest are auth/system events (login, user update). |
| 26 | `fuel_prices_live` | 5190 | **🟡 OWNER DECISION** — Option A: any-authenticated read (QLD public reference data); Option B: owner-role-only read. **Default in migration: Option A** (matches current pilot UX). | service-only | No `user_id`/`site_id`. |
| 27 | `fuel_stations` | 1886 | **🟡 OWNER DECISION** — Option A: any-authenticated read; Option B: owner-role-only. **Default: Option A.** | service-only | No `user_id`/`site_id`. |
| 28 | `fuel_price_sync_meta` | 1 | **deny-all** | service-only | Single global row (`id='global'`). |

Out of scope (already correct or non-business):
- `auth.*` (Supabase-managed).
- Future tenant-isolation features (multi-org) — separate workstream.

---

## Solving the recursion problem

Original recursion: `shift_reports` policy → `operator_site_assignments` →
`sites` → `shift_reports` (CYCLE).

Mandatory design rules:

1. **`SECURITY DEFINER` helpers, not cross-table subqueries inside policies.**
2. **Single canonical site predicate** for site-scoped tables:
   `site_id IN (SELECT public.user_site_ids(auth.uid()))`
3. **Assignment tables are leaves** — they reference only `current_user_app_id()`
   or `user_is_owner_of(auth.uid(), site_id)`. Never `sites` or `shift_reports`.
4. **Service-role bypass is intentional.** API keeps using `supabaseAdmin`.
5. **Role check via `public.user_role(auth.uid())`**, never `auth.jwt() ->> 'role'`.

### Helpers (final)

```sql
-- Bridge auth UUID → app TEXT id (the missing piece in the old spec)
CREATE OR REPLACE FUNCTION public.current_user_app_id()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_site_ids(auth_uid UUID)
RETURNS SETOF TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  WITH me AS (SELECT id FROM public.users WHERE auth_user_id = auth_uid)
  SELECT s.id       FROM public.sites s                     WHERE s.owner_id         IN (SELECT id FROM me)
  UNION
  SELECT o.site_id  FROM public.operator_site_assignments o WHERE o.operator_user_id IN (SELECT id FROM me)
  UNION
  SELECT st.site_id FROM public.staff_site_assignments st   WHERE st.staff_user_id   IN (SELECT id FROM me);
$$;

CREATE OR REPLACE FUNCTION public.user_role(auth_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth_uid LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_is_owner_of(auth_uid UUID, sid TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sites s JOIN public.users u ON u.id = s.owner_id
    WHERE s.id = sid AND u.auth_user_id = auth_uid
  );
$$;
```

`SECURITY DEFINER` makes the function bypass RLS internally, stopping recursion.
All helpers `STABLE` so PostgreSQL can memoise per-query. `search_path` pinned to
avoid hijacking. `GRANT EXECUTE … TO authenticated` (service_role already has all).

---

## Legacy policies & helpers — explicit drops required (Blocker 4)

Disabling RLS does **not** drop the original policies; they survive in `pg_policies`
and re-enabling RLS would OR-combine them with the new ones (and re-introduce
recursion). The migration must:

1. **Drop legacy helpers** (enumerated):
   - `public.get_user_id_from_auth()`
   - `public.get_operator_site_ids()`
   - `public.get_staff_site_ids()`
   - `public.get_user_role_and_id()`
   - `public.get_operator_assigned_sites(text)`
   - `public.get_staff_assigned_sites(text)`
   - `public.auth_user_uuid()`
   - `public.auth_user_role()`
   - `public.auth_user_site_ids()`

2. **Drop legacy named policies** (enumerated from
   `lib/supabase-schema.sql`, `lib/supabase-rls-fix.sql`,
   `lib/supabase-rls-recursion-fix.sql`, `lib/supabase-rls-infinite-recursion-fix.sql`,
   `lib/supabase-rls-security-definer.sql`, `lib/supabase-p2b-fuel-margin-rls.sql`).
   See `lib/supabase-sec1-rls-hardening-migration.sql` for the full list.

3. **Dynamic catch-all**: a `DO` block iterates `pg_policies` for every in-scope
   table and drops anything left, so manually-added policies don't OR-combine.

**Phase 0 of the runbook MUST capture the `pg_policies` inventory first** so we
have proof of what was actually there at execution time.

---

## Deliverables (generated against the revised spec — none executed)

| File | Phase | Purpose |
|---|---|---|
| `lib/supabase-sec1-helpers.sql` | 1 | Drop legacy helpers; create the 4 new helpers. |
| `lib/supabase-sec1-rls-hardening-migration.sql` | 2–4 | Drop legacy policies; enable RLS; create per-table per-cmd policies. |
| `lib/supabase-sec1-rls-hardening-rollback.sql` | rollback | Reverse-order DISABLE + DROP POLICY for every table the migration touches. |
| `scripts/verify-sec1-rls.js` | 5 | Read-only verifier: anon, authenticated JWT per role, service-role — asserts row visibility per role. |
| `memory/SEC1_runbook.md` | ops | Per-table rollback during an incident; Phase 0 inventory queries. |
| `memory/SEC1_DELIVERABLES_DIFF.md` | re-review | One-page diff of old-spec → new-spec by blocker. |

---

## Execution gate — UNCHANGED (still blocks running anything)

- [ ] Owner sign-off in writing on **this revised spec + the 5 generated files**.
- [ ] Backend baseline captured (target 45/45 PASS).
- [ ] Supabase PITR backup tagged `pre-sec1-<date>` verified restorable.
- [ ] Staging clone exists; Phases 1–5 + rollback rehearsed at least once.
- [ ] Staging rehearsal **must include a real Supabase session JWT** for each
      role (owner/operator/staff) — service-role-only 45/45 cannot detect a
      fail-closed helper (see Blocker 1 in the corrections doc).
- [ ] Phase 0 of the runbook executed in prod: capture `pg_policies` and
      `pg_class.relrowsecurity` snapshots.

Two open owner decisions to record in writing before applying Phase 4 to prod:
- **`fuel_prices_live` / `fuel_stations`**: Option A (authenticated read-all) or Option B (owner-only).
- **`fuel_grades`**: confirm the existing P2b policy (any-authenticated read + owner write) is the desired final state (migration replaces with same intent under unified names).

---

## Acceptance criteria

- [ ] `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`
      shows `rls_enabled = true` for **all 27** business tables (excluding `auth.*`).
- [ ] No policy references another business table in a `USING`/`WITH CHECK`
      subquery except via the SECURITY DEFINER helpers or a parent-FK
      `EXISTS` that calls a helper.
- [ ] All backend tests pass (target 45/45) post-migration.
- [ ] Anon-key smoke test: zero rows readable on every business table
      (only `fuel_prices_live`/`fuel_stations` if Option A is chosen).
- [ ] Authenticated JWT smoke per role returns exactly the expected row counts
      (verifier script `scripts/verify-sec1-rls.js` PASS).
- [ ] Service-role smoke identical to pre-migration.
- [ ] `lib/supabase-disable-rls-emergency.sql` stamped DEPRECATED with a header
      pointing here.
