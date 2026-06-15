'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Calculator, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';
import { resolveFieldValue, bankingSalesFields, roleCanSeeBanking } from '@/lib/field-resolver';

/**
 * ReportDetail — Full-detail card for a single shift report shown to the
 * operator/owner when reviewing.
 *
 * BUG 1 fix: the Raw Field Values grid is driven ENTIRELY by the
 *   /api/field-configs?siteId=… payload, filtered to
 *   `category === 'sales' && show_in_banking === true` and rendered in
 *   the returned order. NO hardcoded field list anywhere — if a site has
 *   no banking-visible sales config we show an explicit empty state.
 *
 * BUG 1b fix: the Banking Total card reads the SUM of
 *   `formula_results[*].result_value` (i.e. `shift_formula_results`) so
 *   the number matches the per-row banking total elsewhere in the app.
 *   Legacy `banking_value` is only used as a final fallback for very old
 *   reports that predate the formula engine.
 *
 * Values for each rendered field are read in this order:
 *   1. flat column on the report (e.g. `report.total_sales`)
 *   2. `report.custom_values[key]` (operator-defined fields)
 *   3. 0
 */
export default function ReportDetail({ report, onClose, onStatusChange, canChangeStatus, user }) {
  const [configs, setConfigs] = useState(null);     // null = loading; [] = no fields
  const [configError, setConfigError] = useState(null);

  // Load site_field_configs for THIS report's site. Driven by API only —
  // no hardcoded fallback list.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!report?.site_id) { setConfigs([]); return; }
      try {
        const res = await authedFetch(`/api/field-configs?siteId=${report.site_id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data?.fields || data?.data || []);
        if (!cancelled) setConfigs(rows);
      } catch (e) {
        if (!cancelled) { setConfigError(e?.message || 'fetch failed'); setConfigs([]); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [report?.site_id]);

  if (!report) return null;

  // Compute the canonical banking total: sum of stored formula results.
  // Falls back to legacy banking_value/total_revenue ONLY for pre-formula
  // reports that have no formula_results array attached.
  const formulaResults = Array.isArray(report.formula_results) ? report.formula_results : [];
  const formulaTotal = formulaResults.reduce(
    (acc, fr) => acc + Number(fr?.result_value || 0),
    0,
  );
  const hasFormulaTotal = formulaResults.length > 0;
  const bankingTotal = hasFormulaTotal
    ? formulaTotal
    : (report.formula_total ?? report.banking_value ?? 0);

  // Resolve a field's display value: tries the config key plus known
  // aliases against flat columns first, then custom_values. Centralised
  // in lib/field-resolver.js so dashboards, operator panel, and detail
  // view all agree.
  const resolveValue = (key) => resolveFieldValue(report, key);

  // Role-aware visibility gates. The viewer's role drives BOTH:
  //   (a) section-level: should the Banking Total card + Formula
  //       Results audit trail be rendered at all? Reconciliation
  //       surfaces are restricted to operator/owner.
  //   (b) field-level: which configured fields appear in the Raw
  //       Field Values grid (e.g. visibility:'owner_only' must hide
  //       for staff).
  const viewerRole = user?.role;
  const showBankingSection = roleCanSeeBanking(viewerRole);

  // BUG 1: dynamic Raw Field Values — no hardcoded list, no fallback list.
  // Filter to sales + show_in_banking + role-visibility, in display_order.
  const bankingFields = configs === null ? null : bankingSalesFields(configs, viewerRole);

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-4 bg-teal-50/60 rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{report.site_name}</CardTitle>
            <CardDescription>{report.site_code}</CardDescription>
          </div>
          <Badge
            variant={report.status === 'reviewed' ? 'default' : 'secondary'}
            className={`text-sm ${report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
          >
            {report.status === 'reviewed'
              ? <CheckCircle className="h-3 w-3 mr-1" />
              : <Clock className="h-3 w-3 mr-1" />}
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium">{formatDate(report.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shift</p>
            <p className="font-medium">{report.shift_type}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted By</p>
            <p className="font-medium">{report.staff_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted At</p>
            <p className="font-medium">{formatDateTime(report.submitted_at)}</p>
          </div>
        </div>

        {/* BUG 1b: Banking Total now reads the sum of shift_formula_results,
            making it consistent with the Banking Submissions list, the
            operator review panel, and the daily-rollup totals.
            ACCESS CONTROL: reconciliation surfaces (Banking Total +
            Formula Results audit trail) are hidden from staff and only
            shown to operator/owner. */}
        {showBankingSection && (
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-700 mb-1 uppercase tracking-wider font-medium">Banking Total</p>
              <p className="text-3xl font-bold text-emerald-900">{formatCurrency(bankingTotal)}</p>
              <p className="text-[11px] text-emerald-700/70 mt-1">
                {hasFormulaTotal
                  ? `sum of ${formulaResults.length} formula${formulaResults.length === 1 ? '' : 's'}`
                  : 'no formula results — showing legacy banking value'}
              </p>
            </div>
            <Calculator className="h-8 w-8 text-emerald-600/40" />
          </div>
        )}

        {/* Per-formula audit trail — surfaces every shift_formula_results row.
            Same access control as the Banking Total card above. */}
        {showBankingSection && hasFormulaTotal && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-teal-600" />
              Formula Results
              <Badge variant="outline" className="text-xs">audit trail</Badge>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {formulaResults.map((fr) => (
                <div key={fr.id} className="bg-white border border-teal-200 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{fr.formula_name}</p>
                  <p className="text-xl font-bold text-teal-700">{formatCurrency(fr.result_value)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    calc {formatDateTime(fr.calculated_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BUG 1: Raw Field Values — driven entirely by /api/field-configs.
            No hardcoded fallback list; show an empty state if the site has
            no banking-visible sales fields configured. */}
        <div>
          <h4 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Raw Field Values</h4>
          {configs === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading configured fields…
            </div>
          ) : configError ? (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md py-2 px-3">
              Couldn’t load field configuration: {configError}
            </div>
          ) : bankingFields === null || bankingFields.length === 0 ? (
            <div className="text-xs text-muted-foreground bg-white border border-dashed rounded-md py-3 px-3">
              This site has no banking-visible sales fields configured. Add them under{' '}
              <span className="font-medium">Operator → Form Fields</span> and tick
              <span className="font-medium"> &ldquo;Show in banking&rdquo;</span>.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {bankingFields.map((f) => (
                <div key={f.id ?? f.key} className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="font-semibold">{formatCurrency(resolveValue(f.key))}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {report.notes && (
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{report.notes}</p>
          </div>
        )}

        {report.status === 'reviewed' && report.reviewed_by_name && (
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-xs text-green-700 mb-1">Reviewed By</p>
            <p className="font-medium text-green-800">{report.reviewed_by_name}</p>
            <p className="text-xs text-green-600">{formatDateTime(report.reviewed_at)}</p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
          {canChangeStatus && report.status === 'pending' && (
            <Button
              onClick={() => onStatusChange(report.id, 'reviewed', user.id)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Mark as Reviewed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
