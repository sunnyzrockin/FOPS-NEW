PRIORITY 2b — Fuel margin per litre (where the owner's money actually is)

Show cents-per-litre margin and gross fuel profit per site/grade. Today you have SELL prices
(fuel_price_entries) and delivery LITRES, but never delivery COST — so margin can't be computed.
This adds cost capture, then the margin engine.

ADD COST CAPTURE
  - New table `fuel_deliveries` (source of truth for fuel bought IN, with cost):
        fuel_deliveries(
          id, site_id, grade text, delivered_at date,
          litres numeric, total_cost numeric, unit_cost_cpl numeric,  -- cents/L
          supplier text, invoice_ref text, created_by text, created_at timestamptz
        )
    RLS: scope to the site's tenant. Operator can record deliveries for their own sites.
  - A simple "Record fuel delivery" form (operator): grade, litres, cost (total or cpl), supplier.
  - Reconcile with the existing dip `deliveries_{grade}_litres` so stock and cost agree (flag if a
    dip shows a delivery with no matching cost record, so margin isn't silently incomplete).

MARGIN ENGINE (per site, per grade, per period)
    cost_cpl    = moving/weighted-average cost per litre from fuel_deliveries
    sell_cpl    = sell price from fuel_price_entries (the operator's own price), time-weighted
    margin_cpl  = sell_cpl − cost_cpl
    gross_fuel_profit = margin_cpl × litres_sold(grade, period)
  Use a defensible cost basis (document whether moving-average or FIFO; moving-average is simplest
  and fine for v1).

BUILD
  - Handler lib/api/handlers/margin.js + route /api/margin (auth + getAllowedSiteIds scoping).
  - UI: a Fuel Margin view — per site/grade: current margin cpl, gross fuel profit, trend over
    time; portfolio roll-up for the owner.
  - Add "Fuel margin (cpl)" and "Gross fuel profit" as METRICS in the Analytics Explorer so they
    flow through the existing chart/segment/export machinery.

GATING: Growth+ / Enterprise.

CONSTRAINTS
  - Build AFTER Priority 1 (numbers) and ideally alongside 2a (both rely on clean per-grade volume).
  - Additive tables/handlers; don't change pricing or report logic.
  - If cost data is missing for a grade/period, show "margin unavailable — record deliveries"
    rather than a misleading number.

VERIFY
  - `yarn build` succeeds; re-run saas_readiness_test.py → 🟢.
  - Enter deliveries + sell prices for a test grade → margin_cpl and gross_fuel_profit are correct
    and hand-checkable; missing-cost case shows "unavailable", not a wrong figure.
  - Operator sees margin only for their own sites.
  - List files changed.
