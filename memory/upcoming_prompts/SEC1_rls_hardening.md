# SEC1 — Pre-production security hardening: re-enable RLS schema-wide

> **Status**: BACKLOG (tracked, not started)
> **Priority**: P0 — must complete before public production launch (i.e.
> before opening signups to operators who are NOT pilot customers).
> **Owner**: TBD
> **Created**: 2026-06-15
> **Trigger**: User decision on Wet-stock Tier 1 — chose Option A (RLS off)
> to match the rest of the schema for the demo. This task is the
> follow-through that closes that gap properly, schema-wide.

---

## Why this exists

During pilot rollout `lib/supabase-disable-rls-emergency.sql` disabled
RLS across every business table because the original site-scoped
policies caused infinite recursion (policies on `shift_reports` queried
`operator_site_assignments`, whose own policy queried `sites`, whose own
policy queried `shift_reports`, etc.).

The app has since been running with **application-level filtering only**
via `supabaseAdmin` (service-role key) + `resolveAccessibleSiteIds()` in
the API handlers. That has been adequate for the pilot but it has two
significant gaps for general availability:

1. **Anon-key bypass risk.** Any client that obtains the `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   can call PostgREST directly and read every site’s fuel data, because
   nothing in the database stops them — only the Next.js handlers do.
2. **Partial RLS is worse than none.** Enabling RLS on two new tables
   (tanks + tank_reconciliation) while the other ten remain open is
   security theatre — the leak is whichever lock is weakest.

Fix: re-enable RLS **once, across the whole business schema, with
policies that cannot recurse**.

---

## Scope (must cover ALL of these)

| Table | Current RLS | Notes |
|---|---|---|
| `users` | enabled (keep) | Already locked down; do not regress. |
| `sites` | **disabled** | Owner can CRUD own sites; operator/staff read-only via assignment. |
| `operator_site_assignments` | **disabled** | Owner CRUDs for their sites; operator reads own row only. |
| `staff_site_assignments` | **disabled** | Owner/operator CRUDs for their sites; staff reads own row only. |
| `shift_reports` | **disabled** | Read scoped by site; write by submitter or operator/owner of site. |
| `shift_formula_results` | **disabled** | Read scoped via parent `shift_reports.site_id`. |
| `site_field_configs` | **disabled** | Read by anyone with site access; write owner/operator only. |
| `site_banking_formulas` | **disabled** | Same as field configs. |
| `fuel_price_entries` | **disabled** | Same scoping rules. |
| `site_competitors` | **disabled** | Same. |
| `competitor_fuel_prices` | **disabled** | Read scoped via `site_competitors.site_id`. |
| `tanks` (NEW) | **disabled** | Use as the *reference template* — it has the simplest shape. |
| `tank_reconciliation` (NEW) | **disabled** | Read operator/owner only per product spec. |
| any future business tables | — | Same pattern from day one. |

*(Run `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace =
'public'::regnamespace ORDER BY 1;` before starting to confirm the current
state hasn’t drifted.)*

---

## Solving the recursion problem

The original recursion was caused by **mutual policy dependencies**:

```
shift_reports policy  →  reads operator_site_assignments
operator_site_assignments policy  →  reads sites
sites policy  →  reads operator_site_assignments  (CYCLE)
```

Mandatory design rules to prevent recurrence:

1. **Use `SECURITY DEFINER` helper functions, not subqueries inside
   policies.** Define ONCE:
   ```sql
   CREATE OR REPLACE FUNCTION public.user_site_ids(uid UUID)
   RETURNS SETOF UUID
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     SELECT id FROM sites WHERE owner_id = uid
     UNION
     SELECT site_id FROM operator_site_assignments WHERE operator_user_id = uid
     UNION
     SELECT site_id FROM staff_site_assignments WHERE staff_user_id = uid;
   $$;
   ```
   `SECURITY DEFINER` makes the function bypass RLS internally, so it can
   query the underlying tables without triggering their policies. The
   recursion stops the moment policies stop calling each other.

2. **Policies on every business table reduce to a single predicate:**
   ```sql
   USING (site_id IN (SELECT public.user_site_ids(auth.uid())))
   ```
   No table’s policy may reference another business table directly.

3. **Assignment tables are the leaves.** `operator_site_assignments` and
   `staff_site_assignments` policies must read ONLY their own row by
   `auth.uid()` — never join back to `sites` or `shift_reports`.

4. **Service-role bypass is intentional.** The Next.js API will continue
   to use `supabaseAdmin` for trusted server operations; the new RLS is
   defence-in-depth for any PostgREST access that uses the anon or
   authenticated JWTs.

5. **Role differentiation** (read vs write, owner vs operator vs staff)
   uses separate `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies referencing
   `auth.jwt() ->> 'role'` (already populated by the existing auth flow).

---

## Deliverables

1. `lib/supabase-sec1-rls-hardening-migration.sql` — ONE coordinated
   migration that:
   - creates the `user_site_ids()` SECURITY DEFINER helper
   - enables RLS on every table in the Scope list above
   - creates per-operation policies on each table
   - drops any leftover permissive `"Allow all for development"` policies
     from the fuel_price_* tables
   - includes a verification block: pg_policies count per table, sample
     queries as anon / authenticated / service_role.
2. `lib/supabase-sec1-rls-hardening-rollback.sql` — emergency rollback
   that re-disables RLS in the same order. Tested before shipping.
3. Integration smoke tests:
   - Owner logged in: can see/write own sites, cannot see other owners’.
   - Operator: can see/write assigned sites only.
   - Staff: can read assigned sites, can submit reports, cannot read other
     staff’s submissions or any operator/owner-only fields (cross-check
     against the existing `roleCanSeeField()` enforcement).
   - Anon key (no JWT): cannot read anything except `users` view (signup
     name lookups, if used).
4. Backend test pass (45/45) after migration applied to a staging clone.
5. Update `lib/supabase-disable-rls-emergency.sql` with a deprecation
   header pointing to this migration.

---

## Reference template

`tanks` is the simplest table in the scope (no joins back to shift
reports). Use its policy block as the boilerplate everywhere:

```sql
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tanks_select
  ON public.tanks FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY tanks_write
  ON public.tanks FOR ALL
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())))
  WITH CHECK (site_id IN (SELECT public.user_site_ids(auth.uid())));
```

For `tank_reconciliation` (operator/owner only per product spec) add a
role-based clause that also reads from `auth.jwt() ->> 'role'`.

---

## Acceptance criteria

- [ ] `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace =
      'public'::regnamespace AND relkind = 'r'` shows `rls_enabled = true`
      for every business table.
- [ ] No policy on any business table references another business table
      directly (only `user_site_ids()` and `auth.*`).
- [ ] All 45 backend tests still pass.
- [ ] Anon-key smoke test cannot read or write any business table.
- [ ] Service-role API behaves identically to today (no regressions in
      Owner/Operator/Staff dashboards).
- [ ] `lib/supabase-disable-rls-emergency.sql` deprecated with a header
      pointing here.

---

## Out of scope

- The `users` table (already correctly locked down).
- Cron / webhook tables that are service-role-only by design — they may
  remain RLS-off as long as no JWT path can ever reach them.
- New tenant-isolation features (multi-org, etc.) — those are a follow-up.

---

## Per-table execution plan (added 2026-06-20)

Migrations land in **5 phases**. Each phase has its own rollback. Stop
between phases. The first 4 are reversible by a single `ALTER TABLE …
DISABLE ROW LEVEL SECURITY;` — keep that escape hatch ready.

### Phase 0 — Pre-flight (no code change, ~10 min)

1. Capture the current state:
   ```sql
   SELECT relname, relrowsecurity FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND relkind = 'r'
   ORDER BY 1;
   ```
2. Confirm pg_policies inventory is empty for the business tables:
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';
   ```
3. Snapshot prod backend test pass rate (target ≥ 45/45 passing).
4. Take a Supabase point-in-time backup. Tag it `pre-sec1-<date>`.

### Phase 1 — Helper functions only (no RLS toggled yet)

Apply `lib/supabase-sec1-helpers.sql`:
```sql
-- 1. The recursion-killer: SECURITY DEFINER fan-in over the three
--    site-access tables. Read-only, STABLE, indexed paths only.
CREATE OR REPLACE FUNCTION public.user_site_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM sites WHERE owner_id = uid
  UNION
  SELECT site_id FROM operator_site_assignments WHERE operator_user_id = uid
  UNION
  SELECT site_id FROM staff_site_assignments WHERE staff_user_id = uid;
$$;

-- 2. Role-of-current-user helper (avoids reading users in every policy).
CREATE OR REPLACE FUNCTION public.user_role(uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM users WHERE id = uid;
$$;

-- 3. Owner-of-site helper.
CREATE OR REPLACE FUNCTION public.user_is_owner_of(uid UUID, sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM sites WHERE id = sid AND owner_id = uid);
$$;
```
Smoke test: call each as service-role, anon (should be allowed — they're
DEFINER), authenticated (allowed). Cost: < 1ms per call.

**Rollback:** `DROP FUNCTION user_site_ids, user_role, user_is_owner_of;`

### Phase 2 — Leaf tables (assignment tables FIRST — they cannot recurse)

Order matters: enable RLS on the assignment tables BEFORE the parents so
that, in the rare window where a policy references them, the predicate
already evaluates correctly.

| # | Table | Pattern |
|---|---|---|
| 2.1 | `operator_site_assignments` | own-row only |
| 2.2 | `staff_site_assignments` | own-row only |

Template (assignment-table):
```sql
ALTER TABLE public.operator_site_assignments ENABLE ROW LEVEL SECURITY;

-- Operators read only THEIR OWN assignment rows.
CREATE POLICY operator_assignments_select_own
  ON public.operator_site_assignments FOR SELECT
  USING (operator_user_id = auth.uid());

-- Owners write/delete assignments on sites they own.
CREATE POLICY operator_assignments_owner_write
  ON public.operator_site_assignments FOR ALL
  USING (public.user_is_owner_of(auth.uid(), site_id))
  WITH CHECK (public.user_is_owner_of(auth.uid(), site_id));
```

**Per-phase rollback:**
```sql
ALTER TABLE public.operator_site_assignments DISABLE ROW LEVEL SECURITY;
DROP POLICY operator_assignments_select_own ON public.operator_site_assignments;
DROP POLICY operator_assignments_owner_write ON public.operator_site_assignments;
-- repeat for staff_site_assignments
```

**Acceptance per table:**
- Operator JWT: `SELECT * FROM operator_site_assignments` returns only own rows.
- Other operator JWT: zero rows visible.
- Service-role: all rows visible (untouched).
- Anon JWT: zero rows.

### Phase 3 — Sites (the canonical parent)

```sql
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY sites_select_member
  ON public.sites FOR SELECT
  USING (id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY sites_owner_write
  ON public.sites FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

**Rollback:** `DISABLE ROW LEVEL SECURITY` + `DROP POLICY` x2.

**Acceptance:** Owner sees own sites only. Operator sees sites in their
assignments. Staff sees sites in their assignments. Anon sees nothing.

### Phase 4 — Business data tables (the bulk of the migration)

Order alphabetically — they're all leaves now (no policy references
another business table):

| Table | Read | Write |
|---|---|---|
| `competitor_fuel_prices` | site-member | owner/operator |
| `daily_site_rollups` | site-member | service-only |
| `dip_readings` | site-member | site-member (staff write own) |
| `fuel_price_entries` | site-member | owner/operator |
| `shift_formula_results` | via parent `shift_reports.site_id` | service-only |
| `shift_reports` | site-member | submitter or owner/operator |
| `site_banking_formulas` | site-member | owner/operator |
| `site_competitors` | site-member | owner/operator |
| `site_field_configs` | site-member | owner/operator |
| `tanks` | site-member | owner/operator |
| `tank_reconciliation` | owner/operator only | owner/operator |

Template (most tables):
```sql
ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY shift_reports_select_member
  ON public.shift_reports FOR SELECT
  USING (site_id IN (SELECT public.user_site_ids(auth.uid())));

CREATE POLICY shift_reports_insert_submitter
  ON public.shift_reports FOR INSERT
  WITH CHECK (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND submitted_by_user_id = auth.uid()
  );

CREATE POLICY shift_reports_update_owner_op
  ON public.shift_reports FOR UPDATE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) IN ('owner', 'operator')
  );

CREATE POLICY shift_reports_delete_owner
  ON public.shift_reports FOR DELETE
  USING (
    site_id IN (SELECT public.user_site_ids(auth.uid()))
    AND public.user_role(auth.uid()) = 'owner'
  );

-- Drop the leftover dev policy
DROP POLICY IF EXISTS "Allow all for development" ON public.shift_reports;
```

For `shift_formula_results` (joined to parent):
```sql
ALTER TABLE public.shift_formula_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_formula_results_select_member
  ON public.shift_formula_results FOR SELECT
  USING (
    shift_report_id IN (
      SELECT id FROM public.shift_reports
      WHERE site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
  );
-- No write policy → service-role-only, intentional.
```

For `tank_reconciliation` (owner/operator only):
```sql
ALTER TABLE public.tank_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY tank_reconciliation_owner_op_select
  ON public.tank_reconciliation FOR SELECT
  USING (
    tank_id IN (
      SELECT id FROM public.tanks
      WHERE site_id IN (SELECT public.user_site_ids(auth.uid()))
    )
    AND public.user_role(auth.uid()) IN ('owner', 'operator')
  );
```

**Roll forward in 11 separate `ALTER TABLE` statements + ~30 `CREATE
POLICY` blocks** so each table can be tested independently. Don't batch.

**Rollback:** per-table `DISABLE ROW LEVEL SECURITY` + `DROP POLICY` for
every policy created. Should match the order in reverse.

### Phase 5 — Cleanup + verification

- Re-run backend test suite (target 45/45 PASS).
- Anon-key smoke test: `select count(*) from shift_reports;` via the
  Supabase REST API with only the anon key → 0 rows (or 403, depending on
  policy stack).
- Service-role smoke test: same query via service key → expected count.
- Owner / operator / staff JWT smoke tests via /api/sites and
  /api/reports → identical responses to pre-migration.
- Stamp `lib/supabase-disable-rls-emergency.sql` with a
  `DEPRECATED — see lib/supabase-sec1-rls-hardening-migration.sql`
  header.
- Open a P0 PagerDuty incident template: "if a customer reports a
  permission error post-RLS, run the rollback for that one table; do
  NOT bring down the schema."

### Files to deliver (no SQL executed yet — spec phase)

- `lib/supabase-sec1-helpers.sql` (Phase 1)
- `lib/supabase-sec1-rls-hardening-migration.sql` (Phases 2–5,
  concatenated for the final apply)
- `lib/supabase-sec1-rls-hardening-rollback.sql` (per-phase rollbacks
  in reverse order)
- `scripts/verify-sec1-rls.js` — read-only verifier that connects with
  each of (anon, authenticated owner/operator/staff, service-role) and
  asserts the expected row counts on a representative table per phase.
- `memory/SEC1_runbook.md` — short ops doc on how to roll back a
  single table during an incident.

### Execution gate

Do NOT begin Phase 2 until:
- the owner has signed off this plan in writing
- the backend test pass rate baseline is captured (target 45/45)
- the Supabase backup tagged `pre-sec1-<date>` is verified restorable
- a staging clone exists where Phases 1–5 have been rehearsed at least
  once (and the rollback proven)


