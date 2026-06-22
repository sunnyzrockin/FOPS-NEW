# SEC1 — One-page re-review diff (old spec → revised spec)

> Use this page to confirm all 4 blocking corrections + the 2 explicit owner
> decisions landed in the revised spec + generated deliverables. Once you
> sign off below, the execution gate moves to "ready for staging rehearsal".
>
> **Spec**: `memory/upcoming_prompts/SEC1_rls_hardening.md` (revised 2026-06-22)
> **Deliverables**: 5 generated files (see bottom of this page).

---

## Blocker 1 — Identity + type model

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

## Blocker 2 — Coverage of all business tables

|  | Old spec | Revised spec |
|---|---|---|
| Table count | ~13 tables ("any future business tables — Same pattern" was hand-wavy) | **27** in-scope tables, each with an explicit row in the decision matrix |
| Tables added in the revision | n/a | `fuel_price_acknowledgements`, `fuel_price_changes`, `fuel_price_escalations`, `fuel_price_notifications`, `fuel_deliveries`, `fuel_grades`, `subscriptions`, `stripe_customers`, `stripe_webhook_events`, `user_invites`, `audit_log`, `fuel_prices_live`, `fuel_stations`, `fuel_price_sync_meta` |
| FK predicate per table | mostly "site_id" assumed | verified per-table against live schema (probes saved to `/tmp/sec1_introspect.txt`, `/tmp/sec1_deep.txt`): `competitor_fuel_prices.site_id` is direct (no JOIN through `site_competitors`); `dip_readings.site_id` direct; `audit_log` carries `site_id` (158/938 rows); `user_invites` has `invited_by_user_id` + `site_id`; `subscriptions.user_id` and `stripe_customers.user_id` TEXT → `users.id` |
| Deny-all tables | not addressed | `stripe_webhook_events`, `fuel_price_sync_meta` → RLS ON, no JWT policy (service-role bypasses) |
| Invite-token leak | not addressed | `user_invites` explicit `select_scoped` policy to protect `token` from anon read |

**Sign-off:** ☐ confirmed — all 27 tables are covered with explicit decisions.

---

## Blocker 3 — Phantom table

|  | Old spec | Revised spec |
|---|---|---|
| `daily_site_rollups` listed in Phase 4 | YES (would error `ALTER TABLE` on apply) | **removed everywhere**: spec table, migration SQL, rollback SQL, verifier script, runbook |
| Scope vs Phase 4 reconciled | scope list and Phase 4 list disagreed on `dip_readings` and `daily_site_rollups` | single authoritative table list in the decision matrix |

**Sign-off:** ☐ confirmed — `daily_site_rollups` is gone from every artefact.

---

## Blocker 4 — Legacy policies & helpers must be dropped first

|  | Old spec | Revised spec |
|---|---|---|
| Drops covered | only `"Allow all for development"` and the recursion-fix policies | full enumerated list of every legacy named policy from `supabase-schema.sql`, `supabase-rls-fix.sql`, `supabase-rls-recursion-fix.sql`, `supabase-rls-infinite-recursion-fix.sql`, `supabase-rls-security-definer.sql`, `supabase-p2b-fuel-margin-rls.sql` |
| Legacy helpers dropped | not addressed | `get_user_id_from_auth`, `get_operator_site_ids`, `get_staff_site_ids`, `get_user_role_and_id`, `get_operator_assigned_sites(text)`, `get_staff_assigned_sites(text)`, `auth_user_uuid`, `auth_user_role`, `auth_user_site_ids` — all dropped in `lib/supabase-sec1-helpers.sql` |
| Dynamic catch-all | absent | `DO` block iterates `pg_policies` for every in-scope table and `DROP POLICY IF EXISTS` anything left (catches manually-added Studio policies) |
| Phase 0 inventory | brief note | runbook includes the exact `pg_policies` + `pg_class` + `pg_proc` queries to capture the state before applying anything |

**Sign-off:** ☐ confirmed — legacy policies and helpers are dropped before new policies are created.

---

## Minor — design-rule #5 alignment

|  | Old spec | Revised spec |
|---|---|---|
| Role reference | `auth.jwt() ->> 'role'` in design rule #5 | replaced with `public.user_role(auth.uid())` everywhere; Phase 4 already used the helper but design-rule text was stale |

**Sign-off:** ☐ confirmed — no `auth.jwt() ->> 'role'` references remain.

---

## Two explicit owner decisions (record below in writing)

### Decision 1 — `fuel_prices_live` + `fuel_stations`

QLD public reference data (5,190 prices, 1,886 stations). No `user_id` or `site_id`.

- **Option A — any-authenticated read** (DEFAULT shipped in the migration).
  Rationale: operators/staff currently see live competitor prices in the UI.
  Risk: an anyone-with-anon-key client cannot read (RLS still on; policy
  requires `auth.uid() IS NOT NULL`).
- **Option B — owner-only read.**
  Rationale: tighter posture; but breaks current operator UX unless the API
  proxies the data via service-role.

**Owner decision:** ☐ A   ☐ B   (sign here: _____________________)

### Decision 2 — `fuel_grades`

Global lookup, 7 rows.

- Current P2b policy: any-authenticated read, owner-only write. The
  revised migration **replaces this with the same intent** under unified
  policy names (`fuel_grades_select_authed`, `fuel_grades_owner_insert`, etc.)
  to keep naming consistent.

**Owner decision:** ☐ keep current intent (default)   ☐ change (specify: ________)

---

## Generated deliverables — files for re-review

| File | LOC | Purpose |
|---|---:|---|
| `memory/upcoming_prompts/SEC1_rls_hardening.md` | ~180 | Revised spec (this re-review applies to it). |
| `lib/supabase-sec1-helpers.sql` | ~130 | Phase 1 — drop legacy helpers; create the 4 new TEXT-typed helpers. |
| `lib/supabase-sec1-rls-hardening-migration.sql` | ~470 | Phases A–5 — drop legacy policies, enable RLS on 28 tables, create per-cmd policies. |
| `lib/supabase-sec1-rls-hardening-rollback.sql` | ~150 | Reverse-order DROP POLICY + DISABLE RLS + drop helpers. |
| `scripts/verify-sec1-rls.js` | ~200 | Read-only verifier: anon + role JWTs + service-role; asserts isolation. |
| `memory/SEC1_runbook.md` | ~190 | Phase 0 inventory queries; per-table rollback templates; incident classification. |
| `scripts/introspect-sec1-schema.js` | ~90 | Schema sampler used to verify FK ambiguities (kept as repro artefact). |
| `scripts/introspect-sec1-deep.js` | ~110 | Deep probes for `audit_log`, `user_invites`, `sites`, `fuel_*`, etc. |

---

## Final re-review sign-off

- ☐ All four Blocker fixes confirmed above.
- ☐ Two explicit owner decisions recorded.
- ☐ Spec wording reviewed end-to-end.
- ☐ All five generated SQL/script files reviewed.

When all four boxes are ticked, execution moves to the Phase 0 capture in
`memory/SEC1_runbook.md`. **No SQL has been executed yet** and none will be
until you sign off on this page and verify the PITR backup.
