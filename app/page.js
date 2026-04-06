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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
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
  User,
  Users,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Eye,
  ClipboardList,
  Loader2,
  Plus,
  Settings,
  MapPin,
  AlertTriangle,
  Pencil,
  Trash2,
  UserPlus,
  Building
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
function Header({ user, onLogout, activeTab, setActiveTab }) {
  const tabs = user.role === 'owner' 
    ? [{ id: 'dashboard', label: 'Dashboard' }, { id: 'sites', label: 'Sites' }, { id: 'users', label: 'Users & Access' }]
    : user.role === 'operator'
    ? [{ id: 'dashboard', label: 'Dashboard' }, { id: 'staff', label: 'Staff Access' }]
    : [{ id: 'submit', label: 'Submit Report' }, { id: 'history', label: 'My Reports' }];

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
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
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
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
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600'
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
function ReportDetail({ report, onClose, onStatusChange, canChangeStatus, user }) {
  if (!report) return null;
  
  const fields = [
    { label: 'Total Sales', value: formatCurrency(report.total_sales), icon: DollarSign },
    { label: 'Fuel Sales', value: formatCurrency(report.fuel_sales), icon: Fuel },
    { label: 'Shop Sales', value: formatCurrency(report.shop_sales), icon: ShoppingCart },
    { label: 'Total Litres', value: `${(report.total_litres || 0).toLocaleString()} L`, icon: Droplets },
    { label: 'EFTPOS', value: formatCurrency(report.eftpos) },
    { label: 'Motorpass', value: formatCurrency(report.motorpass) },
    { label: 'Cash', value: formatCurrency(report.cash) },
    { label: 'Accounts', value: formatCurrency(report.accounts) },
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
        
        {/* Difference/Variance Placeholder */}
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-sm font-medium text-orange-700 mb-1">Difference / Variance</p>
          <p className="text-lg font-medium text-orange-600">
            {report.difference_value !== null ? formatCurrency(report.difference_value) : 'Formula pending'}
          </p>
          <p className="text-xs text-orange-500 mt-1">This field will be calculated once formula is provided</p>
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
        
        {/* Review Info */}
        {report.status === 'reviewed' && report.reviewed_by_name && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-700 mb-1">Reviewed By</p>
            <p className="text-sm font-medium text-green-800">{report.reviewed_by_name}</p>
            <p className="text-xs text-green-600">{formatDateTime(report.reviewed_at)}</p>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          {canChangeStatus && report.status === 'pending' && (
            <Button onClick={() => onStatusChange(report.id, 'reviewed', user.id)} className="flex-1">
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
    accounts: '',
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
          accounts: '',
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
    { name: 'accounts', label: 'Accounts ($)' },
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
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
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

// ============== SITE MANAGEMENT ==============
function SiteManagement({ user, sites, onRefresh }) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '' });

  const handleSubmit = async () => {
    if (!form.name || !form.code) {
      alert('Site name and code are required');
      return;
    }
    
    setLoading(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          owner_id: user.id
        })
      });
      
      if (res.ok) {
        setForm({ name: '', code: '', location: '' });
        setShowAddSite(false);
        setEditingSite(null);
        onRefresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save site');
      }
    } catch (err) {
      alert('Failed to save site: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (site) => {
    setEditingSite(site);
    setForm({ name: site.name, code: site.code, location: site.location || '' });
    setShowAddSite(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Site Management</h2>
          <p className="text-muted-foreground">Add and manage your fuel station sites</p>
        </div>
        <Dialog open={showAddSite} onOpenChange={(open) => {
          setShowAddSite(open);
          if (!open) {
            setEditingSite(null);
            setForm({ name: '', code: '', location: '' });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSite ? 'Edit Site' : 'Add New Site'}</DialogTitle>
              <DialogDescription>
                {editingSite ? 'Update site details' : 'Create a new site for your network'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Site Name *</Label>
                <Input
                  placeholder="e.g., Sunstate Fuel - Brisbane"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Site Code *</Label>
                <Input
                  placeholder="e.g., BNE-001"
                  value={form.code}
                  onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="Full address"
                  value={form.location}
                  onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingSite ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {sites.map(site => (
          <Card key={site.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{site.name}</h3>
                    <p className="text-sm text-muted-foreground">{site.code}</p>
                    {site.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />
                        {site.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={site.status === 'active' ? 'default' : 'secondary'}>
                    {site.status}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(site)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {sites.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No sites yet. Add your first site to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============== USER MANAGEMENT ==============
function UserManagement({ user, sites, onRefresh }) {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAssignSites, setShowAssignSites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', password: 'demo123' });
  const [selectedSites, setSelectedSites] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/assignments')
      ]);
      const [usersData, assignmentsData] = await Promise.all([
        usersRes.json(),
        assignmentsRes.json()
      ]);
      setUsers(usersData.filter(u => u.id !== user.id));
      setAssignments(assignmentsData);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateUser = async () => {
    if (!form.name || !form.email || !form.role) {
      alert('Name, email, and role are required');
      return;
    }
    
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      
      if (res.ok) {
        setForm({ name: '', email: '', role: 'staff', password: 'demo123' });
        setShowAddUser(false);
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create user');
      }
    } catch (err) {
      alert('Failed to create user: ' + err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  const openAssignSites = (targetUser) => {
    const userSiteIds = assignments
      .filter(a => a.user_id === targetUser.id)
      .map(a => a.site_id);
    setSelectedSites(userSiteIds);
    setShowAssignSites(targetUser);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    
    const targetUserId = showAssignSites.id;
    const currentSiteIds = assignments
      .filter(a => a.user_id === targetUserId)
      .map(a => a.site_id);
    
    // Sites to add
    const toAdd = selectedSites.filter(id => !currentSiteIds.includes(id));
    // Sites to remove
    const toRemove = assignments
      .filter(a => a.user_id === targetUserId && !selectedSites.includes(a.site_id))
      .map(a => a.id);
    
    try {
      // Add new assignments
      for (const siteId of toAdd) {
        await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: targetUserId,
            site_id: siteId,
            assigned_by_user_id: user.id
          })
        });
      }
      
      // Remove old assignments
      for (const assignmentId of toRemove) {
        await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
      }
      
      setShowAssignSites(null);
      loadData();
      onRefresh();
    } catch (err) {
      alert('Failed to update assignments');
    }
  };

  const getUserSites = (userId) => {
    return assignments
      .filter(a => a.user_id === userId)
      .map(a => a.site_name || 'Unknown');
  };

  const operators = users.filter(u => u.role === 'operator');
  const staffMembers = users.filter(u => u.role === 'staff');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Users & Site Access</h2>
          <p className="text-muted-foreground">Manage operators, staff, and site assignments</p>
        </div>
        <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a new operator or staff member</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={form.role} onValueChange={(v) => setForm(prev => ({ ...prev, role: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Default: demo123"
                  value={form.password}
                  onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleCreateUser}>Create User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Site Assignment Dialog */}
      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle>
            <DialogDescription>Select which sites this {showAssignSites?.role} can access</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {sites.map(site => (
              <div key={site.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  id={site.id}
                  checked={selectedSites.includes(site.id)}
                  onCheckedChange={(checked) => {
                    setSelectedSites(prev => 
                      checked 
                        ? [...prev, site.id]
                        : prev.filter(id => id !== site.id)
                    );
                  }}
                />
                <label htmlFor={site.id} className="flex-1 cursor-pointer">
                  <p className="font-medium text-sm">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.code}</p>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Operators */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Operators ({operators.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No operators yet</p>
          ) : (
            <div className="space-y-3">
              {operators.map(op => (
                <div key={op.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{op.name}</p>
                      <p className="text-xs text-muted-foreground">{op.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getUserSites(op.id).map((site, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{site}</Badge>
                        ))}
                        {getUserSites(op.id).length === 0 && (
                          <span className="text-xs text-muted-foreground">No sites assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(op)}>
                      <Building className="h-4 w-4 mr-1" />
                      Sites
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(op.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Staff ({staffMembers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staffMembers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No staff members yet</p>
          ) : (
            <div className="space-y-3">
              {staffMembers.map(staff => (
                <div key={staff.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getUserSites(staff.id).map((site, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{site}</Badge>
                        ))}
                        {getUserSites(staff.id).length === 0 && (
                          <span className="text-xs text-muted-foreground">No sites assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(staff)}>
                      <Building className="h-4 w-4 mr-1" />
                      Sites
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(staff.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== STAFF ACCESS (FOR OPERATOR) ==============
function StaffAccessManagement({ user, sites }) {
  const [staffUsers, setStaffUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [showAssignSites, setShowAssignSites] = useState(null);
  const [selectedSites, setSelectedSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch('/api/users?role=staff'),
        fetch('/api/assignments')
      ]);
      const [usersData, assignmentsData] = await Promise.all([
        usersRes.json(),
        assignmentsRes.json()
      ]);
      
      // Filter staff that have at least one site in common with operator
      const operatorSiteIds = sites.map(s => s.id);
      const staffWithSharedSites = usersData.filter(staff => {
        const staffSiteIds = assignmentsData
          .filter(a => a.user_id === staff.id)
          .map(a => a.site_id);
        return staffSiteIds.some(id => operatorSiteIds.includes(id)) || staffSiteIds.length === 0;
      });
      
      setStaffUsers(staffWithSharedSites);
      setAssignments(assignmentsData);
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  }, [sites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAssignSites = (staff) => {
    const staffSiteIds = assignments
      .filter(a => a.user_id === staff.id)
      .map(a => a.site_id);
    setSelectedSites(staffSiteIds.filter(id => sites.some(s => s.id === id)));
    setShowAssignSites(staff);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    
    const targetUserId = showAssignSites.id;
    const currentSiteIds = assignments
      .filter(a => a.user_id === targetUserId && sites.some(s => s.id === a.site_id))
      .map(a => a.site_id);
    
    const toAdd = selectedSites.filter(id => !currentSiteIds.includes(id));
    const toRemove = assignments
      .filter(a => a.user_id === targetUserId && sites.some(s => s.id === a.site_id) && !selectedSites.includes(a.site_id))
      .map(a => a.id);
    
    try {
      for (const siteId of toAdd) {
        await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: targetUserId,
            site_id: siteId,
            assigned_by_user_id: user.id
          })
        });
      }
      
      for (const assignmentId of toRemove) {
        await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' });
      }
      
      setShowAssignSites(null);
      loadData();
    } catch (err) {
      alert('Failed to update assignments');
    }
  };

  const getStaffSites = (staffId) => {
    return assignments
      .filter(a => a.user_id === staffId && sites.some(s => s.id === a.site_id))
      .map(a => a.site_name || 'Unknown');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Staff Access Management</h2>
        <p className="text-muted-foreground">Assign staff to your sites</p>
      </div>

      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle>
            <DialogDescription>Select which of your sites this staff member can access</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {sites.map(site => (
              <div key={site.id} className="flex items-center space-x-3 p-2 rounded hover:bg-muted/50">
                <Checkbox
                  id={site.id}
                  checked={selectedSites.includes(site.id)}
                  onCheckedChange={(checked) => {
                    setSelectedSites(prev => 
                      checked 
                        ? [...prev, site.id]
                        : prev.filter(id => id !== site.id)
                    );
                  }}
                />
                <label htmlFor={site.id} className="flex-1 cursor-pointer">
                  <p className="font-medium text-sm">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.code}</p>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff Members</CardTitle>
        </CardHeader>
        <CardContent>
          {staffUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No staff members available</p>
          ) : (
            <div className="space-y-3">
              {staffUsers.map(staff => (
                <div key={staff.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getStaffSites(staff.id).map((site, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{site}</Badge>
                        ))}
                        {getStaffSites(staff.id).length === 0 && (
                          <span className="text-xs text-muted-foreground">No sites assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openAssignSites(staff)}>
                    <Building className="h-4 w-4 mr-1" />
                    Assign Sites
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
          user={user}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {activeTab === 'submit' && (
        <ShiftReportForm
          user={user}
          sites={sites}
          onSuccess={() => {
            loadReports();
          }}
        />
      )}
      
      {activeTab === 'history' && (
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
      )}
    </div>
  );
}

// ============== OPERATOR DASHBOARD ==============
function OperatorDashboard({ user, sites, activeTab }) {
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
        fetch(`/api/reports?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`)
      ]);
      
      const [reportsData, statsData] = await Promise.all([
        reportsRes.json(),
        statsRes.json()
      ]);
      
      setReports(reportsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, dateRange, siteIds]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadData();
    }
  }, [loadData, activeTab]);

  const handleStatusChange = async (reportId, status, reviewedBy) => {
    try {
      await fetch(`/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewed_by_user_id: reviewedBy })
      });
      setSelectedReport(prev => prev ? { ...prev, status, reviewed_by_user_id: reviewedBy } : null);
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

  if (activeTab === 'staff') {
    return (
      <div className="container mx-auto px-4 py-6">
        <StaffAccessManagement user={user} sites={sites} />
      </div>
    );
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} color="green" />
          <StatCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="primary" />
          <StatCard title="Total Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="purple" />
          <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
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
function OwnerDashboard({ user, sites, activeTab, onRefreshSites }) {
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
    if (!siteIds) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const [statsRes, siteStatsRes, reportsRes, chartRes] = await Promise.all([
        fetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/site-stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/reports?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
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
      setRecentReports(reportsData.slice(0, 10));
      setChartData(chartDataRes);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [siteIds, dateRange]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadData();
    }
  }, [loadData, activeTab]);

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  // Sites Tab
  if (activeTab === 'sites') {
    return (
      <div className="container mx-auto px-4 py-6">
        <SiteManagement user={user} sites={sites} onRefresh={onRefreshSites} />
      </div>
    );
  }

  // Users Tab
  if (activeTab === 'users') {
    return (
      <div className="container mx-auto px-4 py-6">
        <UserManagement user={user} sites={sites} onRefresh={onRefreshSites} />
      </div>
    );
  }

  // Site Detail View
  if (selectedSite) {
    return (
      <SiteDetailView
        site={selectedSite}
        dateRange={dateRange}
        onBack={() => setSelectedSite(null)}
        onReportClick={handleReportClick}
        user={user}
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
          user={user}
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Total Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} subValue={`${stats.totalReports} reports`} color="green" />
              <StatCard title="Total Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
              <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="primary" />
              <StatCard title="Total Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="purple" />
              <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
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
                      <th className="text-right py-3 px-2 font-medium">Drive Offs</th>
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
                        <td className="text-right py-3 px-2">{formatCurrency(site.driveOffs)}</td>
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
function SiteDetailView({ site, dateRange, onBack, onReportClick, user }) {
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} color="green" />
              <StatCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
              <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="primary" />
              <StatCard title="Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="purple" />
              <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
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
  const [activeTab, setActiveTab] = useState('dashboard');

  // Check for saved session
  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');
    if (savedUser && savedSites) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setSites(JSON.parse(savedSites));
      // Set default tab based on role
      setActiveTab(parsedUser.role === 'staff' ? 'submit' : 'dashboard');
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
        setActiveTab(data.user.role === 'staff' ? 'submit' : 'dashboard');
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

  const refreshSites = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/sites?userId=${user.id}`);
      const data = await res.json();
      setSites(data);
      localStorage.setItem('workflowlite_sites', JSON.stringify(data));
    } catch (err) {
      console.error('Failed to refresh sites:', err);
    }
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
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {user.role === 'staff' && (
        <StaffDashboard user={user} sites={sites} activeTab={activeTab} />
      )}
      
      {user.role === 'operator' && (
        <OperatorDashboard user={user} sites={sites} activeTab={activeTab} />
      )}
      
      {user.role === 'owner' && (
        <OwnerDashboard user={user} sites={sites} activeTab={activeTab} onRefreshSites={refreshSites} />
      )}
    </div>
  );
}
