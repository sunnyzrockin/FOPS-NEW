# SEC1 Staging Rehearsal — Evidence Packet Summary

> 🪦 **STAGING CLONE RETIRED 2026-06-26.**
> Project `wzflghadfvvgjvoaigxp` has been deleted and its keys retired.
> The DB password, service-role JWT, and anon JWT that were used during
> the rehearsal are no longer valid against any live project. All
> credentials previously in `.env.staging` (now deleted) and the
> hardcoded `SEC1Staging2026!` test password in
> `scripts/sec1-staging-seed-second-tenant.js` have been replaced with
> a `SEC1_STAGING_USER_PASSWORD` env var that must be set in a fresh
> `.env.staging` for any future rehearsal.
>
> The evidence in this packet (matrices, helper-bridge output, pg_class
> + pg_policies snapshots) is retained as the audit trail for the R2/R3
> deliverable sign-off; nothing in it can be used to access prod.
>
> ---

> **Status**: TECHNICAL GATE PASSED with one **R3 finding** that has been
> implemented in the rollback SQL and re-verified. **Execution gate to PROD
> remains CLOSED** pending owner sign-off on this packet + PITR backup +
> Decision-1 (fuel_prices_live/fuel_stations Option A vs B) confirmation.
>
> **Project**: staging clone `wzflghadfvvgjvoaigxp` (PITR-cloned from prod
> `xjpelthxnnetecfympmv`)
> **Rehearsal start**: 2026-06-25T01:34:58Z
> **Rehearsal end**:   2026-06-25T01:39:30Z
> **Total runtime**:   4m 32s
>
> Earlier run preserved at `memory/SEC1_staging_evidence_run1/` for the audit
> trail (it surfaced the R3 finding).

---

## Headline — what passed, what changed, what the owner needs to know

### ✅ Passed
- **Helper bridge** works: `current_user_app_id()`, `user_role()`, `user_site_ids()`,
  `user_is_owner_of()` all return correct TEXT values for both real owners
  (`owner-001` → 7 sites; `staging-owner-002` → 2 sites). See `step3_helper_bridge.txt`.
- **Migration applies** in 638ms with no errors after the R2 + R3 fixes.
- **Isolation** is clean (`verify_after.txt`):
  - anon = 0 rows on every business table (except Option-A reference data
    `fuel_prices_live`/`fuel_stations` and the global `fuel_grades` lookup).
  - owner_001 sees 7 sites, staging_owner_002 sees 2 sites, service_role sees
    9 — **perfect partition, no cross-owner leak.**
  - staff_001 sees 0 rows on `tank_reconciliation` (correctly blocked).
  - staff_001 sees 17 of 37 notifications (their own only); operator_001 sees
    20 of 37; staging_staff_002 sees 0 (none assigned). `user_id = current_user_app_id()`
    works correctly.
  - `stripe_webhook_events` / `fuel_price_sync_meta` deny-all (0 for every
    JWT role; service_role sees 93/1).
- **Rollback** is clean and **safer than the original baseline** (see R3 below).

### 🔧 Changed during the rehearsal — R3 finding

The original rollback SQL **disabled RLS** on all 28 business tables.
The staging clone proved this is **unsafe** for prod: the pre-migration
baseline already has RLS = ENABLED on all 29 tables with the legacy
recursive policies. Disabling RLS would leave the schema **worse** than
the pre-migration state (anon reads everything via PostgREST). Confirmed
by the original run's `verify_rollback.txt` (run1 archive) which showed
anon = 9 sites, 67 shift_reports, etc.

**Fix applied** to `lib/supabase-sec1-rls-hardening-rollback.sql`:
- DISABLE statements commented out (kept as documentation for incident-only
  per-table use, never the whole block).
- New posture after rollback: RLS still on, 0 policies → deny-all for JWT
  roles; service_role bypasses RLS; API continues to work.

**Re-verified** in this run: post-rollback `pg_class` shows all 29 tables
RLS=true; `verify_rollback.txt` shows every JWT role sees 0 rows on every
table, while service_role still sees full data. This is **strictly safer**
than the original baseline.

### 🆕 Added during rehearsal — scope correction

Discovered a 29th business table (`notifications`) when the migration's
Phase A.3 `RESTRICT` correctly aborted on the legacy `notifications.users_own_notifications`
policy still referencing `auth_user_uuid()`. This is exactly the loud-abort
safety mechanism we designed for.

**Fix applied**:
- `notifications` added to the in-scope list in migration, rollback, and verifier.
- Phase A.1 of the migration now drops `users_own_notifications` explicitly.
- Phase 4 of the migration adds new policies `notifications_select_self` and
  `notifications_update_self` (`user_id = current_user_app_id()`).
- Spec / runbook / diff doc references "29 tables" instead of "28".

---

## Evidence inventory

| File | Description | Result |
|---|---|---|
| `phase0_baseline.txt` | Pre-migration `pg_class` + `pg_policies` + relevant `pg_proc` | **Note**: this run captured a post-restore-RLS-on state (no legacy policies present) because the previous run's rollback dropped them. The run1 archive has the true pre-rehearsal baseline. |
| `phase0_auth_count.txt` | `auth.users` count on staging | 20 users (17 prod-clone + 3 seeded staging users) |
| `baseline_backend.txt` | Backend test plan & rationale for deferral | **DEFERRED** — see file for instructions |
| `verify_before.txt` | Pre-migration verifier matrix | Deny-all (RLS on, 0 policies) — service-role sees all |
| `step2_helpers_OK.txt` | Helper SQL apply result | ✅ 233ms |
| `step3_helper_bridge.txt` | `user_role` + `user_site_ids` for all owners | ✅ owner-001 → 7 sites; staging-owner-002 → 2 sites |
| `step4_migration_OK.txt` | Migration SQL apply result | ✅ 638ms |
| `after_pg_state.txt` | Post-migration `pg_class` + `pg_policies` | 29 tables RLS on, **57 new SEC1 policies**, 0 legacy policies |
| **`verify_after.txt`** | **Post-migration isolation matrix** | **✅ all 9 headline assertions PASS** |
| `step7_rollback_OK.txt` | Rollback SQL apply result | ✅ 242ms |
| `after_rollback_pg_state.txt` | Post-rollback `pg_class` | 29 tables RLS on, 0 policies |
| `verify_rollback.txt` | Post-rollback isolation matrix | All JWT roles see 0 everywhere; service_role unaffected |
| `rollback_vs_baseline_diff.txt` | RLS state drift check | **(no drift — perfect match)** |
| `../SEC1_staging_evidence_run1/` | Run1 archive — captured the R3 finding | Kept for audit trail |

---

## Headline isolation matrix (`verify_after.txt` excerpt)

```
table                  | anon  | owner_001 | operator_001 | staff_001 | staging_owner_002 | staging_operator_002 | staging_staff_002 | service_role
-----------------------+-------+-----------+--------------+-----------+-------------------+----------------------+-------------------+-------------
sites                  | ERR:X | 7         | 6            | 1         | 2                 | 1                    | 1                 | 9
shift_reports          | ERR:X | 67        | 67           | 20        | 0                 | 0                    | 0                 | 67
tank_reconciliation    | ERR:X | 28        | 28           | 0 ✓block  | 0                 | 0                    | 0                 | 28
subscriptions          | ERR:X | 1         | 0            | 0         | 0                 | 0                    | 0                 | 2
stripe_customers       | ERR:X | 1         | 0            | 0         | 0                 | 0                    | 0                 | 2
stripe_webhook_events  | 0     | 0         | 0            | 0         | 0                 | 0                    | 0                 | 93 ✓deny
user_invites           | ERR:X | 2         | 2            | 0         | 0                 | 0                    | 0                 | 2
audit_log              | ERR:X | 127       | 127          | 0         | 0                 | 0                    | 0                 | 938
notifications          | ERR:X | 0         | 20           | 17        | 0                 | 0                    | 0                 | 37
fuel_prices_live       | 0     | 5190      | 5190         | 5190      | 5190              | 5190                 | 5190              | 5190 (Opt A)
fuel_stations          | 0     | 1886      | 1886         | 1886      | 1886              | 1886                 | 1886              | 1886 (Opt A)
fuel_grades            | 0     | 7         | 7            | 7         | 7                 | 7                    | 7                 | 7
fuel_price_sync_meta   | 0     | 0         | 0            | 0         | 0                 | 0                    | 0                 | 1 ✓deny
```

**Assertions:**
- ✓ anon = 0 or ERR on every business table.
- ✓ owner partition: 7 + 2 = 9 sites (every site visible to exactly one owner).
- ✓ staff blocked from `tank_reconciliation`.
- ✓ Option A (any-authenticated read) shipped for `fuel_prices_live` / `fuel_stations`.
- ✓ Deny-all on `stripe_webhook_events` and `fuel_price_sync_meta`.
- ✓ `notifications` correctly user-scoped (operator sees 20 own, staff sees 17 own).
- ✓ `subscriptions` / `stripe_customers` owner-self (owner-001 sees their own 1 row; staging-owner-002 has none).

---

## Helper bridge sanity (`step3_helper_bridge.txt`)

```
owner                                | email                            | user_role | site_count | user_is_owner_of_first
-------------------------------------+----------------------------------+-----------+------------+-----------------------
505ea4d9-… (demo)                    | demo@fopsapp.com                 | owner     | 0          | false (no sites owned)
d7f9cb02-… (real signup)             | seelam.sumanth+real1@gmail.com   | owner     | 0          | false (no sites owned)
owner-001                            | owner@fopsapp.com                | owner     | 7          | true
staging-owner-002                    | staging-owner-002@sec1test.local | owner     | 2          | true
```

The bridge `auth.uid() (UUID) → users.auth_user_id → users.id (TEXT)` works
correctly for both legacy TEXT ids (`owner-001`) and UUID-shaped TEXT ids
(`staging-owner-002` etc.). `user_is_owner_of_first` returns `true` only for
owners who actually own that site — predicate evaluation is sound.

---

## Open owner decisions (still required for prod execution)

1. **`fuel_prices_live` / `fuel_stations`** — Option A is shipped in the
   current migration. The staging rehearsal confirms operators and staff can
   read live QLD reference data under Option A. Owner: confirm A, or signal
   B for tighter posture.
2. **`fuel_grades`** — current intent (any-authed read, owner-only write)
   preserved under unified policy names. Owner: confirm.
3. **`notifications`** (NEW after R3 scope correction) — current intent
   (user-self read + self-update for mark-as-read; service-only insert/delete)
   is what we shipped. Owner: confirm.

---

## Files changed during the rehearsal (R3 + scope correction)

| File | Change |
|---|---|
| `lib/supabase-sec1-rls-hardening-migration.sql` | Added `notifications` to Phase A.1 (drop `users_own_notifications`) + A.2 dynamic catch-all + Phase B ENABLE RLS + Phase 4 new policies (`notifications_select_self`, `notifications_update_self`). Also added explicit drops for `users_self_read`, `shift_reports_insert/update/delete` (legacy), `audit_log_support_select`, `owners_see_own_invites`, `invitee_reads_own_invite`. Bumped table count to 29. |
| `lib/supabase-sec1-rls-hardening-rollback.sql` | **R3 fix**: DISABLE ROW LEVEL SECURITY block commented out (kept as per-table incident reference). New design intent documented. |
| `scripts/verify-sec1-rls.js` | Added `notifications` probe. |
| `scripts/sec1-staging-rehearsal.js` | Added `notifications` to TABLES. |

---

## Technical gate status

| Criterion | Status |
|---|---|
| ≥2 owners with sites on staging | ✅ owner-001 (7), staging-owner-002 (2) |
| Genuine `auth.users ↔ users.auth_user_id` mapping | ✅ 7 sign-ins succeeded |
| Phase 0 baseline captured | ✅ `phase0_baseline.txt` (note: run1 captured legacy policies; this run captured the post-restore state) |
| Pre-migration verifier | ✅ `verify_before.txt` |
| Helper bridge sanity | ✅ `step3_helper_bridge.txt` |
| Migration applies cleanly | ✅ 638ms |
| Post-migration isolation matrix | ✅ `verify_after.txt` — all assertions PASS |
| Rollback applies cleanly | ✅ 242ms |
| Post-rollback verifier | ✅ `verify_rollback.txt` — deny-all for JWT, service-role unaffected |
| RLS state diff vs baseline | ✅ `rollback_vs_baseline_diff.txt` — no drift |
| Backend test 45/45 pre/post | ⏸️ **DEFERRED** — needs separate runner; see `baseline_backend.txt` |

**Net:** the SQL artefacts are correct and the rollback is safe. The technical
gate is satisfied modulo the deferred backend test run.

## Production execution gate — STILL CLOSED

Required before prod execution (unchanged from the spec):
- ☐ Owner sign-off on this evidence packet in writing.
- ☐ Owner confirmation on the 3 open decisions above.
- ☐ Verified Supabase PITR backup of **prod** tagged `pre-sec1-<date>`,
  restorable.
- ☐ Backend test run (yarn test) on a staging-pointed runner — 45/45 PASS pre-
  and post-migration.

When all four are ticked, the prod execution is a single sequence:
1. PITR backup verified.
2. Apply `lib/supabase-sec1-helpers.sql` to prod via psql.
3. Apply `lib/supabase-sec1-rls-hardening-migration.sql` to prod via psql.
4. Run `scripts/verify-sec1-rls.js` with prod credentials.
5. Run backend tests.
6. If any failure: apply `lib/supabase-sec1-rls-hardening-rollback.sql`
   (now safe per R3 fix); investigate.

Staging credentials and connection details remain in `.env.staging` (chmod 600).
