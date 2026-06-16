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
