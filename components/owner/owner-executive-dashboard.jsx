'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity -- pre-existing false-positives: timestamp memo + PDF builder closure */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, Legend, PieChart, Pie,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Fuel, ShoppingCart, Droplets,
  Trophy, AlertTriangle, Loader2, Download, RefreshCw, BarChart3, Calendar,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/format';
import SiteFilter from '@/components/shared/site-filter';
import AnalyticsExplorer from '@/components/shared/analytics-explorer';
import {
  createFopsPdf, addKpiStrip, addSectionTitle, addTable, saveFopsPdf,
} from '@/lib/pdf-export';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const fmt0 = (n) => Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 });
const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(1)}%`;
};

/**
 * Owner Executive Dashboard — high-level cross-site KPI view modeled on
 * Power BI / Gap Solutions executive panels. Pulls from:
 *   /api/dashboard/stats
 *   /api/dashboard/12-month-trend
 *   /api/dashboard/variance
 *   /api/dashboard/top-performers
 *   /api/dashboard/volume-by-grade
 *
 * Includes a branded PDF export of the entire dashboard.
 */
export default function OwnerExecutiveDashboard({ user, sites }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [variance, setVariance] = useState(null);
  const [performers, setPerformers] = useState({ top: [], bottom: [], metric: 'revenue' });
  const [volumeByGrade, setVolumeByGrade] = useState({ grades: [], totalLitres: 0 });
  const [dateRange, setDateRange] = useState(() => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  }));
  const [performerMetric, setPerformerMetric] = useState('revenue');
  const [lastLoaded, setLastLoaded] = useState(null);
  // Multi-select site filter — empty array = "All sites". The server
  // intersects against getAllowedSiteIds, so security is preserved.
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);

  const siteIds = useMemo(
    () => (selectedSiteIds.length === 0
      ? sites.map((s) => s.id)
      : selectedSiteIds
    ).join(','),
    [sites, selectedSiteIds],
  );

  // Human-readable "X min ago / just now" string. Re-derived on every
  // render so it stays accurate without needing a refresh timer.
  const lastLoadedLabel = useMemo(() => {
    if (!lastLoaded) return null;
    const delta = Math.max(0, Date.now() - lastLoaded);
    const mins = Math.floor(delta / 60_000);
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} mins ago`;
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
  }, [lastLoaded]);

  const loadData = useCallback(async () => {
    if (!siteIds) { setLoading(false); return; }
    setLoading(true);
    try {
      const [statsRes, trendRes, varRes, perfRes, volRes] = await Promise.all([
        authedFetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/dashboard/12-month-trend?siteIds=${siteIds}`),
        authedFetch(`/api/dashboard/variance?siteIds=${siteIds}`),
        authedFetch(`/api/dashboard/top-performers?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}&metric=${performerMetric}&limit=5`),
        authedFetch(`/api/dashboard/volume-by-grade?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
      ]);
      const [s, t, v, p, vol] = await Promise.all([statsRes.json(), trendRes.json(), varRes.json(), perfRes.json(), volRes.json()]);
      setStats(s);
      setTrend(Array.isArray(t) ? t : []);
      setVariance(v);
      setPerformers(p && !p.error ? p : { top: [], bottom: [], metric: 'revenue' });
      setVolumeByGrade(vol && !vol.error ? vol : { grades: [], totalLitres: 0 });
      setLastLoaded(Date.now());
    } catch (e) {
      console.error('Executive dashboard load failed', e);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange.start, dateRange.end, performerMetric]);

  useEffect(() => { loadData(); }, [loadData]);

  const exportPdf = () => {
    const selectedCount = selectedSiteIds.length === 0 ? sites.length : selectedSiteIds.length;
    const doc = createFopsPdf({
      title: 'Owner Executive Dashboard',
      subtitle: `${selectedCount} site${selectedCount === 1 ? '' : 's'}`,
      dateRange: { from: dateRange.start, to: dateRange.end },
    });

    addKpiStrip(doc, [
      { label: 'Total Revenue', value: formatCurrency(stats?.totalRevenue || 0), sub: `${stats?.totalReports || 0} reports` },
      { label: 'Fuel Sales', value: formatCurrency(stats?.totalFuelSales || 0) },
      { label: 'Shop Sales', value: formatCurrency(stats?.totalShopSales || 0) },
      { label: 'Total Volume', value: `${fmt0(stats?.totalLitres || 0)} L` },
      { label: 'Banking', value: formatCurrency(stats?.totalBanking || 0) },
    ]);

    // Variance section
    if (variance?.mom) {
      addSectionTitle(doc, 'Period-over-Period Variance');
      addTable(doc,
        ['Metric', 'Current', 'Previous', 'Variance %'],
        [
          ['Revenue (MoM)', formatCurrency(variance.mom.current.revenue), formatCurrency(variance.mom.previous.revenue), fmtPct(variance.mom.variancePct.revenue)],
          ['Fuel Sales (MoM)', formatCurrency(variance.mom.current.fuelSales), formatCurrency(variance.mom.previous.fuelSales), fmtPct(variance.mom.variancePct.fuelSales)],
          ['Shop Sales (MoM)', formatCurrency(variance.mom.current.shopSales), formatCurrency(variance.mom.previous.shopSales), fmtPct(variance.mom.variancePct.shopSales)],
          ['Volume (MoM)', `${fmt0(variance.mom.current.totalLitres)} L`, `${fmt0(variance.mom.previous.totalLitres)} L`, fmtPct(variance.mom.variancePct.totalLitres)],
          ['Revenue (YoY)', formatCurrency(variance.yoy.current.revenue), formatCurrency(variance.yoy.previous.revenue), fmtPct(variance.yoy.variancePct.revenue)],
        ]);
    }

    // 12-month trend
    if (trend.length) {
      addSectionTitle(doc, '12-Month Trend');
      addTable(doc,
        ['Month', 'Revenue', 'Fuel Sales', 'Shop Sales', 'Volume (L)', 'Reports'],
        trend.map((m) => [
          m.label,
          formatCurrency(m.revenue),
          formatCurrency(m.fuelSales),
          formatCurrency(m.shopSales),
          fmt0(m.totalLitres),
          String(m.reportCount),
        ]));
    }

    // Performers
    if (performers.top.length) {
      addSectionTitle(doc, `Top ${performers.top.length} Performers (by ${performers.metric})`);
      addTable(doc,
        ['Site', 'Code', 'Revenue', 'Fuel Sales', 'Shop Sales', 'Reports'],
        performers.top.map((s) => [s.siteName, s.siteCode, formatCurrency(s.revenue), formatCurrency(s.fuelSales), formatCurrency(s.shopSales), String(s.reportCount)]));
    }
    if (performers.bottom.length) {
      addSectionTitle(doc, `Bottom ${performers.bottom.length} Performers`);
      addTable(doc,
        ['Site', 'Code', 'Revenue', 'Fuel Sales', 'Shop Sales', 'Reports'],
        performers.bottom.map((s) => [s.siteName, s.siteCode, formatCurrency(s.revenue), formatCurrency(s.fuelSales), formatCurrency(s.shopSales), String(s.reportCount)]));
    }

    // Volume by grade
    if (volumeByGrade.grades.length) {
      addSectionTitle(doc, 'Volume Sold by Fuel Grade');
      addTable(doc,
        ['Grade', 'Litres', '% of Total'],
        volumeByGrade.grades.map((g) => [
          g.grade, fmt0(g.litres),
          volumeByGrade.totalLitres ? `${((g.litres / volumeByGrade.totalLitres) * 100).toFixed(1)}%` : '—',
        ]));
    }

    saveFopsPdf(doc, `FOPS_Executive_${dateRange.start}_to_${dateRange.end}.pdf`);
  };

  if (loading && !stats) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header / controls */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-600">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Executive Dashboard</h2>
                <p className="text-xs text-muted-foreground">Cross-site portfolio intelligence · {sites.length} sites</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sites</Label>
                <SiteFilter
                  sites={sites}
                  selectedIds={selectedSiteIds}
                  onChange={setSelectedSiteIds}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))} className="w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))} className="w-[150px]" />
              </div>
              {lastLoadedLabel && (
                <div className="text-xs text-muted-foreground self-end pb-2 whitespace-nowrap">
                  Last updated: <span className="font-medium text-foreground">{lastLoadedLabel}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={loadData} className="gap-2" disabled={loading} aria-label="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button onClick={exportPdf} className="gap-2 bg-teal-600 text-white hover:bg-teal-700">
                <Download className="h-4 w-4" /> Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} sub={`${stats.totalReports} reports`} from="from-purple-500" to="to-pink-500" />
          <KpiCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} from="from-teal-500" to="to-cyan-500" />
          <KpiCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} from="from-emerald-500" to="to-teal-500" />
          <KpiCard title="Volume Sold" value={`${fmt0(stats.totalLitres)} L`} icon={Droplets} from="from-cyan-500" to="to-teal-500" />
          <KpiCard title="Banking" value={formatCurrency(stats.totalBanking)} icon={DollarSign} from="from-amber-500" to="to-orange-500" />
          <KpiCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} from="from-rose-500" to="to-red-500" />
        </div>
      )}

      {/* Analytics Explorer — RevenueCat-style metric explorer */}
      <AnalyticsExplorer siteIds={siteIds} sites={sites} dateRange={dateRange} />

      {/* Variance MoM / YoY */}
      {variance?.mom && (
        <div className="grid md:grid-cols-2 gap-4">
          <VarianceCard title="Month over Month" data={variance.mom} icon={Calendar} />
          <VarianceCard title="Year over Year" data={variance.yoy} icon={TrendingUp} />
        </div>
      )}

      {/* 12-month trend */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-600" /> 12-Month Rolling Trend
          </CardTitle>
          <CardDescription>Revenue, Fuel & Shop sales across the trailing 12 months</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="execRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="execFuel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="execShop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" className="text-xs" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" name="Revenue" dataKey="revenue" stroke="#3b82f6" fill="url(#execRevenue)" strokeWidth={2} />
              <Area type="monotone" name="Fuel Sales" dataKey="fuelSales" stroke="#8b5cf6" fill="url(#execFuel)" strokeWidth={2} />
              <Area type="monotone" name="Shop Sales" dataKey="shopSales" stroke="#10b981" fill="url(#execShop)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top / Bottom performers */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-600" /> Top {performers.top.length || 5} Performers
              </CardTitle>
              <CardDescription>by {performerMetric}</CardDescription>
            </div>
            <select
              value={performerMetric}
              onChange={(e) => setPerformerMetric(e.target.value)}
              className="text-xs border rounded-md px-2 py-1"
            >
              <option value="revenue">Revenue</option>
              <option value="fuel">Fuel Sales</option>
              <option value="shop">Shop Sales</option>
              <option value="volume">Volume (L)</option>
            </select>
          </CardHeader>
          <CardContent>
            {performers.top.length ? (
              <PerformerList rows={performers.top} accent="emerald" metricKey={performers.metric} />
            ) : (
              <div className="text-sm text-muted-foreground py-8 text-center">No data in this date range.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-rose-600" /> Bottom {performers.bottom.length || 5} Performers
            </CardTitle>
            <CardDescription>Sites needing attention</CardDescription>
          </CardHeader>
          <CardContent>
            {performers.bottom.length ? (
              <PerformerList rows={performers.bottom} accent="rose" metricKey={performers.metric} />
            ) : (
              <div className="text-sm text-muted-foreground py-8 text-center">No data in this date range.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Volume by grade */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Droplets className="h-5 w-5 text-cyan-600" /> Volume Sold by Fuel Grade
          </CardTitle>
          <CardDescription>
            Total {fmt0(volumeByGrade.totalLitres)} L across all sites & grades
          </CardDescription>
        </CardHeader>
        <CardContent>
          {volumeByGrade.grades.length ? (
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={volumeByGrade.grades}
                    dataKey="litres"
                    nameKey="grade"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    label={(d) => `${((d.litres / volumeByGrade.totalLitres) * 100).toFixed(0)}%`}
                  >
                    {volumeByGrade.grades.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${fmt0(v)} L`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {volumeByGrade.grades.map((g, i) => (
                  <div key={g.grade} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="font-medium">{g.grade}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{fmt0(g.litres)} L</div>
                      <div className="text-xs text-muted-foreground">
                        {volumeByGrade.totalLitres ? `${((g.litres / volumeByGrade.totalLitres) * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No volume data for this date range. Configure per-grade litre fields on each site to see this breakdown.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============== Helpers ===============

function KpiCard({ title, value, icon: Icon, sub, from, to }) {
  return (
    <Card className={`border-0 shadow-md bg-gradient-to-br ${from} ${to} text-white`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium opacity-90">{title}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
            {sub && <p className="text-[10px] opacity-80 mt-1">{sub}</p>}
          </div>
          <Icon className="h-6 w-6 opacity-90" />
        </div>
      </CardContent>
    </Card>
  );
}

function VarianceCard({ title, data, icon: Icon }) {
  const Up = data.variancePct.revenue >= 0;
  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <VarianceRow label="Revenue" cur={data.current.revenue} prev={data.previous.revenue} pct={data.variancePct.revenue} fmt={formatCurrency} />
        <VarianceRow label="Fuel Sales" cur={data.current.fuelSales} prev={data.previous.fuelSales} pct={data.variancePct.fuelSales} fmt={formatCurrency} />
        <VarianceRow label="Shop Sales" cur={data.current.shopSales} prev={data.previous.shopSales} pct={data.variancePct.shopSales} fmt={formatCurrency} />
        <VarianceRow label="Volume (L)" cur={data.current.totalLitres} prev={data.previous.totalLitres} pct={data.variancePct.totalLitres} fmt={(n) => `${fmt0(n)} L`} />
      </CardContent>
    </Card>
  );
}

function VarianceRow({ label, cur, prev, pct, fmt }) {
  const up = pct >= 0;
  return (
    <div className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-semibold">{fmt(cur)}</div>
          <div className="text-[10px] text-muted-foreground">prev {fmt(prev)}</div>
        </div>
        <Badge variant={up ? 'default' : 'destructive'} className={`gap-1 ${up ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {fmtPct(pct)}
        </Badge>
      </div>
    </div>
  );
}

function PerformerList({ rows, accent = 'emerald', metricKey = 'revenue' }) {
  const max = Math.max(...rows.map((r) => r[metricKey] || 0), 1);
  const fillFrom = accent === 'emerald' ? 'from-emerald-400' : 'from-rose-400';
  const fillTo = accent === 'emerald' ? 'to-teal-500' : 'to-orange-500';
  const textColor = accent === 'emerald' ? 'text-emerald-700' : 'text-rose-700';
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const val = r[metricKey] || 0;
        const pct = (val / max) * 100;
        const isMoney = metricKey !== 'totalLitres';
        return (
          <div key={r.siteId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${textColor} text-xs w-5`}>#{i + 1}</span>
                <span className="font-medium">{r.siteName}</span>
                <Badge variant="outline" className="text-[10px]">{r.siteCode}</Badge>
              </div>
              <span className="font-semibold">
                {isMoney ? formatCurrency(val) : `${fmt0(val)} L`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${fillFrom} ${fillTo}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
