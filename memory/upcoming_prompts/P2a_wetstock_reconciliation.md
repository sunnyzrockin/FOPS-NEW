PRIORITY 2a — Wet-stock reconciliation (the #1 fuel-money feature: loss detection)

Tell each owner/operator whether a site is LOSING FUEL (leak, theft, meter drift) by reconciling
tank movement against metered pump sales. Most of the data already exists — wire it together.

WHAT EXISTS (reuse, don't rebuild)
  - dip_readings already stores per-grade tank LEVELS and DELIVERIES: columns like
    `{grade}_litres` and `deliveries_{grade}_litres`, plus a custom_values JSON for extra tanks
    ({level, delivery}). The dips handler already computes tank movement
    (opening_level − closing_level + deliveries) per grade — see lib/api/handlers/dips.js.
  - Shift reports capture litres sold (total_litres, and volume-by-grade via custom_values).

THE RECONCILIATION (per site, per grade, per period)
    book_movement   = opening_dip − closing_dip + deliveries        (litres that left the tank)
    metered_sales   = pump litres sold for that grade over the period (from shift_reports)
    variance_litres = metered_sales − book_movement
    variance_pct    = variance_litres / throughput (use metered_sales as denominator)
  A small variance is normal (temperature, calibration). Flag when |variance_pct| exceeds a
  configurable tolerance (default ±0.5%), and especially flag PERSISTENT negative variance
  (ongoing loss) per site/grade.

BUILD
  1. Ensure per-grade litres SOLD are available for the period. If volume-by-grade only lives in
     custom_values, normalise it so reconciliation can read litres sold per grade reliably. Note
     any gap where a site doesn't record per-grade pump sales (recon can't run there — surface that).
  2. New handler lib/api/handlers/wetstock.js + route /api/wetstock/reconciliation:
     params site(s) + date range; returns per (site, grade): opening, closing, deliveries,
     book_movement, metered_sales, variance_litres, variance_pct, status (ok | watch | alert).
     Auth + getAllowedSiteIds scoping (operators only their sites).
  3. UI: a "Wet Stock" / "Stock Reconciliation" page (owner: all sites; operator: their sites):
     per-tank variance table, colour-coded status, a period selector, and an alerts strip listing
     sites/grades losing fuel beyond tolerance. Add the variance as an Analytics Explorer metric too.
  4. Alerts: surface persistent-loss sites in the dashboard health strip / notifications
     (reuse the Section E notify helper) so an owner is told "Site X is down 1.2% on ULP this week."

GATING: Growth+ / Enterprise (premium fuel feature).

CONSTRAINTS
  - Additive: new handler/route/page + reads of existing dip/sales data. Don't change dip entry
    logic or break existing dips views.
  - Make the tolerance configurable (per site or global default).

VERIFY
  - `yarn build` succeeds; re-run saas_readiness_test.py → 🟢 (operator only sees own sites' recon).
  - For a site with opening/closing dips + deliveries + pump sales, the variance math is correct and
    hand-checkable; a deliberately mismatched test site shows an 'alert' status.
  - Sites missing per-grade pump sales are clearly marked "can't reconcile" rather than showing 0.
  - List files changed.
