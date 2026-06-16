'use client';
/* eslint-disable react-hooks/set-state-in-effect -- data hydration in useEffect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, Droplets, RefreshCw, AlertTriangle, CheckCircle2, Eye, Info,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';
import WetstockTier1Daily from '@/components/shared/wetstock-tier1-daily';

/**
 * Wet-stock reconciliation tab — owner & operator.
 *
 * Per (site, grade), shows: opening level, deliveries, closing level,
 * book movement (= opening - closing + deliveries), metered sales (from
 * shift_reports.custom_values per-grade litres), variance + status badge.
 *
 * Sites can be in 4 states per grade:
 *   ok    — variance within ±tolerance (default 0.5%)
 *   watch — variance between 1x and 3x tolerance
 *   alert — variance beyond 3x tolerance OR persistent loss
 *   no_metered_sales — has dips but no per-grade pump sales recorded
 *   no_dips          — has metered sales but only 0–1 dip reading
 */
export default function WetstockReconciliation({ sites }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Default: last 30 days
  const today = new Date();
  const ago = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmtISO = (d) => d.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(fmtISO(ago));
  const [endDate, setEndDate] = useState(fmtISO(today));

  const siteIds = (sites || []).map((s) => s.id).join(',');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL('/api/wetstock/reconciliation', window.location.origin);
      if (siteIds) u.searchParams.set('siteIds', siteIds);
      if (startDate) u.searchParams.set('startDate', startDate);
      if (endDate) u.searchParams.set('endDate', endDate);
      const res = await authedFetch(u.pathname + u.search);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      toast.error('Failed to load wet-stock reconciliation', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [siteIds, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const { summary = {}, sites: siteRows = [] } = data || {};

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Droplets className="h-6 w-6 text-teal-600" />
            Wet-stock Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tank-level movement vs metered pump sales per grade. Variance beyond
            tolerance flags potential leak, theft, or meter drift.
          </p>
        </div>
      </div>

      {/* Tier 1 Daily vs existing 30-day Period summary */}
      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily reconciliation</TabsTrigger>
          <TabsTrigger value="period">Period summary</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <WetstockTier1Daily sites={sites} />
        </TabsContent>

        <TabsContent value="period" className="mt-4 space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

      {/* Date range */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ws-start" className="text-xs">Start date</Label>
            <Input id="ws-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label htmlFor="ws-end" className="text-xs">End date</Label>
            <Input id="ws-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={load}>Apply</Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Sites" value={summary.sites ?? 0} />
        <StatCard label="OK" value={summary.ok ?? 0} tone="teal" />
        <StatCard label="Watch" value={summary.watch ?? 0} tone="amber" />
        <StatCard label="Alert" value={summary.alert ?? 0} tone="red" />
        <StatCard label="No data" value={summary.no_data ?? 0} tone="muted" />
      </div>

      {/* Per-site cards */}
      {siteRows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Info className="h-6 w-6 mx-auto mb-2" />
            No sites in scope for this date range.
          </CardContent>
        </Card>
      )}

      {siteRows.map((s) => (
        <Card key={s.site_id}>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">
                  {s.site_name}
                  {s.site_code && <span className="text-xs text-muted-foreground ml-2">({s.site_code})</span>}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {s.reading_count} dip readings · {s.report_count} shift reports · tolerance ±{((s.tolerance_pct ?? 0.005) * 100).toFixed(2)}%
                </CardDescription>
              </div>
              <div className="flex gap-1.5">
                {s.site_summary.ok > 0 && <SmallBadge tone="teal">{s.site_summary.ok} ok</SmallBadge>}
                {s.site_summary.watch > 0 && <SmallBadge tone="amber">{s.site_summary.watch} watch</SmallBadge>}
                {s.site_summary.alert > 0 && <SmallBadge tone="red">{s.site_summary.alert} alert</SmallBadge>}
                {s.site_summary.no_data > 0 && <SmallBadge tone="muted">{s.site_summary.no_data} no data</SmallBadge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Grade</th>
                    <th className="text-right px-3 py-2">Opening</th>
                    <th className="text-right px-3 py-2">Deliveries</th>
                    <th className="text-right px-3 py-2">Closing</th>
                    <th className="text-right px-3 py-2">Book mvmt</th>
                    <th className="text-right px-3 py-2">Metered sold</th>
                    <th className="text-right px-3 py-2">Variance</th>
                    <th className="text-right px-3 py-2">Variance %</th>
                    <th className="text-center px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.grades.map((g) => (
                    <tr key={g.grade_key} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{g.grade}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtL(g.opening_level)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtL(g.deliveries)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtL(g.closing_level)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtL(g.book_movement)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtL(g.metered_sales)}</td>
                      <td className={'px-3 py-2 text-right tabular-nums ' + varianceColor(g.variance_litres)}>
                        {g.variance_litres == null ? '—' : `${g.variance_litres > 0 ? '+' : ''}${g.variance_litres.toFixed(1)} L`}
                      </td>
                      <td className={'px-3 py-2 text-right tabular-nums ' + varianceColor(g.variance_litres)}>
                        {g.variance_pct == null ? '—' : `${(g.variance_pct * 100).toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Reasons for no-data rows */}
            {s.grades.some((g) => g.reason) && (
              <div className="px-4 py-3 border-t bg-muted/20 space-y-1">
                {s.grades.filter((g) => g.reason).map((g) => (
                  <div key={g.grade_key} className="text-xs text-muted-foreground flex gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span><strong>{g.grade}:</strong> {g.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function fmtL(n) {
  if (n == null) return '—';
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} L`;
}
function varianceColor(v) {
  if (v == null) return 'text-muted-foreground';
  if (Math.abs(v) < 0.01) return '';
  return v < 0 ? 'text-red-600' : 'text-amber-600';
}

function StatCard({ label, value, tone }) {
  const cls =
    tone === 'teal' ? 'border-teal-200 bg-teal-50/30 text-teal-800' :
    tone === 'amber' ? 'border-amber-200 bg-amber-50/40 text-amber-800' :
    tone === 'red' ? 'border-red-200 bg-red-50/40 text-red-700' :
    tone === 'muted' ? 'bg-muted/30 text-muted-foreground' : '';
  return (
    <Card className={cls}>
      <CardContent className="p-4">
        <div className="text-xs">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function SmallBadge({ tone, children }) {
  const cls =
    tone === 'teal'  ? 'bg-teal-100 text-teal-800 border-teal-200' :
    tone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' :
    tone === 'red'   ? 'bg-red-100 text-red-700 border-red-200' :
                       'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={cls + ' text-[10px]'}>
      {children}
    </Badge>
  );
}

function StatusBadge({ status }) {
  switch (status) {
    case 'ok':
      return <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>;
    case 'watch':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"><Eye className="h-3 w-3 mr-1" />Watch</Badge>;
    case 'alert':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Alert</Badge>;
    case 'no_metered_sales':
      return <Badge variant="outline" className="text-xs">No metered sales</Badge>;
    case 'no_dips':
      return <Badge variant="outline" className="text-xs">No dip data</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
