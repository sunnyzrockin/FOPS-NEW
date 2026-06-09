'use client';
/* eslint-disable react-hooks/set-state-in-effect -- chart data loader pattern */

/**
 * AnalyticsExplorer  —  RevenueCat-style metric explorer.
 *
 * Renders a control bar (Filter, Segment by, Metric, Every/Granularity,
 * Chart type) above a single main chart driven by /api/dashboard/timeseries.
 *
 * Owned by the Executive Dashboard; receives the parent's site filter +
 * date range so the explorer stays in sync with the KPI strip above.
 *
 * Server-side scoping (getAllowedSiteIds) is unchanged — the explorer
 * never bypasses tenant isolation; it just narrows what the caller sends.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Download, Loader2, Filter as FilterIcon, ChartLine, AreaChart as AreaChartIcon,
  BarChart3, Table as TableIcon,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/format';
import {
  createFopsPdf, addKpiStrip, addSectionTitle, addTable, saveFopsPdf,
} from '@/lib/pdf-export';

// Same teal-leaning palette used elsewhere on the dashboard.
const PALETTE = ['#0d9488', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#10b981', '#ec4899', '#64748b'];

const METRIC_OPTIONS = [
  { value: 'revenue',    label: 'Total Revenue', unit: '$' },
  { value: 'fuel_sales', label: 'Fuel Sales',    unit: '$' },
  { value: 'shop_sales', label: 'Shop Sales',    unit: '$' },
  { value: 'litres',     label: 'Litres Sold',   unit: 'L' },
  { value: 'banking',    label: 'Banking',       unit: '$' },
  { value: 'drive_offs', label: 'Drive-offs',    unit: '$' },
];

const SEGMENT_OPTIONS = [
  { value: 'site',        label: 'Site' },
  { value: 'shift_type',  label: 'Shift Type' },
  { value: 'fuel_grade',  label: 'Fuel Grade' },
];

const GRANULARITY_OPTIONS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const CHART_TYPES = [
  { value: 'line',  label: 'Line',         icon: ChartLine },
  { value: 'area',  label: 'Stacked area', icon: AreaChartIcon },
  { value: 'bar',   label: 'Bar',          icon: BarChart3 },
  { value: 'table', label: 'Table',        icon: TableIcon },
];

const SHIFT_TYPES = [
  { value: 'all',     label: 'All shifts' },
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night',   label: 'Night' },
];

const STATUSES = [
  { value: 'all',      label: 'All statuses' },
  { value: 'pending',  label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'flagged',  label: 'Flagged' },
];

export default function AnalyticsExplorer({ siteIds, sites, dateRange }) {
  const [metric, setMetric] = useState('revenue');
  const [segmentBy, setSegmentBy] = useState('site');
  const [granularity, setGranularity] = useState('daily');
  const [chartType, setChartType] = useState('line');
  const [shiftType, setShiftType] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ periods: [], series: [], totals: { metric: 0, reportCount: 0 } });

  const metricMeta = useMemo(() => METRIC_OPTIONS.find((m) => m.value === metric) || METRIC_OPTIONS[0], [metric]);
  const segmentLabel = useMemo(() => SEGMENT_OPTIONS.find((s) => s.value === segmentBy)?.label, [segmentBy]);

  // ---------------- LOADER -------------------------------------------------
  const loadData = useCallback(async () => {
    if (!siteIds) {
      setData({ periods: [], series: [], totals: { metric: 0, reportCount: 0 } });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        metric,
        segmentBy,
        granularity,
        siteIds,
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      if (shiftType !== 'all') params.set('shiftType', shiftType);
      if (status !== 'all') params.set('status', status);

      const res = await authedFetch(`/api/dashboard/timeseries?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.warn('[AnalyticsExplorer] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange.start, dateRange.end, metric, segmentBy, granularity, shiftType, status]);

  useEffect(() => { loadData(); }, [loadData]);

  // ---------------- RECHARTS DATA SHAPE -----------------------------------
  // recharts expects [{ period, "Site A": 10, "Site B": 4 }, ...]
  const chartData = useMemo(() => {
    return data.periods.map((p, idx) => {
      const row = { period: p };
      for (const s of data.series) row[s.key] = s.values[idx] ?? 0;
      return row;
    });
  }, [data]);

  const yFormat = (v) => {
    if (metricMeta.unit === '$') return formatCurrency(v);
    if (metricMeta.unit === 'L') return `${Math.round(v).toLocaleString('en-AU')} L`;
    return v;
  };

  // ---------------- EXPORT -------------------------------------------------
  const buildExportName = (ext) => {
    const metricLabel = metricMeta.label.replace(/\s+/g, '');
    const segLabel = (segmentLabel || segmentBy).replace(/\s+/g, '');
    return `FOPS_${metricLabel}_by_${segLabel}_${dateRange.start}_to_${dateRange.end}.${ext}`;
  };

  const exportPdf = () => {
    const doc = createFopsPdf({
      title: 'Analytics Explorer',
      subtitle: `${metricMeta.label} by ${segmentLabel}`,
      dateRange: { from: dateRange.start, to: dateRange.end },
      orientation: 'landscape',
    });
    addKpiStrip(doc, [
      { label: metricMeta.label, value: yFormat(data.totals.metric || 0), sub: `${data.totals.reportCount || 0} reports` },
      { label: 'Granularity', value: granularity.charAt(0).toUpperCase() + granularity.slice(1) },
      { label: 'Segments', value: String(data.series.length) },
      { label: 'Periods', value: String(data.periods.length) },
    ]);
    addSectionTitle(doc, `${metricMeta.label} by ${segmentLabel} (${granularity})`);
    const header = [segmentLabel || segmentBy, ...data.periods, 'Total'];
    const body = data.series.map((s) => {
      const total = s.values.reduce((sum, v) => sum + (Number(v) || 0), 0);
      return [s.key, ...s.values.map((v) => yFormat(v)), yFormat(total)];
    });
    addTable(doc, [header], body);
    saveFopsPdf(doc, buildExportName('pdf'));
  };

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const header = [segmentLabel || segmentBy, ...data.periods, 'Total'];
    const rows = data.series.map((s) => {
      const total = s.values.reduce((sum, v) => sum + (Number(v) || 0), 0);
      return [s.key, ...s.values, total];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${metricMeta.label} by ${segmentLabel || segmentBy}`.slice(0, 31));
    XLSX.writeFile(wb, buildExportName('xlsx'));
  };

  // ---------------- RENDER -------------------------------------------------
  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ChartLine className="h-5 w-5 text-teal-600" />
            Analytics Explorer
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-2 bg-teal-600 text-white hover:bg-teal-700">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPdf}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={exportXlsx}>Excel (.xlsx)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Control bar */}
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
          <ControlPicker label="Metric" value={metric} onChange={setMetric} options={METRIC_OPTIONS} className="w-[170px]" />
          <ControlPicker label="Segment by" value={segmentBy} onChange={setSegmentBy} options={SEGMENT_OPTIONS} className="w-[150px]" />
          <ControlPicker label="Every" value={granularity} onChange={setGranularity} options={GRANULARITY_OPTIONS} className="w-[120px]" />
          <ControlPicker label="Chart" value={chartType} onChange={setChartType} options={CHART_TYPES} className="w-[150px]" />
          <ControlPicker label="Shift" value={shiftType} onChange={setShiftType} options={SHIFT_TYPES} className="w-[140px]" />
          <ControlPicker label="Status" value={status} onChange={setStatus} options={STATUSES} className="w-[150px]" />
          {(shiftType !== 'all' || status !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground self-end pb-1"
              onClick={() => { setShiftType('all'); setStatus('all'); }}
            >
              <FilterIcon className="h-3 w-3" /> Clear filters
            </Button>
          )}
        </div>

        {/* Totals summary */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {metricMeta.label} · {segmentLabel} · {granularity}
          </span>
          <span className="text-2xl font-bold tracking-tight">{yFormat(data.totals.metric || 0)}</span>
          <span className="text-xs text-muted-foreground">
            {data.totals.reportCount || 0} reports · {data.series.length} segments · {data.periods.length} {granularity === 'daily' ? 'days' : granularity === 'weekly' ? 'weeks' : 'months'}
          </span>
        </div>

        {/* Chart / table */}
        {loading ? (
          <div className="h-[360px] flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        ) : data.series.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No data for the selected filters.
          </div>
        ) : chartType === 'table' ? (
          <PivotTable data={data} metricLabel={metricMeta.label} segmentLabel={segmentLabel} yFormat={yFormat} />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            {chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={yFormat} width={metricMeta.unit === '$' ? 90 : 60} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => yFormat(v)} />
                <Legend />
                {data.series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            ) : chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={yFormat} width={metricMeta.unit === '$' ? 90 : 60} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => yFormat(v)} />
                <Legend />
                {data.series.map((s, i) => (
                  <Area
                    key={s.key} type="monotone" dataKey={s.key} stackId="1"
                    stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={0.35}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={yFormat} width={metricMeta.unit === '$' ? 90 : 60} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => yFormat(v)} />
                <Legend />
                {data.series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} stackId="bar" fill={PALETTE[i % PALETTE.length]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ControlPicker({ label, value, onChange, options, className }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={className}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PivotTable({ data, metricLabel, segmentLabel, yFormat }) {
  const columnTotals = data.periods.map((_, idx) =>
    data.series.reduce((sum, s) => sum + (Number(s.values[idx]) || 0), 0)
  );
  const grandTotal = columnTotals.reduce((s, v) => s + v, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2 font-medium">{segmentLabel}</th>
            {data.periods.map((p) => (
              <th key={p} className="text-right px-3 py-2 font-medium whitespace-nowrap">{p}</th>
            ))}
            <th className="text-right px-3 py-2 font-medium bg-teal-50">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s) => {
            const total = s.values.reduce((sum, v) => sum + (Number(v) || 0), 0);
            return (
              <tr key={s.key} className="border-t border-border/40">
                <td className="px-3 py-2 font-medium">{s.key}</td>
                {s.values.map((v, idx) => (
                  <td key={idx} className="text-right px-3 py-2 tabular-nums">{yFormat(v)}</td>
                ))}
                <td className="text-right px-3 py-2 tabular-nums font-semibold bg-teal-50/50">{yFormat(total)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-teal-200 bg-teal-50/40 font-semibold">
            <td className="px-3 py-2">Total ({metricLabel})</td>
            {columnTotals.map((v, idx) => (
              <td key={idx} className="text-right px-3 py-2 tabular-nums">{yFormat(v)}</td>
            ))}
            <td className="text-right px-3 py-2 tabular-nums bg-teal-100">{yFormat(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
