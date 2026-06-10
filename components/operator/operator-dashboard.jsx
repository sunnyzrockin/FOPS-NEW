'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pre-existing false-positive: async click handlers / setState in click flow */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Fuel, ShoppingCart, DollarSign, Droplets, Loader2, AlertTriangle,
} from 'lucide-react';

import StatCard from '@/components/shared/stat-card';
import HealthStrip from '@/components/shared/health-strip';
import ViewToggle from '@/components/shared/view-toggle';
import SiteFilter from '@/components/shared/site-filter';
import AnalyticsExplorer from '@/components/shared/analytics-explorer';
import DailyRollupRow from '@/components/shared/daily-rollup-row';
import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ExportDialog from '@/components/shared/export-dialog';
import StaffAccessManagement from '@/components/operator/staff-access-management';
import BankingManagement from '@/components/operator/banking/banking-management';
import FieldConfiguration from '@/components/operator/field-configuration';
import FuelPricingManagement from '@/components/fuel-pricing/fuel-pricing-management';
import BankingSubmissions from '@/components/shared/banking-submissions';
import DipsManagement from '@/components/operator/dips-management';
import WetstockReconciliation from '@/components/shared/wetstock-reconciliation';
import FuelMargin from '@/components/shared/fuel-margin';
import { formatCurrency } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * OperatorDashboard — Operator-facing dashboard. Shows site-scoped KPIs
 * and shift / daily rollup lists, and routes to Staff / Fuel-Pricing /
 * Form Fields / Banking sub-tabs based on the parent's activeTab. The
 * Operator can toggle between Daily Summary and Shift Reports (the
 * ViewToggle is NOT shown to Owners — they're locked to Daily Summary).
 */
export default function OperatorDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
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

  const siteIds = (selectedSiteIds.length === 0
    ? sites.map((s) => s.id)
    : selectedSiteIds
  ).join(',');

  const loadData = useCallback(async () => {
    if (!siteIds) { setLoading(false); return; }
    setLoading(true);
    try {
      const [reportsRes, dailyRes, statsRes] = await Promise.all([
        authedFetch(`/api/reports?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/daily-rollups?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
      ]);
      const [reportsData, dailyData, statsData] = await Promise.all([
        reportsRes.json(), dailyRes.json(), statsRes.json(),
      ]);
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setDailyRollups(Array.isArray(dailyData) ? dailyData : []);
      setStats(statsData);
      setLastLoaded(Date.now());
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleStatusChange = async (reportId, status, reviewedBy) => {
    await authedFetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewed_by_user_id: reviewedBy }),
    });
    setSelectedReport((prev) => (prev ? { ...prev, status, reviewed_by_user_id: reviewedBy } : null));
    loadData();
  };

  const handleReportClick = async (reportId) => {
    const res = await authedFetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (activeTab === 'staff') {
    return <div className="container mx-auto px-4 py-6"><StaffAccessManagement user={user} sites={sites} /></div>;
  }
  if (activeTab === 'pricing') {
    return <div className="container mx-auto px-4 py-6"><FuelPricingManagement user={user} sites={sites} /></div>;
  }
  if (activeTab === 'fields') {
    return <div className="container mx-auto px-4 py-6"><FieldConfiguration user={user} sites={sites} /></div>;
  }
  if (activeTab === 'banking') {
    return <div className="container mx-auto px-4 py-6"><BankingManagement user={user} sites={sites} /></div>;
  }
  if (activeTab === 'submissions') {
    return <BankingSubmissions user={user} sites={sites} currentUserRole="operator" />;
  }
  if (activeTab === 'fuel-inventory') {
    return <div className="container mx-auto px-4 py-6"><DipsManagement user={user} sites={sites} /></div>;
  }
  if (activeTab === 'wetstock') {
    return <WetstockReconciliation sites={sites} />;
  }
  if (activeTab === 'fuel-margin') {
    return <FuelMargin sites={sites} user={user} />;
  }
  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onStatusChange={handleStatusChange}
          canChangeStatus={true}
          user={user}
        />
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
                <Input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="w-[150px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="w-[150px]"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle viewType={viewType} setViewType={setViewType} />
              <ExportDialog sites={sites} siteIds={siteIds} role={user?.role} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HealthStrip — at-a-glance ops summary above the KPI cards. */}
      {stats && <HealthStrip stats={stats} lastLoaded={lastLoaded} />}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} color="green" />
          <StatCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="purple" />
          <StatCard title="Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="cyan" />
          <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
        </div>
      )}

      {/* Analytics Explorer — operator-scoped aggregate view of the same data.
          /api/dashboard/timeseries already intersects siteIds with
          getAllowedSiteIds, so the operator can never see foreign sites. */}
      <AnalyticsExplorer siteIds={siteIds} sites={sites} dateRange={dateRange} />

      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>{viewType === 'daily' ? 'Daily Summaries' : 'Shift Reports'}</CardTitle>
          <CardDescription>
            {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
            </div>
          ) : viewType === 'daily' ? (
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
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report.id)} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
