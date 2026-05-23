'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Download, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Building2, TableProperties, FileText,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * MonthlyReportsPivot — Operator-facing pivot table view of shift_reports.
 *
 * Columns are 100% dynamic — they come from `site_field_configs` (sales
 * category, enabled, number-typed). Rows are one per calendar day in the
 * selected range. Each cell sums all shifts (Morning + Afternoon + Night)
 * for that day. A bottom TOTAL row sums the columns.
 *
 * Optional summary columns ("TOTAL row only", controlled by the operator):
 *   • Show "All fields total" column   — sum of every cell in the row.
 *   • Show "Variance" column           — TOTAL minus the "BANKING" field
 *                                        if one exists (operator's choice).
 *
 * Drill-down: click any data row to expand a sub-list of the underlying
 * per-shift submissions for that day.
 *
 * CSV export downloads exactly what's on screen, including the TOTAL row.
 */

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
};
const fmtNumber = (n) => {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Build [from, to] for a given YYYY-MM string.
function monthRange(yyyymm) {
  const [y, m] = yyyymm.split('-').map((s) => parseInt(s, 10));
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0); // last day
  const f = (d) => d.toISOString().slice(0, 10);
  return { from: f(from), to: f(to) };
}

export default function MonthlyReportsPivot({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [mode, setMode] = useState('month'); // 'month' | 'custom'
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [customRange, setCustomRange] = useState({
    from: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const [showRowTotal, setShowRowTotal] = useState(false);
  const [varianceAgainst, setVarianceAgainst] = useState('none');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);

  const { from, to } = mode === 'month' ? monthRange(month) : customRange;

  const load = useCallback(async () => {
    if (!selectedSite) return;
    setLoading(true);
    setExpandedDate(null);
    try {
      const url = `/api/reports/pivot?site_id=${selectedSite}&from=${from}&to=${to}&breakdown=1`;
      const res = await authedFetch(url);
      const json = await res.json();
      if (!res.ok) {
        setData({ error: json?.error || 'Failed', columns: [], rows: [], totals: {}, shift_breakdowns: {} });
      } else {
        setData(json);
      }
    } catch (e) {
      setData({ error: e?.message || 'Failed', columns: [], rows: [], totals: {}, shift_breakdowns: {} });
    } finally {
      setLoading(false);
    }
  }, [selectedSite, from, to]);

  useEffect(() => { load(); }, [load]);

  // Compute per-row total (sum of all cells) when toggled on.
  const augmentedRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.map((r) => {
      const rowTotal = data.columns.reduce(
        (acc, c) => acc + (Number(r.values[c.key]) || 0),
        0
      );
      const varianceValue =
        varianceAgainst !== 'none' && r.values[varianceAgainst] != null
          ? rowTotal - (Number(r.values[varianceAgainst]) || 0)
          : null;
      return { ...r, rowTotal, varianceValue };
    });
  }, [data, varianceAgainst]);

  const totalsRowTotal = useMemo(() => {
    if (!data?.columns) return 0;
    return data.columns.reduce((acc, c) => acc + (Number(data.totals[c.key]) || 0), 0);
  }, [data]);

  const exportCsv = () => {
    if (!data?.columns?.length) return;
    const cols = data.columns;
    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Date', 'Shifts',
      ...cols.map((c) => c.label),
      ...(showRowTotal ? ['Row Total'] : []),
      ...(varianceAgainst !== 'none' ? [`Variance vs ${cols.find((c) => c.key === varianceAgainst)?.label || varianceAgainst}`] : []),
    ];
    const lines = [header.map(escape).join(',')];
    for (const r of augmentedRows) {
      const cells = [
        r.date,
        r.shifts,
        ...cols.map((c) => (r.values[c.key] != null ? Number(r.values[c.key]).toFixed(2) : '')),
        ...(showRowTotal ? [r.rowTotal.toFixed(2)] : []),
        ...(varianceAgainst !== 'none'
          ? [r.varianceValue != null ? r.varianceValue.toFixed(2) : '']
          : []),
      ];
      lines.push(cells.map(escape).join(','));
    }
    // Totals row
    const totalsCells = [
      'TOTAL',
      data.reportCount,
      ...cols.map((c) => Number(data.totals[c.key] || 0).toFixed(2)),
      ...(showRowTotal ? [totalsRowTotal.toFixed(2)] : []),
      ...(varianceAgainst !== 'none'
        ? [(totalsRowTotal - (Number(data.totals[varianceAgainst]) || 0)).toFixed(2)]
        : []),
    ];
    lines.push(totalsCells.map(escape).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data?.site?.name || 'site'}__${from}_to_${to}.csv`.replace(/[\\/:*?"<>|]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  // Month-step navigation
  const stepMonth = (delta) => {
    const [y, m] = month.split('-').map((s) => parseInt(s, 10));
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TableProperties className="h-5 w-5 text-blue-600" />
            Monthly Reports
          </h2>
          <p className="text-muted-foreground text-sm">
            Pivot view of shift submissions. Columns adapt to each site&apos;s configured fields.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={!data?.columns?.length} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Site</Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5" /> {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Range</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'month' ? (
              <div className="space-y-1">
                <Label className="text-xs">Month</Label>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" onClick={() => stepMonth(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-[160px]"
                  />
                  <Button size="icon" variant="outline" onClick={() => stepMonth(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date" value={customRange.from}
                    onChange={(e) => setCustomRange((r) => ({ ...r, from: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date" value={customRange.to}
                    onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-4 ml-auto">
              <div className="flex items-center gap-2">
                <Switch id="row-total" checked={showRowTotal} onCheckedChange={setShowRowTotal} />
                <Label htmlFor="row-total" className="text-xs cursor-pointer">Show row totals</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Variance vs</Label>
                <Select value={varianceAgainst} onValueChange={setVarianceAgainst}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— off —</SelectItem>
                    {(data?.columns || []).map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
            <CalendarIcon className="h-3.5 w-3.5" />
            Showing <strong>{from}</strong> → <strong>{to}</strong>
            {data && (
              <>
                <span>·</span>
                <Badge variant="secondary">{data.reportCount || 0} shifts</Badge>
                <Badge variant="outline">{data.columns?.length || 0} columns</Badge>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pivot table */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            </div>
          ) : data?.error ? (
            <div className="p-6 text-sm text-red-700 bg-red-50 border-l-4 border-red-400">
              {data.error}
            </div>
          ) : (data?.columns || []).length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No sales fields configured for this site yet.<br />
              Go to <strong>Form Fields → Sales &amp; Payments</strong> to add some.
            </div>
          ) : (
            <PivotTable
              data={data}
              augmentedRows={augmentedRows}
              showRowTotal={showRowTotal}
              varianceAgainst={varianceAgainst}
              totalsRowTotal={totalsRowTotal}
              expandedDate={expandedDate}
              setExpandedDate={setExpandedDate}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PivotTable({ data, augmentedRows, showRowTotal, varianceAgainst, totalsRowTotal, expandedDate, setExpandedDate }) {
  const cols = data.columns;
  const breakdowns = data.shift_breakdowns || {};
  const cellCls = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10 bg-slate-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700 sticky left-0 bg-slate-50">Date</th>
            <th className="px-2 py-2 text-center font-semibold text-slate-700">Shifts</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-semibold text-slate-700">
                {c.label}
                {c.source === 'custom' && (
                  <span className="ml-1 text-[10px] font-normal text-blue-500" title="Stored in custom_values JSONB">·</span>
                )}
              </th>
            ))}
            {showRowTotal && <th className={`${cellCls} font-semibold text-slate-700 bg-blue-50`}>Row Total</th>}
            {varianceAgainst !== 'none' && (
              <th className={`${cellCls} font-semibold text-slate-700 bg-amber-50`}>
                Variance
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {augmentedRows.map((r) => {
            const isExpanded = expandedDate === r.date;
            const dayBreakdown = breakdowns[r.date] || [];
            return (
              <>
                <tr
                  key={r.date}
                  onClick={() => r.has_data && setExpandedDate(isExpanded ? null : r.date)}
                  className={`border-b hover:bg-blue-50/40 ${
                    r.has_data ? 'cursor-pointer' : 'opacity-50'
                  } ${isExpanded ? 'bg-blue-50/60' : ''}`}
                >
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white">
                    {r.date}
                    {r.has_data && (
                      <span className="ml-1 text-[10px] text-blue-500">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center text-muted-foreground">
                    {r.has_data ? r.shifts : '—'}
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className={cellCls}>
                      {fmtNumber(r.values[c.key])}
                    </td>
                  ))}
                  {showRowTotal && (
                    <td className={`${cellCls} font-semibold bg-blue-50/40`}>
                      {r.has_data ? fmtMoney(r.rowTotal) : '—'}
                    </td>
                  )}
                  {varianceAgainst !== 'none' && (
                    <td className={`${cellCls} font-semibold bg-amber-50/40 ${
                      r.varianceValue != null && r.varianceValue < 0 ? 'text-red-600' : ''
                    }`}>
                      {r.varianceValue != null ? fmtMoney(r.varianceValue) : '—'}
                    </td>
                  )}
                </tr>
                {isExpanded && dayBreakdown.length > 0 && (
                  <tr className="bg-slate-50/60 border-b">
                    <td colSpan={2 + cols.length + (showRowTotal ? 1 : 0) + (varianceAgainst !== 'none' ? 1 : 0)} className="px-6 py-3">
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Per-shift breakdown for {r.date}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {dayBreakdown.map((s, i) => (
                          <div key={i} className="rounded-md border bg-white p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold">{s.shift_type}</span>
                              <Badge variant={s.status === 'approved' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                                {s.status}
                              </Badge>
                            </div>
                            <div className="space-y-0.5 text-muted-foreground">
                              {cols.map((c) => (
                                s.values[c.key] != null && (
                                  <div key={c.key} className="flex justify-between gap-2">
                                    <span className="truncate">{c.label}</span>
                                    <span className="tabular-nums">{fmtNumber(s.values[c.key])}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
            <td className="px-3 py-3 sticky left-0 bg-slate-100">TOTAL</td>
            <td className="px-2 py-3 text-center text-muted-foreground">{data.reportCount}</td>
            {cols.map((c) => (
              <td key={c.key} className={cellCls}>
                {fmtMoney(data.totals[c.key])}
              </td>
            ))}
            {showRowTotal && (
              <td className={`${cellCls} bg-blue-100`}>{fmtMoney(totalsRowTotal)}</td>
            )}
            {varianceAgainst !== 'none' && (
              <td className={`${cellCls} bg-amber-100`}>
                {fmtMoney(totalsRowTotal - (Number(data.totals[varianceAgainst]) || 0))}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
