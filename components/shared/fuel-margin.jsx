'use client';
/* eslint-disable react-hooks/set-state-in-effect -- data hydration in useEffect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Coins, RefreshCw, AlertTriangle, CheckCircle2, TrendingDown, Info, Lock, ArrowRight,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/format';

/**
 * Fuel Margin tab — owner + operator (Growth+ gated).
 *
 * Per site/grade, shows cost cpl, sell cpl, margin cpl, litres sold, gross
 * profit + status badge. Portfolio rollup at the top.
 */
export default function FuelMargin({ sites, user }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(null);

  const today = new Date();
  const ago = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmtISO = (d) => d.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(fmtISO(ago));
  const [endDate, setEndDate] = useState(fmtISO(today));

  const siteIds = (sites || []).map((s) => s.id).join(',');

  const load = useCallback(async () => {
    setLoading(true);
    setSubscriptionRequired(null);
    try {
      const u = new URL('/api/margin/summary', window.location.origin);
      if (siteIds) u.searchParams.set('siteIds', siteIds);
      if (startDate) u.searchParams.set('startDate', startDate);
      if (endDate) u.searchParams.set('endDate', endDate);
      const res = await authedFetch(u.pathname + u.search);
      const j = await res.json();
      if (res.status === 403 && j.code === 'subscription_required') {
        setSubscriptionRequired(j);
        return;
      }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      toast.error('Failed to load fuel margin', { description: e.message });
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

  // ----- Subscription gate UI (owner-only friendly upgrade page) -----
  if (subscriptionRequired) {
    const isOwner = user?.role === 'owner';
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-lg">
                <Lock className="h-5 w-5 text-teal-700" />
              </div>
              <div>
                <CardTitle>Fuel Margin is a Growth feature</CardTitle>
                <CardDescription>
                  {subscriptionRequired.detail}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5" /> Track cost vs sell price per grade and per site.</li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5" /> See gross fuel profit ($) over any date range.</li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-teal-600 mt-0.5" /> Get alerts when margin drops below the healthy threshold.</li>
            </ul>
            {isOwner ? (
              <Button asChild className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                <a href={subscriptionRequired.upgradeUrl}>
                  Upgrade to Growth <ArrowRight className="h-4 w-4 ml-2" />
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ask your account owner to upgrade to Growth or Enterprise to enable this view.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { rollup = {}, sites: siteRows = [] } = data || {};

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-teal-600" />
            Fuel Margin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cents-per-litre margin (sell − cost) and gross fuel profit per grade.
            Cost = moving weighted-average from <strong>fuel_deliveries</strong> (ex-GST).
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="m-start" className="text-xs">Start date</Label>
            <Input id="m-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label htmlFor="m-end" className="text-xs">End date</Label>
            <Input id="m-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={load}>Apply</Button>
        </CardContent>
      </Card>

      {/* Portfolio rollup */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-teal-200 bg-teal-50/30">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Weighted margin (cpl)</div>
            <div className="text-2xl font-semibold mt-1">
              {rollup.weighted_margin_cpl != null
                ? `${rollup.weighted_margin_cpl.toFixed(2)}¢`
                : <span className="text-muted-foreground text-base">No data</span>}
            </div>
            <div className="mt-1">
              {rollup.weighted_margin_cpl != null && <StatusBadge status={rollup.weighted_margin_status} />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total litres sold</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">
              {Number(rollup.total_litres_sold || 0).toLocaleString()} L
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Gross fuel profit (ex-GST)</div>
            <div className="text-2xl font-semibold mt-1 tabular-nums">
              {formatCurrency(rollup.total_gross_profit_dollars || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-site cards */}
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
                  {s.delivery_count} deliveries · {s.price_entry_count} price entries · {s.report_count} reports
                  · thresholds {s.thresholds?.healthy_cpl ?? 8}¢ / {s.thresholds?.amber_cpl ?? 3}¢
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Grade</th>
                    <th className="text-right px-3 py-2">Cost (cpl)</th>
                    <th className="text-right px-3 py-2">Sell (cpl)</th>
                    <th className="text-right px-3 py-2">Margin (cpl)</th>
                    <th className="text-right px-3 py-2">Litres sold</th>
                    <th className="text-right px-3 py-2">Gross profit</th>
                    <th className="text-center px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.grades.map((g) => (
                    <tr key={g.grade} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{g.grade}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cpl(g.cost_cpl)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cpl(g.sell_cpl)}</td>
                      <td className={'px-3 py-2 text-right tabular-nums ' + marginColor(g.margin_cpl)}>
                        {cpl(g.margin_cpl)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {g.litres_sold ? `${g.litres_sold.toLocaleString()} L` : '—'}
                      </td>
                      <td className={'px-3 py-2 text-right tabular-nums ' + marginColor(g.gross_profit_dollars)}>
                        {g.gross_profit_dollars != null ? formatCurrency(g.gross_profit_dollars) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.grades.some((g) => g.reason) && (
              <div className="px-4 py-3 border-t bg-muted/20 space-y-1">
                {s.grades.filter((g) => g.reason).map((g) => (
                  <div key={g.grade} className="text-xs text-muted-foreground flex gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span><strong>{g.grade}:</strong> {g.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function cpl(n) {
  if (n == null) return '—';
  return `${Number(n).toFixed(2)}¢`;
}
function marginColor(v) {
  if (v == null) return 'text-muted-foreground';
  if (v < 0) return 'text-red-600 font-semibold';
  return '';
}

function StatusBadge({ status }) {
  switch (status) {
    case 'healthy':
      return <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100"><CheckCircle2 className="h-3 w-3 mr-1" />Healthy</Badge>;
    case 'amber':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"><AlertTriangle className="h-3 w-3 mr-1" />Squeezed</Badge>;
    case 'red':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><TrendingDown className="h-3 w-3 mr-1" />At risk</Badge>;
    case 'unavailable':
      return <Badge variant="outline" className="text-xs">Unavailable</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
