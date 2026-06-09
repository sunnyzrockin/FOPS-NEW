-- ============================================================
-- FOPS — Scaling Sprint Index Migration (Section 2)
-- ============================================================
--
-- Applied:   pending (run this once in Supabase SQL Editor)
-- Author:    main agent, 2026-06-09
-- Safety:    100% additive. Every statement uses IF NOT EXISTS;
--            no DROP, no ALTER, no data movement. Safe to rerun.
--
-- Why these indexes:
--   1. shift_reports — composite (site_id, date) is the SINGLE hottest
--      filter pair across every dashboard endpoint. It already exists
--      via idx_shift_reports_site_date — included here as IF NOT EXISTS
--      so a fresh DB also gets it. Adding (site_id, date, status) for
--      the pending/reviewed split on the daily-rollups handler.
--
--   2. notifications — the bell polls this table every 30s per active
--      user. List query is `WHERE user_id=? ORDER BY created_at DESC
--      LIMIT 50` and the unreadCount probe is `WHERE user_id=? AND
--      read_at IS NULL`. Add a composite covering both shapes.
--
--   3. operator_site_assignments + staff_site_assignments — getAllowedSiteIds
--      runs on EVERY authenticated API call. Indexes on the lookup
--      column already exist in the original schema; included here as
--      idempotent guards for new envs.
--
--   4. sites.owner_id — owner allowed-set lookup hits this column on
--      every owner-scoped request.
--
--   5. fuel_prices_live (site_id, fuel_type) — live price comparison
--      reads this table per (site, grade) pair.
-- ============================================================

-- 1. shift_reports — the dashboard hot path
CREATE INDEX IF NOT EXISTS idx_shift_reports_site_date
  ON public.shift_reports (site_id, date);

CREATE INDEX IF NOT EXISTS idx_shift_reports_site_date_status
  ON public.shift_reports (site_id, date, status);

CREATE INDEX IF NOT EXISTS idx_shift_reports_status
  ON public.shift_reports (status);

CREATE INDEX IF NOT EXISTS idx_shift_reports_submitted_by
  ON public.shift_reports (submitted_by_user_id);

-- 2. notifications — bell poll hot path
-- (Composite covers both list-by-user and unreadCount-by-user queries.)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- 3. site-assignment lookups — getAllowedSiteIds runs on every API call
CREATE INDEX IF NOT EXISTS idx_operator_assignments_operator
  ON public.operator_site_assignments (operator_user_id);

CREATE INDEX IF NOT EXISTS idx_operator_assignments_site
  ON public.operator_site_assignments (site_id);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff
  ON public.staff_site_assignments (staff_user_id);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_site
  ON public.staff_site_assignments (site_id);

-- 4. sites.owner_id — owner allowed-set lookup
CREATE INDEX IF NOT EXISTS idx_sites_owner_id
  ON public.sites (owner_id);

-- 5. fuel_prices_live — per-(site, grade) lookups
CREATE INDEX IF NOT EXISTS idx_fuel_prices_live_site_fuel
  ON public.fuel_prices_live (station_id, fuel_type);

-- 6. user_invites — invite list scoping by inviter
CREATE INDEX IF NOT EXISTS idx_user_invites_invited_by
  ON public.user_invites (invited_by_user_id);

-- ============================================================
-- Verification: list the indexes that now exist on each hot table.
-- (Read-only — safe to run anytime.)
-- ============================================================
-- SELECT tablename, indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'shift_reports', 'notifications', 'sites',
--     'operator_site_assignments', 'staff_site_assignments',
--     'fuel_prices_live', 'user_invites'
--   )
-- ORDER BY tablename, indexname;
