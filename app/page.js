'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Building2,
  Fuel,
  ShoppingCart,
  DollarSign,
  Droplets,
  LogOut,
  FileText,
  CheckCircle,
  Clock,
  Calendar,
  User,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Eye,
  ClipboardList,
  Loader2
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

// Format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2
  }).format(value || 0);
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// Format datetime
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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
    
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    
    const success = await onLogin(email, password);
    if (!success) {
      setError('Invalid credentials');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Database seeded! Created ${data.counts.users} users, ${data.counts.sites} sites, ${data.counts.reports} reports.`);
      } else {
        alert('Seeding failed: ' + data.error);
      }
    } catch (err) {
      alert('Seeding failed: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
            <Fuel className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">WorkflowLite</CardTitle>
          <CardDescription>Fuel Station Shift Reporting</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
          
          <Separator className="my-6" />
          
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Demo Credentials</p>
            <div className="grid gap-2 text-xs">
              <div className="bg-muted/50 p-2 rounded flex justify-between">
                <span className="font-medium">Owner:</span>
                <span>owner@demo.com / demo123</span>
              </div>
              <div className="bg-muted/50 p-2 rounded flex justify-between">
                <span className="font-medium">Operator:</span>
                <span>operator@demo.com / demo123</span>
              </div>
              <div className="bg-muted/50 p-2 rounded flex justify-between">
                <span className="font-medium">Staff:</span>
                <span>staff@demo.com / demo123</span>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2" 
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding...</>
              ) : (
                'Seed Demo Data'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== HEADER ==============
function Header({ user, onLogout }) {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Fuel className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg">WorkflowLite</h1>
            <p className="text-xs text-muted-foreground capitalize">{user.role} Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Button variant="outline" size="icon" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

// ============== STAT CARD ==============
function StatCard({ title, value, icon: Icon, subValue, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600'
  };
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============== REPORT ROW ==============
function ReportRow({ report, onClick }) {
  return (
    <div 
      className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{report.site_name}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(report.date)} • {report.shift_type} Shift
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-medium text-sm">{formatCurrency(report.total_revenue)}</p>
          <p className="text-xs text-muted-foreground">{report.staff_name}</p>
        </div>
        <Badge variant={report.status === 'reviewed' ? 'default' : 'secondary'}>
          {report.status === 'reviewed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
          {report.status}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// ============== REPORT DETAIL ==============
function ReportDetail({ report, onClose, onStatusChange, canChangeStatus }) {
  if (!report) return null;
  
  const fields = [
    { label: 'Total Sales', value: formatCurrency(report.total_sales), icon: DollarSign },
    { label: 'Fuel Sales', value: formatCurrency(report.fuel_sales), icon: Fuel },
    { label: 'Shop Sales', value: formatCurrency(report.shop_sales), icon: ShoppingCart },
    { label: 'Total Litres', value: `${(report.total_litres || 0).toLocaleString()} L`, icon: Droplets },
    { label: 'EFTPOS', value: formatCurrency(report.eftpos) },
    { label: 'Motorpass', value: formatCurrency(report.motorpass) },
    { label: 'Cash', value: formatCurrency(report.cash) },
    { label: 'Sunstate Account', value: formatCurrency(report.sunstate_account) },
    { label: 'Beverages', value: formatCurrency(report.beverages) },
    { label: 'Hot Food', value: formatCurrency(report.hot_food) },
    { label: 'Drive Offs', value: formatCurrency(report.drive_offs) },
    { label: 'Dips', value: formatCurrency(report.dips) },
  ];
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{report.site_name}</CardTitle>
            <CardDescription>{report.site_code}</CardDescription>
          </div>
          <Badge variant={report.status === 'reviewed' ? 'default' : 'secondary'} className="text-sm">
            {report.status === 'reviewed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium text-sm">{formatDate(report.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shift</p>
            <p className="font-medium text-sm">{report.shift_type}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted By</p>
            <p className="font-medium text-sm">{report.staff_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted At</p>
            <p className="font-medium text-sm">{formatDateTime(report.submitted_at)}</p>
          </div>
        </div>
        
        {/* Revenue Summary */}
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm font-medium text-primary mb-1">Total Revenue</p>
          <p className="text-3xl font-bold">{formatCurrency(report.total_revenue)}</p>
        </div>
        
        {/* Detail Fields */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {fields.map((field, i) => (
            <div key={i} className="space-y-1">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="font-medium">{field.value}</p>
            </div>
          ))}
        </div>
        
        {/* Notes */}
        {report.notes && (
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{report.notes}</p>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          {canChangeStatus && report.status === 'pending' && (
            <Button onClick={() => onStatusChange(report.id, 'reviewed')} className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark as Reviewed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============== SHIFT REPORT FORM ==============
function ShiftReportForm({ user, sites, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    site_id: sites[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Morning',
    total_sales: '',
    fuel_sales: '',
    total_litres: '',
    eftpos: '',
    motorpass: '',
    cash: '',
    shop_sales: '',
    beverages: '',
    hot_food: '',
    sunstate_account: '',
    drive_offs: '',
    dips: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.site_id) newErrors.site_id = 'Site is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (!form.shift_type) newErrors.shift_type = 'Shift type is required';
    if (!form.fuel_sales) newErrors.fuel_sales = 'Fuel sales is required';
    if (!form.shop_sales) newErrors.shop_sales = 'Shop sales is required';
    if (!form.dips) newErrors.dips = 'Dips reading is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          submitted_by_user_id: user.id
        })
      });
      
      if (res.ok) {
        setSuccess(true);
        setForm(prev => ({
          ...prev,
          total_sales: '',
          fuel_sales: '',
          total_litres: '',
          eftpos: '',
          motorpass: '',
          cash: '',
          shop_sales: '',
          beverages: '',
          hot_food: '',
          sunstate_account: '',
          drive_offs: '',
          dips: '',
          notes: ''
        }));
        onSuccess?.();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit report');
      }
    } catch (err) {
      alert('Failed to submit report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputFields = [
    { name: 'fuel_sales', label: 'Fuel Sales ($)', required: true },
    { name: 'total_litres', label: 'Total Litres' },
    { name: 'shop_sales', label: 'Shop Sales ($)', required: true },
    { name: 'beverages', label: 'Beverages ($)' },
    { name: 'hot_food', label: 'Hot Food ($)' },
    { name: 'eftpos', label: 'EFTPOS ($)' },
    { name: 'motorpass', label: 'Motorpass ($)' },
    { name: 'cash', label: 'Cash ($)' },
    { name: 'sunstate_account', label: 'Sunstate Account ($)' },
    { name: 'drive_offs', label: 'Drive Offs ($)' },
    { name: 'dips', label: 'Dips ($)', required: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Submit Shift Report
        </CardTitle>
        <CardDescription>Complete the form below to submit your shift report</CardDescription>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Report submitted successfully!</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Site & Shift Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Site *</Label>
              <Select value={form.site_id} onValueChange={(v) => handleChange('site_id', v)}>
                <SelectTrigger className={errors.site_id ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.site_id && <p className="text-xs text-red-500">{errors.site_id}</p>}
            </div>
            
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input 
                type="date" 
                value={form.date}
                onChange={(e) => handleChange('date', e.target.value)}
                className={errors.date ? 'border-red-500' : ''}
              />
              {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
            </div>
            
            <div className="space-y-2">
              <Label>Shift Type *</Label>
              <Select value={form.shift_type} onValueChange={(v) => handleChange('shift_type', v)}>
                <SelectTrigger className={errors.shift_type ? 'border-red-500' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Evening">Evening</SelectItem>
                  <SelectItem value="Night">Night</SelectItem>
                </SelectContent>
              </Select>
              {errors.shift_type && <p className="text-xs text-red-500">{errors.shift_type}</p>}
            </div>
          </div>
          
          <Separator />
          
          {/* Sales Fields */}
          <div>
            <h3 className="font-medium mb-4">Sales & Payments</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {inputFields.map(field => (
                <div key={field.name} className="space-y-2">
                  <Label className="text-sm">
                    {field.label} {field.required && '*'}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form[field.name]}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className={errors[field.name] ? 'border-red-500' : ''}
                  />
                  {errors[field.name] && (
                    <p className="text-xs text-red-500">{errors[field.name]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <Separator />
          
          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes / Comments</Label>
            <Textarea
              placeholder="Add any notes about this shift..."
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>
          
          <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              <><FileText className="mr-2 h-4 w-4" /> Submit Report</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ============== STAFF DASHBOARD ==============
function StaffDashboard({ user, sites }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('submit');

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports?userId=${user.id}`);
      const data = await res.json();
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          canChangeStatus={false}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="submit">
            <ClipboardList className="h-4 w-4 mr-2" />
            Submit Report
          </TabsTrigger>
          <TabsTrigger value="history">
            <FileText className="h-4 w-4 mr-2" />
            My Reports
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="submit">
          <ShiftReportForm
            user={user}
            sites={sites}
            onSuccess={() => {
              loadReports();
            }}
          />
        </TabsContent>
        
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>My Submitted Reports</CardTitle>
              <CardDescription>View your recent shift report submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : reports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No reports submitted yet</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {reports.map(report => (
                      <ReportRow
                        key={report.id}
                        report={report}
                        onClick={() => handleReportClick(report)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== OPERATOR DASHBOARD ==============
function OperatorDashboard({ user, sites }) {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteFilter = selectedSite === 'all' ? siteIds : selectedSite;
      
      const [reportsRes, statsRes] = await Promise.all([
        fetch(`/api/reports?siteId=${selectedSite === 'all' ? '' : selectedSite}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`)
      ]);
      
      const [reportsData, statsData] = await Promise.all([
        reportsRes.json(),
        statsRes.json()
      ]);
      
      // Filter reports by user's sites
      const filteredReports = reportsData.filter(r => sites.some(s => s.id === r.site_id));
      setReports(filteredReports);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, dateRange, siteIds, sites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusChange = async (reportId, status) => {
    try {
      await fetch(`/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setSelectedReport(prev => prev ? { ...prev, status } : null);
      loadData();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onStatusChange={handleStatusChange}
          canChangeStatus={true}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Site</Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-[150px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Shop Sales"
            value={formatCurrency(stats.totalShopSales)}
            icon={ShoppingCart}
            color="green"
          />
          <StatCard
            title="Fuel Sales"
            value={formatCurrency(stats.totalFuelSales)}
            icon={Fuel}
            color="blue"
          />
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
            icon={DollarSign}
            color="primary"
          />
          <StatCard
            title="Total Dips"
            value={formatCurrency(stats.totalDips)}
            icon={Droplets}
            color="purple"
          />
        </div>
      )}
      
      {/* Reports Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Shift Reports</CardTitle>
              <CardDescription>
                {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reports found</p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {reports.map(report => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    onClick={() => handleReportClick(report)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== OWNER DASHBOARD ==============
function OwnerDashboard({ user, sites }) {
  const [stats, setStats] = useState(null);
  const [siteStats, setSiteStats] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, siteStatsRes, reportsRes, chartRes] = await Promise.all([
        fetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/site-stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/reports?startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/revenue-chart?siteIds=${siteIds}&days=7`)
      ]);
      
      const [statsData, siteStatsData, reportsData, chartDataRes] = await Promise.all([
        statsRes.json(),
        siteStatsRes.json(),
        reportsRes.json(),
        chartRes.json()
      ]);
      
      setStats(statsData);
      setSiteStats(siteStatsData);
      // Filter and limit recent reports
      const filtered = reportsData.filter(r => sites.some(s => s.id === r.site_id)).slice(0, 10);
      setRecentReports(filtered);
      setChartData(chartDataRes);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange, sites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  // Site Detail View
  if (selectedSite) {
    return (
      <SiteDetailView
        site={selectedSite}
        dateRange={dateRange}
        onBack={() => setSelectedSite(null)}
        onReportClick={handleReportClick}
      />
    );
  }

  // Report Detail View
  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          canChangeStatus={false}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-[150px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={loadData}>
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Shop Sales"
                value={formatCurrency(stats.totalShopSales)}
                icon={ShoppingCart}
                subValue={`${stats.totalReports} reports`}
                color="green"
              />
              <StatCard
                title="Total Fuel Sales"
                value={formatCurrency(stats.totalFuelSales)}
                icon={Fuel}
                color="blue"
              />
              <StatCard
                title="Total Revenue"
                value={formatCurrency(stats.totalRevenue)}
                icon={DollarSign}
                color="primary"
              />
              <StatCard
                title="Total Dips"
                value={formatCurrency(stats.totalDips)}
                icon={Droplets}
                color="purple"
              />
            </div>
          )}
          
          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Revenue Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Revenue Trend (7 Days)
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
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(d) => formatDate(d)}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            {/* Site Comparison Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Site Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={siteStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="siteCode" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="fuelSales" name="Fuel Sales" fill="hsl(var(--chart-1))" />
                    <Bar dataKey="shopSales" name="Shop Sales" fill="hsl(var(--chart-2))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          {/* Site Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Site Performance
              </CardTitle>
              <CardDescription>Click on a site to view detailed reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Site</th>
                      <th className="text-right py-3 px-2 font-medium">Shop Sales</th>
                      <th className="text-right py-3 px-2 font-medium">Fuel Sales</th>
                      <th className="text-right py-3 px-2 font-medium">Total Revenue</th>
                      <th className="text-right py-3 px-2 font-medium">Dips</th>
                      <th className="text-right py-3 px-2 font-medium">Reports</th>
                      <th className="py-3 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteStats.map(site => (
                      <tr 
                        key={site.siteId} 
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedSite(sites.find(s => s.id === site.siteId))}
                      >
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium">{site.siteName}</p>
                            <p className="text-xs text-muted-foreground">{site.siteCode}</p>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">{formatCurrency(site.shopSales)}</td>
                        <td className="text-right py-3 px-2">{formatCurrency(site.fuelSales)}</td>
                        <td className="text-right py-3 px-2 font-medium">{formatCurrency(site.totalRevenue)}</td>
                        <td className="text-right py-3 px-2">{formatCurrency(site.dips)}</td>
                        <td className="text-right py-3 px-2">{site.reportCount}</td>
                        <td className="py-3 px-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          
          {/* Recent Reports */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Reports
              </CardTitle>
              <CardDescription>Latest shift report submissions across all sites</CardDescription>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No reports found</p>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {recentReports.map(report => (
                      <ReportRow
                        key={report.id}
                        report={report}
                        onClick={() => handleReportClick(report)}
                      />
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

// ============== SITE DETAIL VIEW ==============
function SiteDetailView({ site, dateRange, onBack, onReportClick }) {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localDateRange, setLocalDateRange] = useState(dateRange);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, statsRes] = await Promise.all([
        fetch(`/api/reports?siteId=${site.id}&startDate=${localDateRange.start}&endDate=${localDateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${site.id}&startDate=${localDateRange.start}&endDate=${localDateRange.end}`)
      ]);
      
      const [reportsData, statsData] = await Promise.all([
        reportsRes.json(),
        statsRes.json()
      ]);
      
      setReports(reportsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load site data:', err);
    } finally {
      setLoading(false);
    }
  }, [site.id, localDateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Back Button & Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Portfolio
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <p className="text-muted-foreground">{site.code} • {site.location}</p>
        </div>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={localDateRange.start}
                onChange={(e) => setLocalDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={localDateRange.end}
                onChange={(e) => setLocalDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-[150px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Shop Sales"
                value={formatCurrency(stats.totalShopSales)}
                icon={ShoppingCart}
                color="green"
              />
              <StatCard
                title="Fuel Sales"
                value={formatCurrency(stats.totalFuelSales)}
                icon={Fuel}
                color="blue"
              />
              <StatCard
                title="Total Revenue"
                value={formatCurrency(stats.totalRevenue)}
                icon={DollarSign}
                color="primary"
              />
              <StatCard
                title="Dips"
                value={formatCurrency(stats.totalDips)}
                icon={Droplets}
                color="purple"
              />
            </div>
          )}
          
          {/* Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Reports</CardTitle>
              <CardDescription>
                {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No reports found for this period</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {reports.map(report => (
                      <ReportRow
                        key={report.id}
                        report={report}
                        onClick={() => onReportClick(report)}
                      />
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

// ============== MAIN APP ==============
export default function App() {
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Check for saved session
  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');
    if (savedUser && savedSites) {
      setUser(JSON.parse(savedUser));
      setSites(JSON.parse(savedSites));
    }
    setInitialized(true);
  }, []);

  const handleLogin = async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSites(data.sites);
        localStorage.setItem('workflowlite_user', JSON.stringify(data.user));
        localStorage.setItem('workflowlite_sites', JSON.stringify(data.sites));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Login failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setSites([]);
    localStorage.removeItem('workflowlite_user');
    localStorage.removeItem('workflowlite_sites');
  };

  // Show loading while checking session
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginPage onLogin={handleLogin} loading={loading} />;
  }

  // Render role-based dashboard
  return (
    <div className="min-h-screen bg-background">
      <Header user={user} onLogout={handleLogout} />
      
      {user.role === 'staff' && (
        <StaffDashboard user={user} sites={sites} />
      )}
      
      {user.role === 'operator' && (
        <OperatorDashboard user={user} sites={sites} />
      )}
      
      {user.role === 'owner' && (
        <OwnerDashboard user={user} sites={sites} />
      )}
    </div>
  );
}
