# SEC1 — RLS Hardening Runbook

> Sister document to `memory/upcoming_prompts/SEC1_rls_hardening.md` (revised
> 2026-06-22). This file is the **operator-facing** playbook for the migration:
> Phase 0 inventory, per-phase apply, smoke tests, and per-table rollback.
>
> **Nothing here executes automatically.** Every block is copy-pasteable into
> the Supabase SQL editor. The execution gate (owner sign-off + PITR backup +
> staging rehearsal + real-JWT smoke) blocks all execution.

---

## Phase 0 — Pre-flight inventory (READ-ONLY, must run BEFORE anything else)

Paste these queries into Supabase SQL editor, save the outputs to a file
`memory/SEC1_phase0_snapshot_<date>.md`. They prove what was in place at
execution time and provide the baseline for the per-table rollback.

```sql
-- 0.1  RLS state per table
SELECT relname AS table_name,
       relrowsecurity AS rls_enabled
  FROM pg_class
 WHERE relnamespace='public'::regnamespace AND relkind='r'
 ORDER BY 1;

-- 0.2  Policy inventory (this is the list the migration's "drop legacy" block
--      must cover — if anything here is NOT enumerated in
--      lib/supabase-sec1-rls-hardening-migration.sql's PHASE A.1, the dynamic
--      DO block in A.2 will catch it. Either way, save this output.)
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='public'
 ORDER BY tablename, policyname;

-- 0.3  Legacy SECURITY DEFINER helpers
SELECT proname, pronargs
  FROM pg_proc
 WHERE pronamespace='public'::regnamespace
   AND proname IN (
     'get_user_id_from_auth','get_operator_site_ids','get_staff_site_ids',
     'get_user_role_and_id','get_operator_assigned_sites','get_staff_assigned_sites',
     'auth_user_uuid','auth_user_role','auth_user_site_ids'
   );

-- 0.4  Backend baseline row counts (sanity ground truth pre-migration)
SELECT 'users'                       AS t, count(*) FROM public.users
UNION ALL SELECT 'sites',                       count(*) FROM public.sites
UNION ALL SELECT 'shift_reports',               count(*) FROM public.shift_reports
UNION ALL SELECT 'tank_reconciliation',         count(*) FROM public.tank_reconciliation
UNION ALL SELECT 'audit_log',                   count(*) FROM public.audit_log
UNION ALL SELECT 'subscriptions',               count(*) FROM public.subscriptions
ORDER BY 1;
```

Also: tag a Supabase PITR backup `pre-sec1-<date>` and verify it is
restorable (Supabase Dashboard → Database → Backups). **Do not advance
until the backup is verified.**

---

## Phase 1 — Helpers only

```bash
# Paste contents of lib/supabase-sec1-helpers.sql into Supabase SQL editor
```

Smoke:

```sql
SELECT public.current_user_app_id();       -- NULL as service-role
SELECT * FROM public.user_site_ids(NULL);  -- empty
```

In Supabase Studio, switch to "Run as: authenticated" and use a real owner
JWT (sign in via the app or supabase auth) — re-run those queries. Expect:
- `current_user_app_id()` returns `'owner-001'` (or your owner's app id)
- `user_site_ids(auth.uid())` returns the 5–7 owned sites

**Rollback:**

```sql
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.user_role(uuid)              CASCADE;
DROP FUNCTION IF EXISTS public.user_site_ids(uuid)          CASCADE;
DROP FUNCTION IF EXISTS public.current_user_app_id()        CASCADE;
```

---

## Phases 2–4 — The migration

```bash
# Paste contents of lib/supabase-sec1-rls-hardening-migration.sql
```

The script is one file but logically:
- Phase A — drops every legacy policy (explicit + dynamic catch-all).
- Phase B — enables RLS on 28 tables.
- Phase 2 — leaf assignment-table policies.
- Phase 3 — sites + users policies.
- Phase 4 — all business data tables.
- Phase 5 — verification block (raises NOTICE if RLS missing anywhere).

**At-a-glance sanity after apply:**

```sql
-- Confirm: 28 tables, all RLS enabled.
SELECT count(*) FROM pg_class
 WHERE relnamespace='public'::regnamespace AND relkind='r'
   AND relrowsecurity = true;

-- Policy count per table (look for tables with zero policies that ARE NOT
-- intentionally deny-all: stripe_webhook_events, fuel_price_sync_meta)
SELECT tablename, count(*) FROM pg_policies
 WHERE schemaname='public' GROUP BY 1 ORDER BY 1;
```

---

## Phase 5 — End-to-end verification

```bash
node scripts/verify-sec1-rls.js
```

The verifier signs in as owner/operator/staff (using credentials from
`memory/test_credentials.md`) and asserts visibility per role for every
in-scope table. Exit code 0 = all probes PASS.

Also re-run the backend test suite:

```bash
yarn test
# expect 45/45 PASS
```

---

## Per-table rollback (incident response — preferred over full rollback)

If a customer reports a permission error post-migration affecting ONE table,
roll back just that table — do NOT run the full rollback. Template:

```sql
-- Replace <table_name> and the policy names with the ones from PHASE A.1
ALTER TABLE public.<table_name> DISABLE ROW LEVEL SECURITY;
-- Optionally drop policies too (otherwise they remain inert while RLS is off)
DROP POLICY IF EXISTS <policy_name_1> ON public.<table_name>;
-- ...
```

The app continues to function because the API uses the service-role key
(bypasses RLS). The single table goes back to the pre-SEC1 "open via
PostgREST anon if anyone had the anon key" state — which is the same risk
profile as today, applied to one table only.

### Common one-table rollbacks (copy/paste ready)

```sql
-- shift_reports
ALTER TABLE public.shift_reports DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_reports_delete_owner    ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_update_owner_op ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_insert_submitter ON public.shift_reports;
DROP POLICY IF EXISTS shift_reports_select_member   ON public.shift_reports;

-- user_invites
ALTER TABLE public.user_invites DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_invites_select_scoped ON public.user_invites;

-- fuel_deliveries
ALTER TABLE public.fuel_deliveries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fuel_deliveries_owner_delete    ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_owner_update    ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_owner_op_insert ON public.fuel_deliveries;
DROP POLICY IF EXISTS fuel_deliveries_select_member   ON public.fuel_deliveries;
```

For other tables, see the policy names in
`lib/supabase-sec1-rls-hardening-migration.sql` Phase 2–4.

---

## Full rollback (only if multiple tables fail or the helpers are wrong)

```bash
# Paste contents of lib/supabase-sec1-rls-hardening-rollback.sql
```

This reverses every CREATE POLICY + ENABLE RLS in reverse order and drops
the SEC1 helpers. The `users` table RLS is left enabled (it was on before
SEC1). After this the schema matches the pre-SEC1 state exactly.

---

## Incident classification (for the on-call)

| Symptom | Likely cause | Action |
|---|---|---|
| Owner sees zero sites in the UI | Helper returned empty SETOF — auth.uid() not bridging to users.id | Per-table rollback of `sites`. Then dump `auth.uid()` and `users.auth_user_id` for the affected user. |
| Staff cannot submit a shift report | `shift_reports_insert_submitter` rejects because `submitted_by_user_id ≠ current_user_app_id()` | Verify staff's `users.auth_user_id` matches their JWT. If not, fix the user row, don't roll back. |
| 45/45 backend tests still pass but anon SDK sees rows | Either RLS is not enabled on that table OR you forgot to drop a legacy "Allow all for development" policy | Check `pg_policies`; drop the offending policy. |
| Stripe webhook receives a 401 from PostgREST | Webhook uses anon key — must use service-role key | Fix env, not the policy. |
| Sentry shows "permission denied for table X" spike | New table policy is too tight | Per-table rollback of X, then revise the policy. |

---

## Open owner decisions (record in writing before executing Phase 4)

1. **`fuel_prices_live` / `fuel_stations`** — Option A (any-authenticated read, default in the migration) vs Option B (owner-only). The migration ships Option A; flipping to Option B is a 2-line comment swap.
2. **`fuel_grades`** — confirm the existing P2b intent (any-authed read, owner write) is the desired final state under the new unified policy names (`fuel_grades_*` vs old `fg_*`). The migration assumes yes.
3. **`actor_user_id` in `audit_log`** — accepted that 2/938 historical rows hold UUIDs (system events) rather than TEXT user ids; the column type is TEXT so policies still work. No data migration required, but a future cleanup pass is logged in this runbook.
