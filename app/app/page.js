'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Building2, Fuel, ShoppingCart, DollarSign, Droplets, LogOut, FileText, CheckCircle, Clock,
  User, Users, ChevronRight, TrendingUp, BarChart3, Eye, ClipboardList, Loader2, Plus, Settings,
  MapPin, AlertTriangle, Pencil, Trash2, UserPlus, Building, Calculator, Download, Calendar,
  Layers, ChevronDown, ChevronUp, GripVertical, X, Save, RefreshCw, AlertCircle, Mail
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

// Extracted leaf components (Phase B of dashboard monolith refactor)
import MorningPriceBrief from '@/components/shared/morning-price-brief';
import BankingFormulaBuilder from '@/components/operator/banking/banking-formula-builder';
// Extracted feature managers (Phase C)
import BankingManagement from '@/components/operator/banking/banking-management';
import FieldConfiguration from '@/components/operator/field-configuration';
import OperatorManagement from '@/components/owner/operator-management';
import StaffAccessManagement from '@/components/operator/staff-access-management';
// Extracted shared UI primitives (Phase D)
import Header from '@/components/shared/header';
import StatCard from '@/components/shared/stat-card';
import ViewToggle from '@/components/shared/view-toggle';
import DailyRollupRow from '@/components/shared/daily-rollup-row';
import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ExportDialog from '@/components/shared/export-dialog';
// Extracted forms + role wrappers (Phase D Batch 2)
import ShiftReportForm from '@/components/staff/shift-report-form';
import StaffPriceChangeBanner from '@/components/staff/staff-price-change-banner';
import SiteManagement from '@/components/owner/site-management';
// Fuel-pricing family (Phase D Batch 2b)
import FuelPriceComparisonSection from '@/components/fuel-pricing/fuel-price-comparison-section';
import OperatorPriceChangeNotifications from '@/components/fuel-pricing/operator-price-change-notifications';
import FuelPricingManagement from '@/components/fuel-pricing/fuel-pricing-management';
import PriceChangeHistory from '@/components/fuel-pricing/price-change-history';
import OwnerFuelPriceManagement from '@/components/fuel-pricing/owner-fuel-price-management';
// authedFetch helper (used inline below + by extracted components)
import { authedFetch } from '@/lib/authed-fetch';

// Format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(value || 0);
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Format datetime
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ============== LOGIN PAGE ==============
function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter email and password'); return; }
    const success = await onLogin(email, password);
    if (!success) { setError('Invalid credentials'); }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed-supabase', { method: 'POST' });
      const data = await res.json();
      if (res.ok) { alert(`Supabase database seeded successfully! Check browser console for details.`); }
      else { alert('Seeding failed: ' + (data.error || 'Unknown error')); }
    } catch (err) { alert('Seeding failed: ' + err.message); }
    finally { setSeeding(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Fuel className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FOPS</CardTitle>
          <CardDescription>Fuel Station Shift Reporting</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full h-11 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
            </Button>
          </form>
          <Separator className="my-6" />
        </CardContent>
      </Card>
    </div>
  );
}


// ============== OWNER DASHBOARD ==============
function OwnerDashboard({ user, sites, activeTab, onRefreshSites }) {
  const [stats, setStats] = useState(null);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);
  const [siteStats, setSiteStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
  const [expandedRollup, setExpandedRollup] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    if (!siteIds) { setLoading(false); return; }
    setLoading(true);
    try {
      const [statsRes, dailyRes, shiftsRes, siteStatsRes, chartRes] = await Promise.all([
        fetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/daily-rollups?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/reports?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/site-stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/revenue-chart?siteIds=${siteIds}&days=7`)
      ]);
      
      const [statsData, dailyData, shiftsData, siteStatsData, chartDataRes] = await Promise.all([
        statsRes.json(), dailyRes.json(), shiftsRes.json(), siteStatsRes.json(), chartRes.json()
      ]);
      
      setStats(statsData);
      setDailyRollups(dailyData);
      setShiftReports(shiftsData);
      setSiteStats(siteStatsData);
      setChartData(chartDataRes);
    } catch (err) { console.error('Failed to load data:', err); }
    finally { setLoading(false); }
  }, [siteIds, dateRange]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleReportClick = async (reportId) => {
    const res = await fetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  // Sites Tab
  if (activeTab === 'sites') {
    return <div className="container mx-auto px-4 py-6"><SiteManagement user={user} sites={sites} onRefresh={onRefreshSites} /></div>;
  }

  // Operators Tab (Owner manages operators only)
  if (activeTab === 'operators') {
    return <div className="container mx-auto px-4 py-6"><OperatorManagement user={user} sites={sites} onRefresh={onRefreshSites} /></div>;
  }

  // Fuel Prices Tab
  if (activeTab === 'fuel-prices') {
    return <OwnerFuelPriceManagement user={user} sites={sites} />;
  }

  // Report Detail
  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} canChangeStatus={false} user={user} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
              </div>
              <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle viewType={viewType} setViewType={setViewType} />
              <ExportDialog sites={sites} siteIds={siteIds} />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* Morning Price Brief Panel */}
          <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Fuel className="h-5 w-5" /> Morning Price Brief
              </CardTitle>
              <CardDescription>Quick pricing overview across all your sites</CardDescription>
            </CardHeader>
            <CardContent>
              <MorningPriceBrief sites={sites} selectedDate={dateRange.to} />
            </CardContent>
          </Card>

          {/* Stats Cards */}
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
              
              {/* Top/Lowest Performing Sites */}
              {(stats.topPerformingSite || stats.lowestPerformingSite) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {stats.topPerformingSite && (
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
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
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-amber-50">
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
          
          {/* Fuel Price Comparison Section */}
          <FuelPriceComparisonSection sites={sites} siteIds={siteIds} />
          
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(d) => formatDate(d)} />
                    <Line type="monotone" dataKey="revenue" stroke="url(#colorRevenue)" strokeWidth={3} dot={false} />
                    <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card className="border-0 shadow-lg">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Site Comparison</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={siteStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="siteCode" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="fuelSales" name="Fuel" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shopSales" name="Shop" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          {/* Reports */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {viewType === 'daily' ? <Calendar className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                {viewType === 'daily' ? 'Daily Summaries' : 'Shift Reports'}
              </CardTitle>
              <CardDescription>
                {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewType === 'daily' ? (
                <div className="space-y-4">
                  {dailyRollups.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No reports found</p>
                  ) : (
                    dailyRollups.map(rollup => (
                      <DailyRollupRow
                        key={`${rollup.site_id}_${rollup.date}`}
                        rollup={rollup}
                        onClick={handleReportClick}
                        expanded={expandedRollup === `${rollup.site_id}_${rollup.date}`}
                        onToggle={() => setExpandedRollup(expandedRollup === `${rollup.site_id}_${rollup.date}` ? null : `${rollup.site_id}_${rollup.date}`)}
                      />
                    ))
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {shiftReports.map(report => (
                      <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report.id)} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============== OPERATOR DASHBOARD ==============
function OperatorDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
  const [expandedRollup, setExpandedRollup] = useState(null);
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteFilter = selectedSite === 'all' ? siteIds : selectedSite;
      const [reportsRes, dailyRes, statsRes] = await Promise.all([
        authedFetch(`/api/reports?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/daily-rollups?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`)
      ]);
      const [reportsData, dailyData, statsData] = await Promise.all([reportsRes.json(), dailyRes.json(), statsRes.json()]);
      setReports(reportsData);
      setDailyRollups(dailyData);
      setStats(statsData);
    } catch (err) { console.error('Failed to load data:', err); }
    finally { setLoading(false); }
  }, [selectedSite, dateRange, siteIds]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleStatusChange = async (reportId, status, reviewedBy) => {
    await fetch(`/api/reports/${reportId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reviewed_by_user_id: reviewedBy }) });
    setSelectedReport(prev => prev ? { ...prev, status, reviewed_by_user_id: reviewedBy } : null);
    loadData();
  };

  const handleReportClick = async (reportId) => {
    const res = await fetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (activeTab === 'staff') { return <div className="container mx-auto px-4 py-6"><StaffAccessManagement user={user} sites={sites} /></div>; }
  if (activeTab === 'pricing') { return <div className="container mx-auto px-4 py-6"><FuelPricingManagement user={user} sites={sites} /></div>; }
  if (activeTab === 'fields') { return <div className="container mx-auto px-4 py-6"><FieldConfiguration user={user} sites={sites} /></div>; }
  if (activeTab === 'banking') { return <div className="container mx-auto px-4 py-6"><BankingManagement user={user} sites={sites} /></div>; }
  if (selectedReport) { return <div className="container mx-auto px-4 py-6 max-w-4xl"><ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} onStatusChange={handleStatusChange} canChangeStatus={true} user={user} /></div>; }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Sites</SelectItem>{sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
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
          <CardDescription>{stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : viewType === 'daily' ? (
            <div className="space-y-4">
              {dailyRollups.length === 0 ? <p className="text-center text-muted-foreground py-8">No reports found</p> : dailyRollups.map(rollup => (
                <DailyRollupRow key={`${rollup.site_id}_${rollup.date}`} rollup={rollup} onClick={handleReportClick} expanded={expandedRollup === `${rollup.site_id}_${rollup.date}`} onToggle={() => setExpandedRollup(expandedRollup === `${rollup.site_id}_${rollup.date}` ? null : `${rollup.site_id}_${rollup.date}`)} />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[400px]"><div className="space-y-2">{reports.map(report => <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report.id)} />)}</div></ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== STAFF DASHBOARD ==============

function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      // Staff view: backend derives scope from the JWT (returns only this
      // user's submitted reports). No need to send userId in the query.
      const res = await authedFetch('/api/reports');
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load reports:', err); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (selectedReport) { return <div className="container mx-auto px-4 py-6 max-w-4xl"><ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} canChangeStatus={false} user={user} /></div>; }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Price Change Banner */}
      <StaffPriceChangeBanner user={user} />
      
      {activeTab === 'submit' && <ShiftReportForm user={user} sites={sites} onSuccess={loadReports} />}
      {activeTab === 'history' && (
        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle>My Submitted Reports</CardTitle><CardDescription>View your recent shift report submissions</CardDescription></CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : reports.length === 0 ? <p className="text-center text-muted-foreground py-8">No reports submitted yet</p> : (
              <ScrollArea className="h-[400px]"><div className="space-y-2">{reports.map(report => <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report)} />)}</div></ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== MAIN APP ==============
export default function App() {
  const router = useRouter();
  
  // Start with null to avoid hydration mismatch
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mounted, setMounted] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  // Initialize from localStorage only on client side (runs once on mount)
  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');
    
    if (savedUser && savedSites) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setSites(JSON.parse(savedSites));
        setActiveTab(parsedUser.role === 'staff' ? 'submit' : 'dashboard');
        setMounted(true);
      } catch (e) {
        // Invalid data in localStorage
        console.error('Failed to parse user data:', e);
        localStorage.removeItem('workflowlite_user');
        localStorage.removeItem('workflowlite_sites');
        if (!hasRedirected) {
          setHasRedirected(true);
          router.replace('/login');
        }
      }
    } else {
      // No user data, redirect to login (only once)
      if (!hasRedirected) {
        setHasRedirected(true);
        router.replace('/login');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array - run only once on mount

  // Global escalation polling - runs every 5 minutes
  useEffect(() => {
    if (!mounted || !user) return;

    const checkEscalations = async () => {
      try {
        await fetch('/api/fuel-prices/escalate', { method: 'POST' });
      } catch (err) {
        console.error('Escalation check failed:', err);
      }
    };

    // Run immediately on mount
    checkEscalations();

    // Then every 5 minutes
    const interval = setInterval(checkEscalations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mounted, user]);


  const handleLogin = async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSites(data.sites);
        setActiveTab(data.user.role === 'staff' ? 'submit' : 'dashboard');
        localStorage.setItem('workflowlite_user', JSON.stringify(data.user));
        localStorage.setItem('workflowlite_sites', JSON.stringify(data.sites));
        return true;
      }
      return false;
    } catch (err) { console.error('Login failed:', err); return false; }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    // 1) Clear local state + localStorage IMMEDIATELY so UI never hangs.
    try {
      setUser(null);
      setSites([]);
      localStorage.removeItem('workflowlite_user');
      localStorage.removeItem('workflowlite_sites');
    } catch {}

    // 2) Best-effort: sign out of Supabase + clear server session. Don't
    //    block on these — the redirect must happen even if they fail.
    try {
      // Fire-and-forget; capped at ~2s so a slow API never delays the user.
      const supabasePromise = (async () => {
        try {
          const { createBrowserClient } = await import('@/lib/supabase');
          const sb = createBrowserClient();
          await sb.auth.signOut();
        } catch {}
      })();
      const apiPromise = fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      Promise.race([
        Promise.allSettled([supabasePromise, apiPromise]),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]).finally(() => {});
    } catch {}

    // 3) Redirect immediately. window.location.href forces a full reload so
    //    every piece of React state, cached fetches, and stale auth tokens
    //    are flushed.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const refreshSites = async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/sites');
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
      if (Array.isArray(data)) {
        localStorage.setItem('workflowlite_sites', JSON.stringify(data));
      }
    } catch (err) { console.error('Failed to refresh sites:', err); }
  };

  // Show loading while initializing and redirecting  
  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      {user.role === 'staff' && <StaffDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'operator' && <OperatorDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'owner' && <OwnerDashboard user={user} sites={sites} activeTab={activeTab} onRefreshSites={refreshSites} />}
    </div>
  );
}
