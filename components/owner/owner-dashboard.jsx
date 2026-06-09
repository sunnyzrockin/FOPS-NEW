'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pre-existing false-positive: async click handlers / localStorage hydration in useEffect */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import {
  Fuel, ShoppingCart, DollarSign, Droplets, TrendingUp,
  BarChart3, Loader2, AlertTriangle, Calculator, Calendar, RefreshCw,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

import StatCard from '@/components/shared/stat-card';
import HealthStrip from '@/components/shared/health-strip';
import SiteFilter from '@/components/shared/site-filter';
import DailyRollupRow from '@/components/shared/daily-rollup-row';
import ReportDetail from '@/components/shared/report-detail';
import ExportDialog from '@/components/shared/export-dialog';
import MorningPriceBrief from '@/components/shared/morning-price-brief';
import SiteManagement from '@/components/owner/site-management';
import OperatorManagement from '@/components/owner/operator-management';
import OwnerFuelPriceManagement from '@/components/fuel-pricing/owner-fuel-price-management';
import FuelPriceComparisonSection from '@/components/fuel-pricing/fuel-price-comparison-section';
import BankingSubmissions from '@/components/shared/banking-submissions';
import MonthlyReportsPivot from '@/components/operator/monthly-reports-pivot';
import FuelInventoryDashboard from '@/components/owner/fuel-inventory-dashboard';
import LiveFuelPricesDashboard from '@/components/fuel-pricing/live-fuel-prices-dashboard';
import OwnerExecutiveDashboard from '@/components/owner/owner-executive-dashboard';
import { formatCurrency, formatDate } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * OwnerDashboard — Owner-facing portfolio view: KPI cards, Morning Price
 * Brief, fuel-price intelligence map, charts, and daily/shift report
 * roll-ups. Routes to Sites / Operators / Fuel-Prices sub-views based on
 * the parent's activeTab. Extracted from /app/app/app/page.js (Phase D
 * Batch 2c).
 */
export default function OwnerDashboard({ user, sites, activeTab, onRefreshSites }) {
  const [stats, setStats] = useState(null);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [siteStats, setSiteStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  // OWNER is locked to Daily Summary — the ViewToggle is not rendered.
  const [expandedRollup, setExpandedRollup] = useState(null);
  // Multi-select site filter — empty array means "All sites" (sends every
  // allowed site id). Server intersection (getAllowedSiteIds) guarantees
  // tenant safety regardless of what the client sends.
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [dateRange, setDateRange] = useState(() => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  }));
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState(null);

  // Morning Brief expand/collapse (persisted in localStorage)
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem('fops_morning_brief_collapsed');
      if (v === 'true') setBriefCollapsed(true);
    } catch {
      /* localStorage access can throw in private mode — ignore */
    }
  }, []);
  const toggleBrief = useCallback(() => {
    setBriefCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('fops_morning_brief_collapsed', String(next)); } catch {
        /* private mode safety */
      }
      return next;
    });
  }, []);

  const siteIds = (selectedSiteIds.length === 0
    ? sites.map((s) => s.id)
    : selectedSiteIds
  ).join(',');

  const loadData = useCallback(async () => {
    if (!siteIds) { setLoading(false); return; }
    setLoading(true);
    try {
      const [statsRes, dailyRes, siteStatsRes, chartRes] = await Promise.all([
        authedFetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/daily-rollups?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/dashboard/site-stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/dashboard/revenue-chart?siteIds=${siteIds}&days=7`),
      ]);

      const [statsData, dailyData, siteStatsData, chartDataRes] = await Promise.all([
        statsRes.json(), dailyRes.json(), siteStatsRes.json(), chartRes.json(),
      ]);

      setStats(statsData);
      setDailyRollups(Array.isArray(dailyData) ? dailyData : []);
      setSiteStats(Array.isArray(siteStatsData) ? siteStatsData : []);
      setChartData(Array.isArray(chartDataRes) ? chartDataRes : []);
      setLastLoaded(Date.now());
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleReportClick = async (reportId) => {
    const res = await authedFetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (activeTab === 'sites') {
    return (
      <div className="container mx-auto px-4 py-6">
        <SiteManagement user={user} sites={sites} onRefresh={onRefreshSites} />
      </div>
    );
  }

  if (activeTab === 'operators') {
    return (
      <div className="container mx-auto px-4 py-6">
        <OperatorManagement user={user} sites={sites} onRefresh={onRefreshSites} />
      </div>
    );
  }

  if (activeTab === 'fuel-prices') {
    return <OwnerFuelPriceManagement user={user} sites={sites} />;
  }

  if (activeTab === 'pivot') {
    return <div className="container mx-auto px-4 py-6"><MonthlyReportsPivot user={user} sites={sites} /></div>;
  }

  if (activeTab === 'submissions') {
    return <BankingSubmissions user={user} sites={sites} currentUserRole="owner" />;
  }

  if (activeTab === 'fuel-inventory') {
    return <FuelInventoryDashboard user={user} sites={sites} />;
  }

  if (activeTab === 'live-prices') {
    return <LiveFuelPricesDashboard />;
  }

  if (activeTab === 'executive') {
    return <OwnerExecutiveDashboard user={user} sites={sites} />;
  }

  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} canChangeStatus={false} user={user} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
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
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
              </div>
              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {/* Owner has Daily Summary only — ViewToggle intentionally not rendered here */}
              <ExportDialog sites={sites} siteIds={siteIds} role={user?.role} />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <>
          {/* Morning Brief — promoted to top of Dashboard tab (Section 5e),
              collapsible with state persisted in localStorage. */}
          <Card className="border border-border/50 shadow-sm">
            <CardHeader className="cursor-pointer" onClick={toggleBrief}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Fuel className="h-5 w-5" /> Morning Price Brief
                  </CardTitle>
                  <CardDescription>Quick pricing overview across all your sites</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={briefCollapsed ? 'Expand' : 'Collapse'}>
                  {briefCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {!briefCollapsed && (
              <CardContent>
                <MorningPriceBrief sites={sites} selectedDate={dateRange.end} />
              </CardContent>
            )}
          </Card>

          {/* HealthStrip — at-a-glance ops summary above the KPI cards. */}
          {stats && <HealthStrip stats={stats} lastLoaded={lastLoaded} />}

          {stats && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                <StatCard title="Total Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} subValue={`${stats.totalReports} reports`} color="green" />
                <StatCard title="Total Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
                <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="purple" />
                <StatCard title="Total Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="cyan" />
                <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
                <StatCard title="Banking" value={formatCurrency(stats.totalBanking)} icon={Calculator} color="orange" />
              </div>

              {(stats.topPerformingSite || stats.lowestPerformingSite) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {stats.topPerformingSite && (
                    <Card className="border border-border/50 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-600 mb-1">🏆 Top Performing Site</p>
                            <h3 className="text-xl font-bold text-gray-900">{stats.topPerformingSite.siteName}</h3>
                            <p className="text-sm text-gray-500">{stats.topPerformingSite.siteCode}</p>
                            <p className="text-2xl font-bold text-green-600 mt-3">{formatCurrency(stats.topPerformingSite.revenue)}</p>
                            <p className="text-xs text-gray-500">Total Revenue</p>
                          </div>
                          <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {stats.lowestPerformingSite && (
                    <Card className="border border-border/50 shadow-sm bg-gradient-to-br from-orange-50 to-amber-50">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-orange-600 mb-1">📊 Lowest Performing Site</p>
                            <h3 className="text-xl font-bold text-gray-900">{stats.lowestPerformingSite.siteName}</h3>
                            <p className="text-sm text-gray-500">{stats.lowestPerformingSite.siteCode}</p>
                            <p className="text-2xl font-bold text-orange-600 mt-3">{formatCurrency(stats.lowestPerformingSite.revenue)}</p>
                            <p className="text-xs text-gray-500">Total Revenue</p>
                          </div>
                          <AlertCircle className="h-8 w-8 text-orange-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}

          <FuelPriceComparisonSection sites={sites} siteIds={siteIds} />

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" /> Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      className="text-xs"
                    />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(d) => formatDate(d)} />
                    <Line type="monotone" dataKey="revenue" stroke="url(#colorRevenue)" strokeWidth={3} dot={false} />
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" /> Site Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={siteStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="siteCode" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="fuelSales" name="Fuel" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shopSales" name="Shop" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Daily Summaries
              </CardTitle>
              <CardDescription>
                {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dailyRollups.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No reports found</p>
                ) : (
                  dailyRollups.map((rollup) => (
                    <DailyRollupRow
                      key={`${rollup.site_id}_${rollup.date}`}
                      rollup={rollup}
                      onClick={handleReportClick}
                      expanded={expandedRollup === `${rollup.site_id}_${rollup.date}`}
                      onToggle={() => setExpandedRollup(
                        expandedRollup === `${rollup.site_id}_${rollup.date}`
                          ? null
                          : `${rollup.site_id}_${rollup.date}`
                      )}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
