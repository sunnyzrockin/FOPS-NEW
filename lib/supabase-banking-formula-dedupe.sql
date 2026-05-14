-- ============================================================================
--  FOPS — Duplicate banking_formulas cleanup
-- ============================================================================
--  PURPOSE
--    The `banking_formulas` table can accumulate duplicate rows for the same
--    (site_id, name) combination because there is no UNIQUE constraint on
--    that pair historically. The staff "Live Calculations" panel renders
--    one card per formula row, so 12 dupes of "Cash Reconciliation" + 12
--    dupes of "Net Sales" turns into a 24-card mega-grid of identical $0s.
--
--    The frontend already dedupes by name in-memory (keeps the newest row
--    per name), but the dupes still cost storage, confuse operators in
--    the BankingManagement screen, and silently mask whichever rows are
--    out of date.
--
--  STRATEGY
--    Step 1 (DRY RUN) — list dupe groups with a sample of which row would
--    survive and which would be deleted.
--    Step 2 (DESTRUCTIVE) — keep the newest row per (site_id, name)
--    (`updated_at` desc, falling back to `created_at` desc, falling back
--    to `id`). Soft-delete by setting is_active=false on losers if you
--    want a safety net, OR hard-delete via DELETE.
--    Step 3 (PREVENT) — add a partial UNIQUE INDEX so dupes can never
--    re-accumulate.
--
--  HOW TO RUN
--    Supabase dashboard → SQL Editor → New query. Paste step 1 first.
--    Review. Then step 2, review counts in the NOTICE. Then step 3.
-- ============================================================================


-- =====================================================
-- STEP 1 — DRY RUN: identify duplicate groups
-- =====================================================
WITH ranked AS (
  SELECT
    id,
    site_id,
    name,
    is_active,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY site_id, LOWER(TRIM(name))
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.site_banking_formulas
)
SELECT
  site_id,
  name,
  COUNT(*)             AS total_rows_in_group,
  COUNT(*) - 1         AS rows_that_will_be_deleted,
  MAX(CASE WHEN rn = 1 THEN id END)         AS keeper_id,
  MAX(CASE WHEN rn = 1 THEN created_at END) AS keeper_created_at
FROM ranked
GROUP BY site_id, name
HAVING COUNT(*) > 1
ORDER BY total_rows_in_group DESC, name;

-- Expected: one row per duplicate group, showing how many losers will
-- be removed and which `id` (`keeper_id`) is staying. Inspect this.


-- =====================================================
-- STEP 2 — DESTRUCTIVE: delete duplicates (keep newest per group)
-- =====================================================
DO $$
DECLARE
  victim_count int;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY site_id, LOWER(TRIM(name))
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.site_banking_formulas
  ),
  victims AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  SELECT COUNT(*) INTO victim_count FROM victims;

  RAISE NOTICE 'About to delete % duplicate banking_formulas row(s).', victim_count;

  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY site_id, LOWER(TRIM(name))
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.site_banking_formulas
  )
  DELETE FROM public.site_banking_formulas
   WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  RAISE NOTICE 'Done. % duplicate(s) deleted.', victim_count;
END $$;


-- =====================================================
-- STEP 3 — PREVENT regression: add a UNIQUE INDEX
-- =====================================================
-- A partial unique index on (site_id, lower(trim(name))) where is_active
-- (or always — depends on whether you allow re-using a name for inactive
-- archived formulas). Pick ONE of the two CREATE statements below.

-- Option A (recommended) — strict: no two formulas with the same name
-- on the same site, period, regardless of is_active.
CREATE UNIQUE INDEX IF NOT EXISTS site_banking_formulas_site_name_key
  ON public.site_banking_formulas (site_id, LOWER(TRIM(name)));

-- Option B — looser: allows inactive rows to share names with new active
-- ones (useful if you "soft-delete" by toggling is_active and want to
-- create a fresh formula with the same name). Uncomment if you prefer.
-- CREATE UNIQUE INDEX IF NOT EXISTS site_banking_formulas_site_name_active_key
--   ON public.site_banking_formulas (site_id, LOWER(TRIM(name)))
--   WHERE is_active = true;


-- =====================================================
-- STEP 4 — VERIFY: no dupes remain
-- =====================================================
SELECT site_id, name, COUNT(*) AS rows
FROM public.site_banking_formulas
GROUP BY site_id, name
HAVING COUNT(*) > 1
ORDER BY rows DESC;

-- Expected: zero rows.
