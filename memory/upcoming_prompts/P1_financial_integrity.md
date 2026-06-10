PRIORITY 1 — Make the numbers provably correct (financial integrity)

This is the prerequisite for everything else: margin and reconciliation are worthless on numbers
that don't add up. Today total_revenue, total_sales, fuel_sales, shop_sales, total_litres are all
FREE-ENTRY fields on the shift report (see the allow-list in lib/api/handlers/reports.js) with NO
enforced relationship — which is why the executive figures don't reconcile (e.g. fuel_sales >
total_revenue on a site).

STEP 1 — Investigate + report (don't assume the business rules)
  - Document how each financial field is captured (fixed fields + dynamic site_field_configs) and
    how each dashboard/export aggregates them (dashboard.js, executive-dashboard.js, timeseries.js,
    the PDF export, reports-pivot).
  - Identify every place the SAME concept is computed differently (this is the bug source).
  - Produce a short findings report and a PROPOSED canonical financial model, e.g.:
        total_sales (revenue) = fuel_sales + shop_sales + other_income
        banking = cash + eftpos + motorpass + accounts (a separate reconciliation, not revenue)
        gross_fuel = fuel_sales (later: margin layer in Priority 3)
    DO NOT finalise until the owner confirms the definitions — present them for sign-off first.

STEP 2 — One source of truth
  - Put the agreed formulas in a single module (lib/financials.js) with pure functions
    (computeTotals(report)) used EVERYWHERE — entry, dashboards, explorer, PDF. No endpoint
    recomputes totals its own way.

STEP 3 — Enforce at entry
  - On shift submit/edit, validate that components reconcile to totals within a small tolerance.
    If they don't, FLAG the report (store reconciles=false + a reason) and surface a clear warning
    to the submitter/operator. Decide with the owner whether to hard-block or warn-and-flag
    (default: warn + flag so legitimate edge cases aren't blocked, but nothing silently wrong).

STEP 4 — Consistent aggregation + fix the live bug
  - Make every dashboard/export read from lib/financials.js so the same inputs always yield the
    same totals. Fix the specific defect where fuel_sales can exceed total_revenue (field
    mislabel / wrong column summed / per-site config mismatch).

STEP 5 — Exceptions report + data hygiene
  - Add an owner-facing "Data integrity" view (or section) listing reports where totals don't
    reconcile, so bad data is visible and fixable.
  - Flag/clean existing demo/seed rows that don't reconcile so demos don't show impossible numbers.

STEP 6 — Tests
  - Tests asserting: components reconcile to totals; the SAME totals appear on dashboard,
    executive, explorer, and PDF for the same range; the prior fuel>revenue case is impossible now.

VERIFY
  - `yarn build` succeeds; re-run saas_readiness_test.py → 🟢.
  - Pick one site+range and show identical revenue/fuel/shop/volume across dashboard, executive,
    explorer Table, and the exported PDF/Excel. Paste the comparison.
  - List files changed and the canonical formulas you implemented (after owner sign-off).
