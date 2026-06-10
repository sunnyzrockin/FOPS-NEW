PRIORITY 3 — Accounting + POS integration (kill double data entry)

The barrier to a serious operator adopting FOPS is re-keying numbers that already live in their
POS and accounting system. Close that. This is an Enterprise-tier feature. Do it in two phases.

PHASE A — Accounting export to Xero (start simple, then OAuth)
  A1 (ship first): Xero-compatible CSV export of period sales + banking, so an owner can import
     into Xero without re-typing. Filename FOPS_Xero_<from>_to_<to>.csv. Map FOPS totals (from the
     Priority-1 canonical lib/financials.js) to Xero's expected columns (date, account, amount,
     description, tax). Confirm column format against Xero's "Sales"/manual-journal import template.
  A2 (then): direct Xero push via OAuth2.
     - Per-owner Xero connection (store encrypted tokens + xero_tenant_id, scoped to the owner).
     - Push a daily/period SALES summary + BANKING as a Xero manual journal or bank transaction via
       the Xero Accounting API. Idempotent (don't double-post the same period).
     - "Connect to Xero" + "Sync" actions on the owner billing/integrations page.

PHASE B — POS import (stop staff re-keying sales)
  B1 (ship first): generic CSV importer. Owner/operator uploads a POS daily-sales CSV; a column
     mapper maps POS columns → FOPS shift-report fields (fuel_sales, shop_sales, litres-by-grade,
     etc.). Validate against the Priority-1 reconciliation before saving. Preview before commit.
  B2 (then): inbound webhook /api/integrations/pos/webhook (secret-gated per tenant) so a POS can
     PUSH end-of-day sales automatically. Vendor-specific adapters are future per-customer work —
     just provide the documented generic endpoint + payload schema now.

CROSS-CUTTING
  - Security: encrypt OAuth tokens at rest; verify webhook secrets; scope everything to the tenant
    (site.owner_id). The webhook is unauthenticated-by-design but secret-verified (middleware already
    skips /api). No tenant can import/export another tenant's data.
  - Everything routes through lib/financials.js so imported data obeys the same reconciliation rules.
  - Gating: Enterprise tier.

CONSTRAINTS
  - Build AFTER Priority 1 (so imports/exports use the canonical financial model).
  - Additive: new integration handlers/routes/UI; don't change core report/dashboard logic.
  - Phase A1 + B1 (CSV both ways) deliver 80% of the value with low risk — ship those first, then
    the OAuth/webhook automation.

VERIFY
  - `yarn build` succeeds; re-run saas_readiness_test.py → 🟢.
  - A1: exported CSV imports cleanly into a Xero test org; totals match the FOPS dashboard.
  - B1: a sample POS CSV imports, maps correctly, reconciles, and creates the right shift data;
    bad/mismatched rows are rejected with clear errors (no silent wrong data).
  - OAuth tokens stored encrypted; webhook rejects bad secret; no cross-tenant access.
  - List files changed and env vars to set (XERO_CLIENT_ID/SECRET, POS_WEBHOOK_SECRET, etc.).
