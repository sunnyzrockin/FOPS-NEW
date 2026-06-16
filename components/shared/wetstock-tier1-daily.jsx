'use client';
/* eslint-disable react-hooks/set-state-in-effect -- data hydration in useEffect */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Droplets, RefreshCw, AlertTriangle, CheckCircle2, Activity, Link2Off, Info, TrendingUp,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * WetstockTier1Daily — per-tank, per-day reconciliation table.
 *
 * Reads /api/tank-reconciliation?siteId=&date= and shows opening,
 * delivery, sales, expected, actual, variance (L + %), and a status
 * pill (green/amber/red/no_data/broken_chain) for every tank.
 *
 * Tier 2 placeholder: trend sparkline slot reserved at bottom-right of
 * each row but left blank for now.
 */
export default function WetstockTier1Daily({ sites }) {
  const today = new Date().toISOString().slice(0, 10);
  const [siteId, setSiteId] = useState((sites && sites[0]?.id) || '');
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/tank-reconciliation?siteId=${siteId}&date=${date}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      toast.error('Failed to load daily reconciliation', { description: e.message });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [siteId, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Site</Label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(sites || []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
      ) : !data ? null : (
        <>
          <SummaryStrip summary={data.summary} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Droplets className="h-4 w-4 text-teal-600" />
                Daily tank reconciliation — {date}
              </CardTitle>
              <CardDescription>
                Per-tank movement vs metered sales. Status uses each tank’s tolerance %.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(data.rows || []).length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Info className="h-4 w-4" /> No tanks configured for this site yet. Add some under <strong>Tank Setup</strong>.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Grade</th>
                        <th className="text-right px-3 py-2">Opening</th>
                        <th className="text-right px-3 py-2">Delivery</th>
                        <th className="text-right px-3 py-2">Sales</th>
                        <th className="text-right px-3 py-2">Expected</th>
                        <th className="text-right px-3 py-2">Actual</th>
                        <th className="text-right px-3 py-2">Variance L</th>
                        <th className="text-right px-3 py-2">Variance %</th>
                        <th className="text-center px-3 py-2">Status</th>
                        <th className="text-center px-3 py-2" title="Trend sparkline (Tier 2)">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.tank_id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{r.tank?.grade}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtL(r.opening_litres)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtL(r.delivery_litres)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtL(r.sales_litres)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtL(r.expected_closing)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtL(r.actual_closing)}</td>
                          <td className={'px-3 py-2 text-right tabular-nums ' + varianceColor(r.variance_litres)}>
                            {r.variance_litres == null ? '—' : `${r.variance_litres > 0 ? '+' : ''}${Number(r.variance_litres).toFixed(0)} L`}
                          </td>
                          <td className={'px-3 py-2 text-right tabular-nums ' + varianceColor(r.variance_litres)}>
                            {r.variance_pct == null ? '—' : `${Number(r.variance_pct).toFixed(2)}%`}
                          </td>
                          <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
                          <td className="px-3 py-2 text-center text-muted-foreground/40">
                            {/* Tier 2: sparkline placeholder */}
                            <TrendingUp className="h-3.5 w-3.5 inline opacity-30" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryStrip({ summary }) {
  if (!summary) return null;
  const { tanks_total = 0, within_tolerance = 0, counts = {}, total_sales_litres = 0, total_variance_litres = 0 } = summary;
  return (
    <Card>
      <CardContent className="p-3 flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">
          {within_tolerance} of {tanks_total} tank{tanks_total === 1 ? '' : 's'} within tolerance
        </div>
        <div className="flex items-center gap-1.5">
          {counts.green > 0 && <SmallBadge tone="teal">{counts.green} OK</SmallBadge>}
          {counts.amber > 0 && <SmallBadge tone="amber">{counts.amber} watch</SmallBadge>}
          {counts.red > 0 && <SmallBadge tone="red">{counts.red} alert</SmallBadge>}
          {counts.broken_chain > 0 && <SmallBadge tone="amber">{counts.broken_chain} chain broken</SmallBadge>}
          {counts.no_data > 0 && <SmallBadge tone="muted">{counts.no_data} no data</SmallBadge>}
        </div>
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          Sales: {fmtL(total_sales_litres)} · Variance: {fmtL(total_variance_litres)}
        </div>
      </CardContent>
    </Card>
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

function SmallBadge({ tone, children }) {
  const cls =
    tone === 'teal'  ? 'bg-teal-100 text-teal-800 border-teal-200' :
    tone === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' :
    tone === 'red'   ? 'bg-red-100 text-red-700 border-red-200' :
                       'bg-muted text-muted-foreground border-border';
  return <Badge variant="outline" className={cls + ' text-[10px]'}>{children}</Badge>;
}

function StatusBadge({ status }) {
  switch (status) {
    case 'green':
      return <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>;
    case 'amber':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"><Activity className="h-3 w-3 mr-1" />Watch</Badge>;
    case 'red':
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Alert</Badge>;
    case 'broken_chain':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"><Link2Off className="h-3 w-3 mr-1" />Chain broken</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">No data</Badge>;
  }
}
