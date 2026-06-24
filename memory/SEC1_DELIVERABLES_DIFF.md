# SEC1 — One-page re-review diff (old spec → revised → refreshed for advisor fixes)

> **Revision 2** — incorporates three additional edits requested 2026-06-22 to
> address Supabase Advisor findings and a CASCADE-vs-RESTRICT safety issue.
> Use this page to confirm all 4 original blockers + 3 new edits + the 2
> explicit owner decisions landed. Once you sign off below, the execution gate
> moves to "ready for staging rehearsal".
>
> **Spec**: `memory/upcoming_prompts/SEC1_rls_hardening.md` (revised 2026-06-22)
> **Deliverables**: 5 generated files (see bottom of this page).

---

## ORIGINAL BLOCKERS — status from prior re-review

### Blocker 1 — Identity + type model

|  | Old spec | Revised spec |
|---|---|---|
| Helper return type | `RETURNS SETOF UUID` | `RETURNS SETOF TEXT` (`user_site_ids`); `RETURNS TEXT` (`user_role`); `RETURNS BOOLEAN` (`user_is_owner_of`); `RETURNS TEXT` (`current_user_app_id` — NEW) |
| `auth.uid()` ↔ app id | compared directly (`owner_id = auth.uid()`) | always bridged: `auth.uid() (UUID) → users.auth_user_id → users.id (TEXT)` |
| Submitter check in `shift_reports` | `submitted_by_user_id = auth.uid()` (type mismatch, fails closed) | `submitted_by_user_id = public.current_user_app_id()` (TEXT = TEXT) |
| Site predicate | `site_id IN (SELECT public.user_site_ids(auth.uid()))` with UUID set | same shape, now `SETOF TEXT IN TEXT` (works) |
| Role lookup | `auth.jwt() ->> 'role'` (not populated by our custom JWT) | `public.user_role(auth.uid())` (reads `users.role`) |
| Pre-flight smoke | service-role only (45/45 masking) | adds **real Supabase session JWT** smoke per role |

**Sign-off:** ☐ confirmed — helpers are TEXT-typed and bridge auth_user_id → users.id throughout.

---

### Blocker 2 — Coverage of all business tables

|  | Old spec | Revised spec |
|---|---|---|
| Table count | ~13 tables | **27** in-scope tables, each with an explicit row in the decision matrix |
| Tables added in the revision | n/a | `fuel_price_acknowledgements`, `fuel_price_changes`, `fuel_price_escalations`, `fuel_price_notifications`, `fuel_deliveries`, `fuel_grades`, `subscriptions`, `stripe_customers`, `stripe_webhook_events`, `user_invites`, `audit_log`, `fuel_prices_live`, `fuel_stations`, `fuel_price_sync_meta` |
| FK predicate per table | mostly "site_id" assumed | verified per-table against live schema (`competitor_fuel_prices.site_id` direct; `dip_readings.site_id` direct; `audit_log` carries `site_id`; `user_invites` has `invited_by_user_id` + `site_id`; `subscriptions.user_id` and `stripe_customers.user_id` TEXT → `users.id`) |
| Deny-all tables | not addressed | `stripe_webhook_events`, `fuel_price_sync_meta` → RLS ON, no JWT policy |
| Invite-token leak | not addressed | `user_invites` explicit `select_scoped` policy |

**Sign-off:** ☐ confirmed — all 27 tables are covered with explicit decisions.

---

### Blocker 3 — Phantom table

|  | Old spec | Revised spec |
|---|---|---|
| `daily_site_rollups` listed in Phase 4 | YES (would error `ALTER TABLE` on apply) | **removed everywhere** |
| Scope vs Phase 4 reconciled | disagreed on `dip_readings`/`daily_site_rollups` | single authoritative table list |

**Sign-off:** ☐ confirmed — `daily_site_rollups` is gone from every artefact.

---

### Blocker 4 — Legacy policies & helpers must be dropped first

|  | Old spec | Revised spec | Refresh (R2) |
|---|---|---|---|
| Drops covered | only `"Allow all for development"` and recursion-fix policies | enumerated list of every legacy named policy | unchanged |
| Legacy helpers dropped | not addressed | dropped in `lib/supabase-sec1-helpers.sql` with CASCADE | **MOVED** to migration Phase A.3 with `RESTRICT` (see Edit 3 below) |
| Dynamic catch-all | absent | DO block iterates `pg_policies` | unchanged |
| Phase 0 inventory | brief note | runbook includes exact queries | unchanged |

**Sign-off:** ☐ confirmed — legacy policies dropped first, then helpers (RESTRICT) afterwards.

---

### Minor — design-rule #5 alignment

|  | Old spec | Revised spec |
|---|---|---|
| Role reference | `auth.jwt() ->> 'role'` in design rule #5 | `public.user_role(auth.uid())` everywhere |

**Sign-off:** ☐ confirmed — no `auth.jwt() ->> 'role'` references remain.

---

# REVISION 2 — Three new edits (2026-06-22)

## Edit 1 — Lock new helpers to `authenticated` (Advisor: "Public Can Execute SECURITY DEFINER Function")

**Problem:** PostgreSQL grants `EXECUTE` to `PUBLIC` by default. Anon clients inherit
from `PUBLIC` and could call our 4 new SECURITY DEFINER helpers via PostgREST RPC,
defeating the SECURITY DEFINER's purpose.

**Fix:** `lib/supabase-sec1-helpers.sql` Section 3 now **REVOKEs from PUBLIC and anon**
before granting to `authenticated`:

```sql
REVOKE EXECUTE ON FUNCTION public.current_user_app_id()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_site_ids(uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_role(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_is_owner_of(uuid, text)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_app_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_site_ids(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_owner_of(uuid, text)   TO authenticated;
```

(`service_role` bypasses RLS and never calls these — no grant needed.)

**Sign-off:** ☐ confirmed — anon cannot call any of the 4 new SECURITY DEFINER helpers.

---

## Edit 2 — Pin `search_path` on the 3 trigger functions (Advisor: "Function Search Path Mutable")

**Problem:** Existing `RETURNS trigger` functions don't pin `search_path`, allowing
schema-shadowing attacks under specific role/grant combinations.

**Fix:** new Section 5 in `lib/supabase-sec1-helpers.sql`. Signatures verified
against existing source SQL files (`grep` confirmed all three are zero-arg, in
`public` schema):

| Function | Source file |
|---|---|
| `public.set_fuel_deliveries_updated_at()` | `lib/supabase-p2b-fuel-margin.sql` |
| `public.tanks_set_updated_at()` | `lib/supabase-wetstock-tier1-migration.sql` |
| `public.set_dip_readings_updated_at()` | `lib/supabase-phase3-dips.sql` |

```sql
ALTER FUNCTION public.set_fuel_deliveries_updated_at() SET search_path = public;
ALTER FUNCTION public.tanks_set_updated_at()           SET search_path = public;
ALTER FUNCTION public.set_dip_readings_updated_at()    SET search_path = public;
```

**Sign-off:** ☐ confirmed — all 3 trigger functions pinned to `search_path = public`.

---

## Edit 3 — 🔴 SAFETY: legacy helper drops moved to migration with RESTRICT (not CASCADE in helpers)

**Problem (the critical one):** Prior version dropped legacy helpers in
`lib/supabase-sec1-helpers.sql` Section 1 with `CASCADE`, in **Phase 1**, *before*
the migration's Phase 2+ dropped legacy policies. But:

- `auth_user_role()` is used by the live policy `users_self_read` on `public.users`
  (predicate: `... OR auth_user_role() = 'owner'`).
- `get_user_id_from_auth()` is used by legacy `sites` policies
  (predicate: `USING (owner_id = get_user_id_from_auth())`).

`DROP FUNCTION … CASCADE` would have **silently dropped those dependent policies**,
weakening `users` and `sites` RLS mid-migration with no error raised. Unacceptable
for a security migration.

**Fix (three parts, all applied):**

### 3a. Removed legacy app-helper drops from `lib/supabase-sec1-helpers.sql` Section 1

The file now ONLY drops previous-attempt SEC1 helpers (which have no policy
dependents because the SEC1 migration was never applied):

```sql
-- Only safe drops remain in the helpers file
DROP FUNCTION IF EXISTS public.user_site_ids(uuid)            CASCADE;
DROP FUNCTION IF EXISTS public.user_role(uuid)                CASCADE;
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, uuid)   CASCADE;
DROP FUNCTION IF EXISTS public.user_is_owner_of(uuid, text)   CASCADE;
DROP FUNCTION IF EXISTS public.current_user_app_id()          CASCADE;
```

### 3b. Confirmed migration Phase A.1 drops the SECURITY-DEFINER-era policies

Verified via `grep` that the migration already drops:
- `users_self_read` on `public.users` (line 71 of the migration)
- `"Owners can view their sites"`, `"Operators can view assigned sites"`,
  `"Staff can view assigned sites"` on `public.sites` (Phase A.1)
- `"Role-based site access"` on `public.sites` (Phase A.1)
- `sites_read` on `public.sites` (Phase A.1)

Plus the dynamic catch-all in Phase A.2 sweeps anything missed.

### 3c. Added Phase A.3 to the migration: drop legacy helpers AFTER policies, with RESTRICT

New block inserted between Phase A.2 (dynamic policy sweep) and Phase B (ENABLE RLS):

```sql
-- =============================================================================
-- PHASE A.3 — Drop legacy SECURITY DEFINER helpers (RESTRICT — fail loud)
-- =============================================================================
-- If any of these aborts the transaction, a policy survived Phase A and
-- was using the helper. Add it to PHASE A.1, re-run.

DROP FUNCTION IF EXISTS public.get_user_id_from_auth()           RESTRICT;
DROP FUNCTION IF EXISTS public.get_operator_site_ids()           RESTRICT;
DROP FUNCTION IF EXISTS public.get_staff_site_ids()              RESTRICT;
DROP FUNCTION IF EXISTS public.get_user_role_and_id()            RESTRICT;
DROP FUNCTION IF EXISTS public.get_operator_assigned_sites(text) RESTRICT;
DROP FUNCTION IF EXISTS public.get_staff_assigned_sites(text)    RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_uuid()                  RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_role()                  RESTRICT;
DROP FUNCTION IF EXISTS public.auth_user_site_ids()              RESTRICT;
```

**Net effect:** policies are recreated by the migration (new policies in Phase 2–4
already in place), the legacy functions go away cleanly, and if anything
unexpected still depends on them the whole run aborts safely.

**Sign-off:** ☐ confirmed — legacy helpers drop AFTER their dependent policies, with RESTRICT.

---

## Two explicit owner decisions (record below in writing)

### Decision 1 — `fuel_prices_live` + `fuel_stations`

- **Option A — any-authenticated read** (DEFAULT shipped in the migration).
- **Option B — owner-only read.**

**Owner decision:** ☐ A   ☐ B   (sign here: _____________________)

### Decision 2 — `fuel_grades`

- Current P2b policy: any-authenticated read, owner-only write. The
  revised migration **replaces this with the same intent** under unified
  policy names.

**Owner decision:** ☐ keep current intent (default)   ☐ change (specify: ________)

---

## Generated deliverables — files for re-review

| File | LOC | Last edit |
|---|---:|---|
| `memory/upcoming_prompts/SEC1_rls_hardening.md` | ~230 | unchanged since R1 |
| `lib/supabase-sec1-helpers.sql` | ~165 | **R2: Edits 1, 2, 3a** |
| `lib/supabase-sec1-rls-hardening-migration.sql` | ~700 | **R2: Edit 3c (new Phase A.3)** |
| `lib/supabase-sec1-rls-hardening-rollback.sql` | ~165 | unchanged since R1 |
| `scripts/verify-sec1-rls.js` | ~170 | unchanged since R1 (lint clean) |
| `memory/SEC1_runbook.md` | ~210 | unchanged since R1 |
| `scripts/introspect-sec1-schema.js` | ~90 | repro artefact (kept) |
| `scripts/introspect-sec1-deep.js` | ~110 | repro artefact (kept) |

---

## Phase-0 snapshot expectation (added per R2)

When you capture the Phase-0 `pg_policies` inventory pre-execution, you should
see these policies present (they will be recreated by the migration; they're
listed here so you can confirm nothing essential is silently lost):

- `users_self_read` on `public.users`
- `"Owners can view their sites"`, `"Operators can view assigned sites"`,
  `"Staff can view assigned sites"` on `public.sites`  *(or)*
- `"Role-based site access"` on `public.sites`  *(or)*
- `sites_read` on `public.sites`
- `op_assign_read` / `"Operator assignments access"` on `public.operator_site_assignments`
- `staff_assign_read` / `"Staff assignments access"` on `public.staff_site_assignments`
- `fd_owner_*`, `fd_operator_*` on `public.fuel_deliveries`
- `fg_read_authed`, `fg_owner_write_*` on `public.fuel_grades`

…plus anything else surfaced by the Phase-0 inventory queries in
`memory/SEC1_runbook.md`. If any of these is missing on the day you execute,
the migration's dynamic catch-all still works; but if any is **present and
not on this list**, investigate before proceeding.

---

## Post-rollout verification (added per R2)

After the migration is applied to staging (later: prod), confirm in Supabase Advisor:

- ☐ "Public Can Execute SECURITY DEFINER Function" — gone for the 4 new helpers.
- ☐ "Function Search Path Mutable" — gone for the 3 trigger functions.
- ☐ `users` and `sites` still enforce self-scoped access (verifier script PASS).
- ☐ Backend test suite 45/45 PASS.

---

## Final re-review sign-off

- ☐ All four original Blocker fixes confirmed.
- ☐ Three R2 edits confirmed (REVOKE, search_path, RESTRICT-after-policy-drops).
- ☐ Two explicit owner decisions recorded.
- ☐ Spec wording reviewed end-to-end.
- ☐ All five generated SQL/script files reviewed.

When all five boxes are ticked, execution moves to the Phase 0 capture in
`memory/SEC1_runbook.md`. **No SQL has been executed yet** and none will be
until you sign off on this page and verify the PITR backup.
