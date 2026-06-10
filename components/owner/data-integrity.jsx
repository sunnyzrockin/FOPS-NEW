'use client';
/* eslint-disable react-hooks/set-state-in-effect -- data hydration in useEffect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2, AlertTriangle, CheckCircle2, ShieldCheck, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * Owner-only Data Integrity tab.
 *
 * Lists shift reports where the typed totals don't reconcile against the
 * components (fuel + shop) or where banking is off by > 1% (or per-site
 * tolerance). Powered by /api/dashboard/data-integrity which runs the same
 * canonical formulas (lib/financials.js) used by every dashboard endpoint.
 */
export default function DataIntegrityView({ sites }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const siteIds = (sites || []).map((s) => s.id).join(',');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL('/api/dashboard/data-integrity', window.location.origin);
      if (siteIds) u.searchParams.set('siteIds', siteIds);
      const res = await authedFetch(u.pathname + u.search);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      toast.error('Failed to load data integrity', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [siteIds]);

  useEffect(() => { load(); }, [load]);

  const toggleRow = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const { summary = {}, rows = [] } = data || {};
  const allGreen = summary.flagged === 0 && rows.length === 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-teal-600" />
            Data Integrity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shift reports whose components don&apos;t reconcile against the typed totals,
            or where banking is outside tolerance. Numbers below come from the same
            canonical formulas every dashboard uses.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Reports analysed</div>
            <div className="text-2xl font-semibold mt-1">{summary.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card className={summary.flagged > 0 ? 'border-amber-300 bg-amber-50/40' : ''}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Flagged
            </div>
            <div className="text-2xl font-semibold mt-1 text-amber-700">{summary.flagged ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-teal-600" /> Reconciles
            </div>
            <div className="text-2xl font-semibold mt-1 text-teal-700">{summary.reconciles ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">$ adjusted by canonical</div>
            <div className="text-2xl font-semibold mt-1">{formatCurrency(summary.dollarsAdjusted ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {allGreen && (
        <Card className="border-teal-200 bg-teal-50/40">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-teal-600 mx-auto mb-2" />
            <CardTitle className="text-base">All reports reconcile cleanly</CardTitle>
            <CardDescription className="mt-1">
              Every shift report&apos;s components reconcile to its totals within tolerance.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {!allGreen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flagged & adjusted reports</CardTitle>
            <CardDescription>
              Click a row to see the original typed values vs the canonical values used by every dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const hasAdj =
                  Math.abs(r.delta.total_sales) > 0.01 ||
                  Math.abs(r.delta.total_revenue) > 0.01 ||
                  Math.abs(r.delta.fuel_sales) > 0.01 ||
                  Math.abs(r.delta.total_litres) > 0.01;
                return (
                  <div key={r.id} className="p-4">
                    <button
                      onClick={() => toggleRow(r.id)}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-medium">{r.date}</span>
                        <Badge variant="outline" className="text-xs">{r.shift_type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {r.site_code || r.site_name}
                        </span>
                        {!r.reconciles && (
                          <Badge variant="destructive" className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                            <AlertTriangle className="h-3 w-3 mr-1" /> reconcile fail
                          </Badge>
                        )}
                        {hasAdj && r.reconciles && (
                          <Badge variant="outline" className="text-xs">
                            ${Math.abs(r.delta.total_sales).toFixed(2)} adjusted
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">
                          {formatCurrency(r.canonical.total_sales)}
                        </span>
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-3 pl-2 border-l-2 border-muted space-y-3 text-sm">
                        {r.reason && (
                          <div className="text-amber-700 bg-amber-50 px-2 py-1.5 rounded text-xs">
                            <strong>Reason:</strong> {r.reason}
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-1">As submitted</div>
                            <table className="w-full text-xs">
                              <tbody>
                                <Row label="Fuel sales" val={r.submitted.fuel_sales} fmt="$" />
                                <Row label="Shop sales" val={r.submitted.shop_sales} fmt="$" />
                                <Row label="Total sales" val={r.submitted.total_sales} fmt="$" bold />
                                <Row label="Total revenue" val={r.submitted.total_revenue} fmt="$" />
                                <Row label="Total litres" val={r.submitted.total_litres} fmt="L" />
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-1">
                              Canonical (what dashboards use)
                            </div>
                            <table className="w-full text-xs">
                              <tbody>
                                <Row label="Fuel sales" val={r.canonical.fuel_sales} fmt="$" />
                                <Row label="Shop sales" val={r.canonical.shop_sales} fmt="$" />
                                <Row label="Total sales" val={r.canonical.total_sales} fmt="$" bold />
                                <Row label="Total revenue" val={r.canonical.total_revenue} fmt="$" />
                                <Row label="Total litres" val={r.canonical.total_litres} fmt="L" />
                                <Row label="Banking" val={r.canonical.banking} fmt="$" />
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tolerance for this site: <strong>{((r.tolerance_pct ?? 0.01) * 100).toFixed(2)}%</strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, val, fmt, bold }) {
  return (
    <tr>
      <td className="py-0.5 text-muted-foreground">{label}</td>
      <td className={'py-0.5 text-right' + (bold ? ' font-semibold' : '')}>
        {fmt === '$' ? formatCurrency(val) : `${(val || 0).toLocaleString()} L`}
      </td>
    </tr>
  );
}
