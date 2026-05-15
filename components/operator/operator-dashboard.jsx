'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Fuel, ShoppingCart, DollarSign, Droplets, Loader2, AlertTriangle,
} from 'lucide-react';

import StatCard from '@/components/shared/stat-card';
import ViewToggle from '@/components/shared/view-toggle';
import DailyRollupRow from '@/components/shared/daily-rollup-row';
import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ExportDialog from '@/components/shared/export-dialog';
import StaffAccessManagement from '@/components/operator/staff-access-management';
import BankingManagement from '@/components/operator/banking/banking-management';
import FieldConfiguration from '@/components/operator/field-configuration';
import FuelPricingManagement from '@/components/fuel-pricing/fuel-pricing-management';
import BankingSubmissions from '@/components/shared/banking-submissions';
import { formatCurrency } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * OperatorDashboard — Operator-facing dashboard. Shows site-scoped KPIs and
 * shift / daily rollup lists, and routes to Staff / Fuel-Pricing / Form
 * Fields / Banking sub-tabs based on the parent's activeTab. Extracted
 * from /app/app/app/page.js (Phase D Batch 2c).
 */
export default function OperatorDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
  const [expandedRollup, setExpandedRollup] = useState(null);
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map((s) => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteFilter = selectedSite === 'all' ? siteIds : selectedSite;
      const [reportsRes, dailyRes, statsRes] = await Promise.all([
        authedFetch(`/api/reports?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/daily-rollups?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
      ]);
      const [reportsData, dailyData, statsData] = await Promise.all([
        reportsRes.json(), dailyRes.json(), statsRes.json(),
      ]);
      setReports(Array.isArray(reportsData) ? reportsData : []);
      setDailyRollups(Array.isArray(dailyData) ? dailyData : []);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, dateRange, siteIds]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleStatusChange = async (reportId, status, reviewedBy) => {
    await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewed_by_user_id: reviewedBy }),
    });
    setSelectedReport((prev) => (prev ? { ...prev, status, reviewed_by_user_id: reviewedBy } : null));
    loadData();
  };

  const handleReportClick = async (reportId) => {
    const res = await fetch(`/api/reports/${reportId}`);
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
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="w-[150px]"
              />
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle viewType={viewType} setViewType={setViewType} />
              <ExportDialog sites={sites} siteIds={siteIds} />
            </div>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} color="green" />
          <StatCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="purple" />
          <StatCard title="Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="cyan" />
          <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
        </div>
      )}

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>{viewType === 'daily' ? 'Daily Summaries' : 'Shift Reports'}</CardTitle>
          <CardDescription>
            {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
