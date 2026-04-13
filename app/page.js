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
import { Switch } from '@/components/ui/switch';
import {
  Building2, Fuel, ShoppingCart, DollarSign, Droplets, LogOut, FileText, CheckCircle, Clock,
  User, Users, ChevronRight, TrendingUp, BarChart3, Eye, ClipboardList, Loader2, Plus, Settings,
  MapPin, AlertTriangle, Pencil, Trash2, UserPlus, Building, Calculator, Download, Calendar,
  Layers, ChevronDown, ChevronUp, GripVertical, X, Save, RefreshCw, AlertCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

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
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">WorkflowLite</CardTitle>
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
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Demo Credentials (Real Supabase Auth)</p>
            <div className="grid gap-2 text-xs">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-xl flex justify-between items-center"><span className="font-semibold text-blue-700">Owner:</span><span className="text-slate-600">owner@workflowlite.com / WorkflowDemo2026!</span></div>
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-xl flex justify-between items-center"><span className="font-semibold text-green-700">Operator:</span><span className="text-slate-600">operator@workflowlite.com / WorkflowDemo2026!</span></div>
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-xl flex justify-between items-center"><span className="font-semibold text-purple-700">Staff:</span><span className="text-slate-600">staff@workflowlite.com / WorkflowDemo2026!</span></div>
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleSeed} disabled={seeding}>
              {seeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Seeding Supabase...</> : 'Seed Supabase Database'}
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
    ? [{ id: 'dashboard', label: 'Dashboard', icon: BarChart3 }, { id: 'sites', label: 'Sites', icon: Building2 }, { id: 'operators', label: 'Operators', icon: Users }]
    : user.role === 'operator'
    ? [{ id: 'dashboard', label: 'Dashboard', icon: BarChart3 }, { id: 'staff', label: 'Staff Management', icon: Users }, { id: 'pricing', label: 'Fuel Pricing', icon: Fuel }, { id: 'fields', label: 'Form Fields', icon: Settings }, { id: 'banking', label: 'Banking', icon: Calculator }]
    : [{ id: 'submit', label: 'Submit Report', icon: ClipboardList }, { id: 'history', label: 'My Reports', icon: FileText }];

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">WorkflowLite</h1>
              <p className="text-xs text-muted-foreground capitalize">{user.role} Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Button variant="outline" size="icon" onClick={onLogout} className="rounded-xl">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1 -mb-px overflow-x-auto pb-px">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id 
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50'
                } rounded-t-lg`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ============== STAT CARD ==============
function StatCard({ title, value, icon: Icon, subValue, color = 'blue', trend }) {
  const colorClasses = {
    blue: 'from-blue-500 to-indigo-500',
    green: 'from-emerald-500 to-teal-500',
    purple: 'from-purple-500 to-pink-500',
    orange: 'from-orange-500 to-amber-500',
    red: 'from-red-500 to-rose-500',
    cyan: 'from-cyan-500 to-blue-500'
  };
  
  return (
    <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-br ${colorClasses[color]} p-4 text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {subValue && <p className="text-xs opacity-75 mt-1">{subValue}</p>}
            </div>
            <div className="p-2 bg-white/20 rounded-xl">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============== VIEW TOGGLE ==============
function ViewToggle({ viewType, setViewType }) {
  return (
    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
      <button
        onClick={() => setViewType('daily')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          viewType === 'daily' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <Calendar className="h-4 w-4 inline mr-2" />
        Daily Summary
      </button>
      <button
        onClick={() => setViewType('shift')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          viewType === 'shift' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <Layers className="h-4 w-4 inline mr-2" />
        Shift Details
      </button>
    </div>
  );
}

// ============== DAILY ROLLUP ROW ==============
function DailyRollupRow({ rollup, onClick, expanded, onToggle }) {
  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-lg">{rollup.site_name}</p>
            <p className="text-sm text-muted-foreground">{formatDate(rollup.date)} • {rollup.shift_count} shift{rollup.shift_count > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xl font-bold text-blue-600">{formatCurrency(rollup.total_revenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          <div className="flex items-center gap-2">
            {rollup.pending_count > 0 && <Badge variant="secondary" className="bg-amber-100 text-amber-700">{rollup.pending_count} pending</Badge>}
            {rollup.reviewed_count > 0 && <Badge className="bg-green-100 text-green-700">{rollup.reviewed_count} reviewed</Badge>}
          </div>
          {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </div>
      
      {expanded && (
        <div className="border-t bg-slate-50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Fuel Sales</p>
              <p className="font-semibold">{formatCurrency(rollup.fuel_sales)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Shop Sales</p>
              <p className="font-semibold">{formatCurrency(rollup.shop_sales)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">EFTPOS</p>
              <p className="font-semibold">{formatCurrency(rollup.eftpos)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="font-semibold">{formatCurrency(rollup.cash)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Dips</p>
              <p className="font-semibold">{formatCurrency(rollup.dips)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Banking</p>
              <p className="font-semibold text-purple-600">{formatCurrency(rollup.banking_value)}</p>
            </div>
          </div>
          
          <p className="text-sm font-medium mb-2">Individual Shifts:</p>
          <div className="space-y-2">
            {rollup.shifts.map((shift, idx) => (
              <div 
                key={shift.id} 
                className="flex items-center justify-between p-3 bg-white rounded-lg cursor-pointer hover:bg-blue-50 transition-colors"
                onClick={(e) => { e.stopPropagation(); onClick(shift.id); }}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{shift.shift_type}</Badge>
                  <span className="text-sm">{formatCurrency(shift.total_revenue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={shift.status === 'reviewed' ? 'default' : 'secondary'} className={shift.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                    {shift.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== REPORT ROW ==============
function ReportRow({ report, onClick }) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border" onClick={onClick}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
          <FileText className="h-5 w-5 text-slate-500" />
        </div>
        <div>
          <p className="font-medium">{report.site_name}</p>
          <p className="text-sm text-muted-foreground">{formatDate(report.date)} • {report.shift_type} Shift</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold">{formatCurrency(report.total_revenue)}</p>
          <p className="text-xs text-muted-foreground">{report.staff_name}</p>
        </div>
        <Badge variant={report.status === 'reviewed' ? 'default' : 'secondary'} className={report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
          {report.status === 'reviewed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
          {report.status}
        </Badge>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}

// ============== REPORT DETAIL ==============
function ReportDetail({ report, onClose, onStatusChange, canChangeStatus, user }) {
  if (!report) return null;
  
  const fields = [
    { label: 'Total Sales', value: formatCurrency(report.total_sales) },
    { label: 'Fuel Sales', value: formatCurrency(report.fuel_sales) },
    { label: 'Shop Sales', value: formatCurrency(report.shop_sales) },
    { label: 'Total Litres', value: `${(report.total_litres || 0).toLocaleString()} L` },
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
    <Card className="border-0 shadow-xl">
      <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{report.site_name}</CardTitle>
            <CardDescription>{report.site_code}</CardDescription>
          </div>
          <Badge variant={report.status === 'reviewed' ? 'default' : 'secondary'} className={`text-sm ${report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {report.status === 'reviewed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl">
          <div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{formatDate(report.date)}</p></div>
          <div><p className="text-xs text-muted-foreground">Shift</p><p className="font-medium">{report.shift_type}</p></div>
          <div><p className="text-xs text-muted-foreground">Submitted By</p><p className="font-medium">{report.staff_name}</p></div>
          <div><p className="text-xs text-muted-foreground">Submitted At</p><p className="font-medium">{formatDateTime(report.submitted_at)}</p></div>
        </div>
        
        <div className="p-5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl text-white">
          <p className="text-sm opacity-90 mb-1">Total Revenue</p>
          <p className="text-3xl font-bold">{formatCurrency(report.total_revenue)}</p>
        </div>
        
        {report.banking_value !== undefined && report.banking_value !== 0 && (
          <div className="p-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white">
            <p className="text-sm opacity-90 mb-1">Banking Total</p>
            <p className="text-3xl font-bold">{formatCurrency(report.banking_value)}</p>
          </div>
        )}
        
        <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
          <p className="text-sm font-medium text-orange-700 mb-1">Difference / Variance</p>
          <p className="text-lg font-medium text-orange-600">{report.difference_value !== null ? formatCurrency(report.difference_value) : 'Formula pending'}</p>
          <p className="text-xs text-orange-500 mt-1">This field will be calculated once formula is provided</p>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {fields.map((field, i) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="font-semibold">{field.value}</p>
            </div>
          ))}
        </div>
        
        {report.notes && (
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{report.notes}</p>
          </div>
        )}
        
        {report.status === 'reviewed' && report.reviewed_by_name && (
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-xs text-green-700 mb-1">Reviewed By</p>
            <p className="font-medium text-green-800">{report.reviewed_by_name}</p>
            <p className="text-xs text-green-600">{formatDateTime(report.reviewed_at)}</p>
          </div>
        )}
        
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
          {canChangeStatus && report.status === 'pending' && (
            <Button onClick={() => onStatusChange(report.id, 'reviewed', user.id)} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500">
              <CheckCircle className="h-4 w-4 mr-2" /> Mark as Reviewed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============== BANKING FORMULA BUILDER ==============
function BankingFormulaBuilder({ siteId, userId, onClose, existingFormula }) {
  const [name, setName] = useState(existingFormula?.name || 'Banking Calculation');
  const [resultLabel, setResultLabel] = useState(existingFormula?.result_label || 'Banking Total');
  const [operations, setOperations] = useState(() => {
    if (existingFormula?.formula_json) {
      try { return JSON.parse(existingFormula.formula_json).operations || []; }
      catch { return []; }
    }
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(0);

  const availableFields = [
    { key: 'fuel_sales', label: 'Fuel Sales' },
    { key: 'shop_sales', label: 'Shop Sales' },
    { key: 'eftpos', label: 'EFTPOS' },
    { key: 'motorpass', label: 'Motorpass' },
    { key: 'cash', label: 'Cash' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'beverages', label: 'Beverages' },
    { key: 'hot_food', label: 'Hot Food' },
    { key: 'drive_offs', label: 'Drive Offs' },
    { key: 'dips', label: 'Dips' },
    { key: 'total_litres', label: 'Total Litres' },
  ];

  const operators = [
    { value: '+', label: '+', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
    { value: '-', label: '−', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
    { value: '*', label: '×', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    { value: '/', label: '÷', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  ];

  const addField = (field) => {
    if (operations.length > 0 && operations[operations.length - 1].type !== 'operator') {
      setOperations([...operations, { type: 'operator', value: '+' }, { type: 'field', value: field.key, label: field.label }]);
    } else {
      setOperations([...operations, { type: 'field', value: field.key, label: field.label }]);
    }
  };

  const addOperator = (op) => {
    if (operations.length > 0 && operations[operations.length - 1].type !== 'operator') {
      setOperations([...operations, { type: 'operator', value: op }]);
    }
  };

  const addNumber = () => {
    const num = prompt('Enter a number:');
    if (num && !isNaN(parseFloat(num))) {
      if (operations.length > 0 && operations[operations.length - 1].type !== 'operator') {
        setOperations([...operations, { type: 'operator', value: '+' }, { type: 'number', value: parseFloat(num) }]);
      } else {
        setOperations([...operations, { type: 'number', value: parseFloat(num) }]);
      }
    }
  };

  const removeOperation = (index) => {
    const newOps = [...operations];
    newOps.splice(index, 1);
    if (newOps.length > 0 && newOps[0].type === 'operator') newOps.shift();
    if (newOps.length > 0 && newOps[newOps.length - 1].type === 'operator') newOps.pop();
    setOperations(newOps);
  };

  const clearAll = () => setOperations([]);

  // Calculate test result with sample values
  useEffect(() => {
    const sampleData = { fuel_sales: 3500, shop_sales: 850, eftpos: 2800, motorpass: 500, cash: 350, accounts: 500, beverages: 300, hot_food: 200, drive_offs: 0, dips: 15000, total_litres: 2000 };
    let result = 0;
    let currentOp = '+';
    
    for (const op of operations) {
      if (op.type === 'operator') {
        currentOp = op.value;
      } else {
        const value = op.type === 'field' ? (sampleData[op.value] || 0) : (parseFloat(op.value) || 0);
        switch (currentOp) {
          case '+': result += value; break;
          case '-': result -= value; break;
          case '*': result *= value; break;
          case '/': result = value !== 0 ? result / value : result; break;
        }
      }
    }
    setTestResult(Math.round(result * 100) / 100);
  }, [operations]);

  const handleSave = async () => {
    if (operations.length === 0) { alert('Please add at least one field to the formula'); return; }
    
    setSaving(true);
    try {
      const url = existingFormula ? `/api/banking-formulas/${existingFormula.id}` : '/api/banking-formulas';
      const method = existingFormula ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          name,
          formula_json: JSON.stringify({ operations }),
          result_label: resultLabel,
          created_by_user_id: userId
        })
      });
      
      if (res.ok) { onClose(true); }
      else { alert('Failed to save formula'); }
    } catch (err) { alert('Error saving formula: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Formula Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Daily Banking" className="mt-1" />
        </div>
        <div>
          <Label>Result Label</Label>
          <Input value={resultLabel} onChange={(e) => setResultLabel(e.target.value)} placeholder="e.g., Banking Total" className="mt-1" />
        </div>
      </div>
      
      {/* Formula Display */}
      <div className="min-h-[80px] p-4 bg-gradient-to-r from-slate-100 to-slate-50 rounded-2xl border-2 border-dashed border-slate-300">
        {operations.length === 0 ? (
          <p className="text-slate-400 text-center py-4">Click fields below to build your formula</p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {operations.map((op, idx) => (
              <div key={idx} className="group relative">
                {op.type === 'operator' ? (
                  <span className="inline-flex items-center justify-center w-10 h-10 text-lg font-bold bg-white rounded-xl shadow-sm border">{op.value === '*' ? '×' : op.value === '/' ? '÷' : op.value}</span>
                ) : op.type === 'field' ? (
                  <span className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-medium shadow-sm">{op.label || op.value}</span>
                ) : (
                  <span className="inline-flex items-center px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-medium shadow-sm">{op.value}</span>
                )}
                <button onClick={() => removeOperation(idx)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Live Result */}
      <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white">
        <p className="text-sm opacity-90">Live Preview (with sample data)</p>
        <p className="text-3xl font-bold">{formatCurrency(testResult)}</p>
      </div>
      
      {/* Operators */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Operators</Label>
        <div className="flex gap-2">
          {operators.map(op => (
            <button key={op.value} onClick={() => addOperator(op.value)} className={`w-12 h-12 rounded-xl font-bold text-xl transition-all ${op.color} shadow-sm hover:shadow-md`}>{op.label}</button>
          ))}
          <button onClick={addNumber} className="px-4 h-12 rounded-xl font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all shadow-sm">123</button>
          <button onClick={clearAll} className="px-4 h-12 rounded-xl font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-all shadow-sm ml-auto">Clear All</button>
        </div>
      </div>
      
      {/* Available Fields */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Available Fields</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {availableFields.map(field => (
            <button key={field.key} onClick={() => addField(field)} className="px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-100 hover:bg-blue-100 hover:text-blue-700 transition-all text-left">{field.label}</button>
          ))}
        </div>
      </div>
      
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={() => onClose(false)} className="flex-1">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Formula
        </Button>
      </div>
    </div>
  );
}

// ============== BANKING MANAGEMENT ==============
function BankingManagement({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFormula, setEditingFormula] = useState(null);

  const loadFormulas = useCallback(async () => {
    if (!selectedSite) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/banking-formulas?siteId=${selectedSite}`);
      const data = await res.json();
      setFormulas(data);
    } catch (err) { console.error('Failed to load formulas:', err); }
    finally { setLoading(false); }
  }, [selectedSite]);

  useEffect(() => { loadFormulas(); }, [loadFormulas]);

  const handleDelete = async (formulaId) => {
    if (!confirm('Delete this formula?')) return;
    await fetch(`/api/banking-formulas/${formulaId}`, { method: 'DELETE' });
    loadFormulas();
  };

  const handleBuilderClose = (saved) => {
    setShowBuilder(false);
    setEditingFormula(null);
    if (saved) loadFormulas();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Banking Calculator</h2>
          <p className="text-muted-foreground">Create formulas to calculate banking totals</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>
              {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowBuilder(true)} className="bg-gradient-to-r from-purple-500 to-pink-500">
            <Plus className="h-4 w-4 mr-2" /> New Formula
          </Button>
        </div>
      </div>

      {showBuilder && (
        <Card className="border-0 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> {editingFormula ? 'Edit Formula' : 'Create Banking Formula'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <BankingFormulaBuilder siteId={selectedSite} userId={user.id} onClose={handleBuilderClose} existingFormula={editingFormula} />
          </CardContent>
        </Card>
      )}

      {!showBuilder && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>
          ) : formulas.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-muted-foreground">No banking formulas yet. Create one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            formulas.map(formula => {
              let operations = [];
              try { operations = JSON.parse(formula.formula_json).operations || []; } catch {}
              
              return (
                <Card key={formula.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{formula.name}</h3>
                        <p className="text-sm text-muted-foreground">Result: {formula.result_label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={formula.is_active ? 'default' : 'secondary'} className={formula.is_active ? 'bg-green-100 text-green-700' : ''}>{formula.is_active ? 'Active' : 'Inactive'}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingFormula(formula); setShowBuilder(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(formula.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        {operations.map((op, idx) => (
                          <span key={idx} className={`px-3 py-1 rounded-lg text-sm font-medium ${op.type === 'operator' ? 'bg-slate-100' : op.type === 'field' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {op.type === 'operator' ? (op.value === '*' ? '×' : op.value === '/' ? '÷' : op.value) : (op.label || op.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============== FIELD CONFIGURATION ==============
function FieldConfiguration({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [newField, setNewField] = useState({ label: '', field_type: 'number' });

  const loadFields = useCallback(async () => {
    if (!selectedSite) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/field-configs?siteId=${selectedSite}`);
      const data = await res.json();
      setFields(data.sort((a, b) => a.display_order - b.display_order));
    } catch (err) { console.error('Failed to load fields:', err); }
    finally { setLoading(false); }
  }, [selectedSite]);

  useEffect(() => { loadFields(); }, [loadFields]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/field-configs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: fields })
      });
      loadFields();
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleAddField = async () => {
    if (!newField.label) { alert('Label is required'); return; }
    try {
      await fetch('/api/field-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: selectedSite,
          label: newField.label,
          field_type: newField.field_type,
          display_order: fields.length + 1,
          created_by_user_id: user.id
        })
      });
      setNewField({ label: '', field_type: 'number' });
      setShowAddField(false);
      loadFields();
    } catch (err) { alert('Failed to add field'); }
  };

  const handleDelete = async (fieldId) => {
    if (!confirm('Delete this field?')) return;
    await fetch(`/api/field-configs/${fieldId}`, { method: 'DELETE' });
    loadFields();
  };

  const updateField = (id, key, value) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newFields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    newFields.forEach((f, i) => f.display_order = i + 1);
    setFields(newFields);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Form Field Configuration</h2>
          <p className="text-muted-foreground">Customize fields for staff shift report form</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>
              {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddField(true)} variant="outline"><Plus className="h-4 w-4 mr-2" /> Add Field</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-500 to-indigo-600">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Changes
          </Button>
        </div>
      </div>

      {showAddField && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label>Field Label</Label>
                <Input value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="e.g., Lottery Sales" className="mt-1" />
              </div>
              <div className="w-40">
                <Label>Type</Label>
                <Select value={newField.field_type} onValueChange={(v) => setNewField({ ...newField, field_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddField}>Add</Button>
              <Button variant="ghost" onClick={() => setShowAddField(false)}><X className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <Card key={field.id} className={`${field.is_core ? 'border-blue-200 bg-blue-50/50' : ''} ${!field.is_enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveField(index, -1)} disabled={index === 0}><ChevronUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}><ChevronDown className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex-1">
                    <Input value={field.label} onChange={(e) => updateField(field.id, 'label', e.target.value)} disabled={field.is_core} className="font-medium" />
                  </div>
                  <Badge variant="outline">{field.field_type}</Badge>
                  {field.is_core && <Badge className="bg-blue-100 text-blue-700">Core Field</Badge>}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Enabled</Label>
                    <Switch checked={field.is_enabled} onCheckedChange={(v) => updateField(field.id, 'is_enabled', v)} disabled={field.is_core} />
                  </div>
                  {!field.is_core && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(field.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============== EXPORT DIALOG ==============
function ExportDialog({ sites, siteIds }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const [viewType, setViewType] = useState('daily');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = `/api/export?format=${format}&viewType=${viewType}&siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`;
      
      if (format === 'xlsx') {
        const res = await fetch(url);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `workflowlite_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
      } else {
        const res = await fetch(url);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `workflowlite_export_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
      }
      setOpen(false);
    } catch (err) { alert('Export failed: ' + err.message); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Reports</DialogTitle>
          <DialogDescription>Download report data for the selected date range</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>From</Label><Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="mt-1" /></div>
            <div><Label>To</Label><Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="mt-1" /></div>
          </div>
          <div>
            <Label>View Type</Label>
            <Select value={viewType} onValueChange={setViewType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily Summary</SelectItem>
                <SelectItem value="shift">Shift Details</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleExport} disabled={exporting} className="bg-gradient-to-r from-blue-500 to-indigo-600">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== SHIFT REPORT FORM ==============
function ShiftReportForm({ user, sites, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState([]);
  const [form, setForm] = useState({
    site_id: sites[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Morning'
  });
  const [errors, setErrors] = useState({});

  // Load field configs for selected site
  useEffect(() => {
    const loadFieldConfigs = async () => {
      if (!form.site_id) return;
      try {
        const res = await fetch(`/api/field-configs?siteId=${form.site_id}`);
        const data = await res.json();
        setFieldConfigs(data.filter(f => f.is_enabled).sort((a, b) => a.display_order - b.display_order));
      } catch (err) { console.error('Failed to load field configs:', err); }
    };
    loadFieldConfigs();
  }, [form.site_id]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
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
        body: JSON.stringify({ ...form, submitted_by_user_id: user.id })
      });
      
      if (res.ok) {
        setSuccess(true);
        // Reset form but keep site and date
        const resetForm = { site_id: form.site_id, date: form.date, shift_type: 'Morning' };
        fieldConfigs.forEach(f => { resetForm[f.key] = ''; });
        setForm(resetForm);
        onSuccess?.();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit report');
      }
    } catch (err) { alert('Failed to submit report: ' + err.message); }
    finally { setLoading(false); }
  };

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Submit Shift Report</CardTitle>
        <CardDescription>Complete the form below to submit your shift report</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Report submitted successfully!</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Site *</Label>
              <Select value={form.site_id} onValueChange={(v) => handleChange('site_id', v)}>
                <SelectTrigger className={errors.site_id ? 'border-red-500' : ''}><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>{sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
              </Select>
              {errors.site_id && <p className="text-xs text-red-500">{errors.site_id}</p>}
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} className={errors.date ? 'border-red-500' : ''} />
              {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
            </div>
            <div className="space-y-2">
              <Label>Shift Type *</Label>
              <Select value={form.shift_type} onValueChange={(v) => handleChange('shift_type', v)}>
                <SelectTrigger className={errors.shift_type ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
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
          
          <div>
            <h3 className="font-medium mb-4">Sales & Payments</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {fieldConfigs.map(field => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-sm">{field.label} {field.is_core && '*'}</Label>
                  <Input
                    type={field.field_type === 'number' ? 'number' : 'text'}
                    step={field.field_type === 'number' ? '0.01' : undefined}
                    placeholder={field.field_type === 'number' ? '0.00' : ''}
                    value={form[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className={errors[field.key] ? 'border-red-500' : ''}
                  />
                  {errors[field.key] && <p className="text-xs text-red-500">{errors[field.key]}</p>}
                </div>
              ))}
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label>Notes / Comments</Label>
            <Textarea placeholder="Add any notes about this shift..." value={form.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} rows={3} />
          </div>
          
          <Button type="submit" className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : <><FileText className="mr-2 h-4 w-4" /> Submit Report</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ============== OWNER DASHBOARD ==============
// ============== MORNING PRICE BRIEF ==============
function MorningPriceBrief({ sites, selectedDate }) {
  const [briefData, setBriefData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBrief = async () => {
      if (!sites || sites.length === 0) return;
      setLoading(true);
      try {
        const siteIds = sites.map(s => s.id).join(',');
        const date = selectedDate || new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/fuel-price-comparison?siteIds=${siteIds}&date=${date}`);
        const data = await res.json();
        setBriefData(data);
      } catch (err) { console.error('Failed to load brief:', err); }
      finally { setLoading(false); }
    };
    loadBrief();
  }, [sites, selectedDate]);

  if (loading) return <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (briefData.length === 0) return <p className="text-sm text-muted-foreground">No price data available</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {briefData.map(site => {
        const ulpData = site.fuel_data?.ULP;
        if (!ulpData || !ulpData.own_price) return null;

        const diff = parseFloat(ulpData.difference_from_min || 0);
        const isCompetitive = Math.abs(diff) <= 2;
        const isCheapest = diff < 0;

        let suggestion = '';
        let actionColor = 'text-blue-600';

        if (isCheapest) {
          suggestion = '✅ You are the cheapest';
          actionColor = 'text-green-600';
        } else if (isCompetitive) {
          suggestion = '✅ Competitive pricing';
          actionColor = 'text-blue-600';
        } else if (diff > 5) {
          suggestion = `⚠️ Consider reducing by ${(diff - 1).toFixed(1)}¢`;
          actionColor = 'text-red-600';
        } else {
          suggestion = `💡 Consider reducing by ${(diff / 2).toFixed(1)}¢`;
          actionColor = 'text-orange-600';
        }

        return (
          <Card key={site.site_id} className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-2">
              <div>
                <p className="font-semibold text-sm">{site.site_name}</p>
                <p className="text-xs text-muted-foreground">{site.site_code}</p>
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Your Price:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${(ulpData.own_price / 100).toFixed(1)}
                </span>
              </div>

              {ulpData.min_competitor_price && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Lowest Nearby:</span>
                    <span className="text-lg font-semibold text-green-600">
                      ${(ulpData.min_competitor_price / 100).toFixed(1)}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Difference:</span>
                    <span className={`font-bold ${diff > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}¢
                    </span>
                  </div>

                  <div className={`text-xs font-medium pt-2 border-t ${actionColor}`}>
                    {suggestion}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============== FUEL PRICE MAP VIEW & COMPARISON ==============
function FuelPriceComparisonSection({ sites, siteIds }) {
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'
  const [priceData, setPriceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const loadPriceData = useCallback(async () => {
    if (!siteIds) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fuel-price-comparison?siteIds=${siteIds}&date=${selectedDate}`);
      const data = await res.json();
      setPriceData(data);
    } catch (err) { console.error('Failed to load fuel price data:', err); }
    finally { setLoading(false); }
  }, [siteIds, selectedDate]);

  useEffect(() => { loadPriceData(); }, [loadPriceData]);

  const getInsightColor = (type) => {
    if (type === 'good') return 'bg-green-50 text-green-700 border-green-200';
    if (type === 'warning') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (type === 'danger') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const getPriceColor = (isOwn, isMin, isMax) => {
    if (isOwn) return 'text-blue-600 font-bold';
    if (isMin) return 'text-green-600 font-semibold';
    if (isMax) return 'text-red-600';
    return 'text-gray-700';
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
  if (priceData.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Fuel className="h-5 w-5" /> Fuel Price Intelligence</h3>
          <p className="text-sm text-muted-foreground">Compare your fuel prices with nearby competitors</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="map">🗺️ Map View</TabsTrigger>
              <TabsTrigger value="list">📋 List View</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
        </div>
      </div>

      {viewMode === 'map' ? (
        <FuelPriceMapView sites={sites} priceData={priceData} selectedDate={selectedDate} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {priceData.map(site => (
            <Card key={site.site_id} className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {site.site_name}
                </CardTitle>
                <CardDescription className="text-xs">{site.site_code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(site.fuel_data).map(([fuelType, data]) => (
                  <div key={fuelType} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{fuelType}</span>
                      {data.own_price && (
                        <span className="text-lg font-bold text-blue-600">${(data.own_price / 100).toFixed(1)}</span>
                      )}
                    </div>

                    {data.competitor_prices && data.competitor_prices.length > 0 && (
                      <div className="space-y-1 pl-3 border-l-2 border-slate-200">
                        {data.competitor_prices.map((comp, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className={getPriceColor(false, comp.price === data.min_competitor_price, comp.price === data.max_competitor_price)}>
                              {comp.competitor_name}
                            </span>
                            <span className={getPriceColor(false, comp.price === data.min_competitor_price, comp.price === data.max_competitor_price)}>
                              ${(comp.price / 100).toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {data.insight && (
                      <div className={`text-xs p-2 rounded border ${getInsightColor(data.insight_type)}`}>
                        {data.insight}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Map View Component
function FuelPriceMapView({ sites, priceData, selectedDate }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [competitors, setCompetitors] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    setMounted(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedSite) {
      setLoading(true);
      fetch(`/api/site-competitors?siteId=${selectedSite}`)
        .then(r => r.json())
        .then(data => {
          setCompetitors(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load competitors:', err);
          setLoading(false);
        });
    }
  }, [selectedSite]);

  const currentSite = sites.find(s => s.id === selectedSite);
  const currentPriceData = priceData.find(p => p.site_id === selectedSite);

  if (!mounted) return <div className="h-[600px] bg-slate-100 rounded-lg animate-pulse" />;
  
  if (!currentSite) {
    return <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
      <p className="text-muted-foreground">No site data available</p>
    </div>;
  }
  
  if (!currentSite.latitude || !currentSite.longitude) {
    return <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
      <div className="text-center p-8">
        <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
        <p className="text-lg font-semibold mb-2">Map coordinates not available</p>
        <p className="text-sm text-muted-foreground">
          Site: {currentSite.name}<br/>
          Please use List View instead.
        </p>
      </div>
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        {currentPriceData && currentPriceData.fuel_data && currentPriceData.fuel_data.ULP && (
          <Card className="flex-1 border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Lowest nearby: </span>
                <span className="font-bold text-green-600">
                  ${((currentPriceData.fuel_data.ULP.min_competitor_price || 0) / 100).toFixed(1)}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">You are: </span>
                <span className={`font-bold ${parseFloat(currentPriceData.fuel_data.ULP.difference_from_min || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {parseFloat(currentPriceData.fuel_data.ULP.difference_from_min || 0) > 0 ? '+' : ''}{currentPriceData.fuel_data.ULP.difference_from_min || '0'}¢
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {loading ? (
        <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <LeafletMapClient currentSite={currentSite} competitors={competitors} priceData={currentPriceData} />
      )}
    </div>
  );
}

// Client-only Leaflet Map Component
function LeafletMapClient({ currentSite, competitors, priceData }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || typeof window === 'undefined') {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  return <LeafletMapInner currentSite={currentSite} competitors={competitors} priceData={priceData} />;
}

// Inner map component that only renders client-side
function LeafletMapInner({ currentSite, competitors, priceData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  try {
    // Import Leaflet and react-leaflet dynamically
    const L = require('leaflet');
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');

    // Fix default marker icon issue with Leaflet + Webpack
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    // Create custom icon
    const createIcon = (isOwn, isLowest) => {
      return L.divIcon({
        className: 'custom-marker',
        html: `<div class="fuel-marker ${isOwn ? 'own' : isLowest ? 'lowest' : 'competitor'}">${isOwn ? '⛽' : '🏪'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
      });
    };

    const lowestCompPrice = priceData?.fuel_data?.ULP?.min_competitor_price || 999999;
    const validCompetitors = competitors.filter(c => c.latitude && c.longitude);

    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="h-[600px]">
          <MapContainer 
            center={[currentSite.latitude, currentSite.longitude]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            key={`map-${currentSite.id}`}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            
            {/* Own Site Marker */}
            <Marker position={[currentSite.latitude, currentSite.longitude]} icon={createIcon(true, false)}>
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-bold text-sm mb-2">{currentSite.name}</h3>
                  <div className="space-y-1 text-xs">
                    {priceData && Object.entries(priceData.fuel_data).map(([type, data]) => (
                      data.own_price && (
                        <div key={type} className="flex justify-between">
                          <span className="font-medium">{type}:</span>
                          <span className="text-blue-600 font-bold">${(data.own_price / 100).toFixed(1)}</span>
                        </div>
                      )
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">📍 Your Site</p>
                </div>
              </Popup>
            </Marker>

            {/* Competitor Markers */}
            {validCompetitors.map(comp => {
              const compPrice = priceData?.fuel_data?.ULP?.competitor_prices?.find(cp => cp.competitor_name === comp.competitor_name);
              const isLowest = compPrice && compPrice.price === lowestCompPrice;
              
              return (
                <Marker 
                  key={comp.id} 
                  position={[comp.latitude, comp.longitude]} 
                  icon={createIcon(false, isLowest)}
                >
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <h3 className="font-bold text-sm mb-2">{comp.competitor_name}</h3>
                      <div className="space-y-1 text-xs">
                        {priceData && Object.entries(priceData.fuel_data).map(([type, data]) => {
                          const price = data.competitor_prices?.find(cp => cp.competitor_name === comp.competitor_name);
                          return price ? (
                            <div key={type} className="flex justify-between">
                              <span className="font-medium">{type}:</span>
                              <span className={price.price === data.min_competitor_price ? 'text-green-600 font-bold' : 'text-gray-700'}>
                                ${(price.price / 100).toFixed(1)}
                              </span>
                            </div>
                          ) : null;
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">📍 {comp.distance_km} km away</p>
                      {isLowest && <p className="text-xs text-green-600 font-semibold mt-1">✨ Lowest Price!</p>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </Card>
    );
  } catch (error) {
    console.error('Map render error:', error);
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="h-[600px] flex flex-col items-center justify-center p-8">
          <AlertTriangle className="h-12 w-12 text-orange-500 mb-4" />
          <p className="text-lg font-semibold mb-2">Map View Unavailable</p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Unable to load map. Please use List View instead.
          </p>
          <p className="text-xs text-muted-foreground">
            Error: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }
}

// ============== FUEL PRICING MANAGEMENT (Operator) ==============
function FuelPricingManagement({ user, sites }) {
  const [activeSubTab, setActiveSubTab] = useState('prices');
  
  if (activeSubTab === 'prices') return <FuelPriceEntry user={user} sites={sites} />;
  if (activeSubTab === 'competitors') return <CompetitorManagement user={user} sites={sites} />;
  
  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="prices">Price Entry</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function FuelPriceEntry({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [prices, setPrices] = useState({ ULP: '', Diesel: '', Premium: '' });
  const [competitorPrices, setCompetitorPrices] = useState({});
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedSite) {
      fetch(`/api/site-competitors?siteId=${selectedSite}`)
        .then(r => r.json())
        .then(setCompetitors);
    }
  }, [selectedSite]);

  const handleSavePrices = async () => {
    setLoading(true);
    try {
      for (const [fuelType, price] of Object.entries(prices)) {
        if (price) {
          await fetch('/api/fuel-price-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              fuel_type: fuelType,
              own_price: parseFloat(price),
              date: selectedDate,
              entered_by_user_id: user.id
            })
          });
        }
      }
      
      for (const [key, price] of Object.entries(competitorPrices)) {
        if (price) {
          const [compName, fuelType] = key.split('_');
          await fetch('/api/competitor-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              competitor_name: compName,
              fuel_type: fuelType,
              price: parseFloat(price),
              recorded_at: selectedDate,
              entered_by_user_id: user.id
            })
          });
        }
      }
      
      alert('Prices saved successfully!');
      setPrices({ ULP: '', Diesel: '', Premium: '' });
      setCompetitorPrices({});
    } catch (err) { alert('Failed to save prices'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold">Fuel Price Entry</h2><p className="text-muted-foreground">Enter your fuel prices and competitor prices</p></div>
      
      <div className="flex gap-4">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Prices</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {['ULP', 'Diesel', 'Premium'].map(ft => (
            <div key={ft} className="flex items-center gap-3">
              <Label className="w-24">{ft}</Label>
              <Input type="number" step="0.1" placeholder="185.9" value={prices[ft]} onChange={(e) => setPrices(p => ({ ...p, [ft]: e.target.value }))} className="w-32" />
              <span className="text-xs text-muted-foreground">cents/litre</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {competitors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Competitor Prices</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {competitors.map(comp => (
              <div key={comp.id} className="space-y-2 p-3 bg-slate-50 rounded">
                <p className="font-medium text-sm">{comp.competitor_name}</p>
                <div className="grid grid-cols-3 gap-3">
                  {['ULP', 'Diesel', 'Premium'].map(ft => (
                    <Input key={ft} type="number" step="0.1" placeholder={ft} value={competitorPrices[`${comp.competitor_name}_${ft}`] || ''} onChange={(e) => setCompetitorPrices(p => ({ ...p, [`${comp.competitor_name}_${ft}`]: e.target.value }))} className="text-sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSavePrices} disabled={loading} className="w-full">{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save All Prices</>}</Button>
    </div>
  );
}

function CompetitorManagement({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [competitors, setCompetitors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ competitor_name: '', distance_km: '' });

  const loadCompetitors = useCallback(async () => {
    if (!selectedSite) return;
    const res = await fetch(`/api/site-competitors?siteId=${selectedSite}`);
    const data = await res.json();
    setCompetitors(data);
  }, [selectedSite]);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  const handleAdd = async () => {
    if (!form.competitor_name) { alert('Competitor name required'); return; }
    await fetch('/api/site-competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, site_id: selectedSite })
    });
    setForm({ competitor_name: '', distance_km: '' });
    setShowAdd(false);
    loadCompetitors();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this competitor?')) return;
    await fetch(`/api/site-competitors/${id}`, { method: 'DELETE' });
    loadCompetitors();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Manage Competitors</h2><p className="text-muted-foreground">Add and manage nearby competitor stations</p></div>
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Competitor</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Competitor Name</Label><Input placeholder="Shell Petrol Station" value={form.competitor_name} onChange={(e) => setForm(p => ({ ...p, competitor_name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Distance (km)</Label><Input type="number" step="0.1" placeholder="1.5" value={form.distance_km} onChange={(e) => setForm(p => ({ ...p, distance_km: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={handleAdd}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {competitors.length === 0 ? <p className="text-center text-muted-foreground py-8">No competitors added yet</p> : (
            <div className="space-y-2">
              {competitors.map(comp => (
                <div key={comp.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">{comp.competitor_name}</p>
                    {comp.distance_km && <p className="text-xs text-muted-foreground">{comp.distance_km} km away</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(comp.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          )}
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
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
        fetch(`/api/reports?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
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

// ============== SITE MANAGEMENT ==============
function SiteManagement({ user, sites, onRefresh }) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '' });

  const handleSubmit = async () => {
    if (!form.name || !form.code) { alert('Site name and code are required'); return; }
    setLoading(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, owner_id: user.id }) });
      if (res.ok) { setForm({ name: '', code: '', location: '' }); setShowAddSite(false); setEditingSite(null); onRefresh(); }
      else { const data = await res.json(); alert(data.error || 'Failed to save site'); }
    } catch (err) { alert('Failed to save site: ' + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Site Management</h2><p className="text-muted-foreground">Add and manage your fuel station sites</p></div>
        <Dialog open={showAddSite} onOpenChange={(open) => { setShowAddSite(open); if (!open) { setEditingSite(null); setForm({ name: '', code: '', location: '' }); } }}>
          <DialogTrigger asChild><Button className="bg-gradient-to-r from-blue-500 to-indigo-600"><Plus className="h-4 w-4 mr-2" /> Add Site</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingSite ? 'Edit Site' : 'Add New Site'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Site Name *</Label><Input placeholder="e.g., Sunstate Fuel - Brisbane" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Site Code *</Label><Input placeholder="e.g., BNE-001" value={form.code} onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))} className="mt-1" /></div>
              <div><Label>Location</Label><Input placeholder="Full address" value={form.location} onChange={(e) => setForm(prev => ({ ...prev, location: e.target.value }))} className="mt-1" /></div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleSubmit} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingSite ? 'Update' : 'Create')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-4">
        {sites.map(site => (
          <Card key={site.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center"><Building2 className="h-6 w-6 text-blue-600" /></div>
                  <div>
                    <h3 className="font-semibold">{site.name}</h3>
                    <p className="text-sm text-muted-foreground">{site.code}</p>
                    {site.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{site.location}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={site.status === 'active' ? 'default' : 'secondary'} className={site.status === 'active' ? 'bg-green-100 text-green-700' : ''}>{site.status}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingSite(site); setForm({ name: site.name, code: site.code, location: site.location || '' }); setShowAddSite(true); }}><Pencil className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============== USER MANAGEMENT ==============
// ============== OPERATOR MANAGEMENT (Owner manages operators) ==============
function OperatorManagement({ user, sites, onRefresh }) {
  const [operators, setOperators] = useState([]);
  const [operatorAssignments, setOperatorAssignments] = useState([]);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [showAssignSites, setShowAssignSites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: 'demo123' });
  const [selectedSites, setSelectedSites] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [operatorsRes, assignmentsRes] = await Promise.all([
        fetch('/api/users?role=operator'),
        fetch(`/api/operator-assignments?ownerId=${user.id}`)
      ]);
      const [operatorsData, assignmentsData] = await Promise.all([operatorsRes.json(), assignmentsRes.json()]);
      setOperators(operatorsData);
      setOperatorAssignments(assignmentsData);
    } catch (err) { console.error('Failed to load operators:', err); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateOperator = async () => {
    if (!form.name || !form.email) { alert('Name and email are required'); return; }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'operator', creatorRole: 'owner' })
      });
      if (res.ok) {
        setForm({ name: '', email: '', password: 'demo123' });
        setShowAddOperator(false);
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create operator');
      }
    } catch (err) { alert('Failed to create operator: ' + err.message); }
  };

  const handleDeleteOperator = async (operatorId) => {
    if (!confirm('Are you sure? This will remove all site assignments for this operator.')) return;
    await fetch(`/api/users/${operatorId}`, { method: 'DELETE' });
    loadData();
  };

  const openAssignSites = (operator) => {
    const operatorSiteIds = operatorAssignments
      .filter(a => a.operator_user_id === operator.id)
      .map(a => a.site_id);
    setSelectedSites(operatorSiteIds);
    setShowAssignSites(operator);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    const operatorId = showAssignSites.id;
    const currentSiteIds = operatorAssignments
      .filter(a => a.operator_user_id === operatorId)
      .map(a => a.site_id);
    const toAdd = selectedSites.filter(id => !currentSiteIds.includes(id));
    const toRemove = operatorAssignments
      .filter(a => a.operator_user_id === operatorId && !selectedSites.includes(a.site_id))
      .map(a => a.id);

    try {
      for (const siteId of toAdd) {
        await fetch('/api/operator-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operator_user_id: operatorId,
            site_id: siteId,
            assigned_by_owner_id: user.id
          })
        });
      }
      for (const assignmentId of toRemove) {
        await fetch(`/api/operator-assignments/${assignmentId}`, { method: 'DELETE' });
      }
      setShowAssignSites(null);
      loadData();
      onRefresh();
    } catch (err) { alert('Failed to update assignments'); }
  };

  const getOperatorSites = (operatorId) =>
    operatorAssignments
      .filter(a => a.operator_user_id === operatorId)
      .map(a => a.site?.name || 'Unknown');

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Operator Management</h2>
          <p className="text-muted-foreground">Create operators and assign sites to them</p>
        </div>
        <Dialog open={showAddOperator} onOpenChange={setShowAddOperator}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-500 to-indigo-600">
              <UserPlus className="h-4 w-4 mr-2" /> Add Operator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Operator</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Name *</Label>
                <Input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleCreateOperator}>Create Operator</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle>
            <DialogDescription>Select which sites this operator can manage</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
            {sites.map(site => (
              <div key={site.id} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-slate-50">
                <Checkbox
                  id={site.id}
                  checked={selectedSites.includes(site.id)}
                  onCheckedChange={(checked) =>
                    setSelectedSites(prev =>
                      checked ? [...prev, site.id] : prev.filter(id => id !== site.id)
                    )
                  }
                />
                <label htmlFor={site.id} className="flex-1 cursor-pointer">
                  <p className="font-medium">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.code} • {site.location}</p>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Operators ({operators.length})
          </CardTitle>
          <CardDescription>Operators manage staff and operations for assigned sites</CardDescription>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No operators yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create an operator to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {operators.map(operator => (
                <div key={operator.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{operator.name}</p>
                      <p className="text-xs text-muted-foreground">{operator.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {getOperatorSites(operator.id).length > 0 ? (
                          getOperatorSites(operator.id).map((site, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />{site}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs text-orange-600">No sites assigned</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(operator)}>
                      <Building className="h-4 w-4 mr-1" /> Assign Sites
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteOperator(operator.id)}>
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

// ============== USER MANAGEMENT (Legacy - now only for reference) ==============
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
      const [usersRes, assignmentsRes] = await Promise.all([fetch('/api/users'), fetch('/api/assignments')]);
      const [usersData, assignmentsData] = await Promise.all([usersRes.json(), assignmentsRes.json()]);
      setUsers(usersData.filter(u => u.id !== user.id));
      setAssignments(assignmentsData);
    } catch (err) { console.error('Failed to load users:', err); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateUser = async () => {
    if (!form.name || !form.email || !form.role) { alert('Name, email, and role are required'); return; }
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) { setForm({ name: '', email: '', role: 'staff', password: 'demo123' }); setShowAddUser(false); loadData(); }
      else { const data = await res.json(); alert(data.error || 'Failed to create user'); }
    } catch (err) { alert('Failed to create user: ' + err.message); }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    loadData();
  };

  const openAssignSites = (targetUser) => {
    const userSiteIds = assignments.filter(a => a.user_id === targetUser.id).map(a => a.site_id);
    setSelectedSites(userSiteIds);
    setShowAssignSites(targetUser);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    const targetUserId = showAssignSites.id;
    const currentSiteIds = assignments.filter(a => a.user_id === targetUserId).map(a => a.site_id);
    const toAdd = selectedSites.filter(id => !currentSiteIds.includes(id));
    const toRemove = assignments.filter(a => a.user_id === targetUserId && !selectedSites.includes(a.site_id)).map(a => a.id);
    try {
      for (const siteId of toAdd) { await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: targetUserId, site_id: siteId, assigned_by_user_id: user.id }) }); }
      for (const assignmentId of toRemove) { await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' }); }
      setShowAssignSites(null);
      loadData();
      onRefresh();
    } catch (err) { alert('Failed to update assignments'); }
  };

  const getUserSites = (userId) => assignments.filter(a => a.user_id === userId).map(a => a.site_name || 'Unknown');

  const operators = users.filter(u => u.role === 'operator');
  const staffMembers = users.filter(u => u.role === 'staff');

  if (loading) { return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>; }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Users & Site Access</h2><p className="text-muted-foreground">Manage operators, staff, and site assignments</p></div>
        <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
          <DialogTrigger asChild><Button className="bg-gradient-to-r from-blue-500 to-indigo-600"><UserPlus className="h-4 w-4 mr-2" /> Add User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div><Label>Name *</Label><Input placeholder="Full name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Email *</Label><Input type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} className="mt-1" /></div>
              <div><Label>Role *</Label><Select value={form.role} onValueChange={(v) => setForm(prev => ({ ...prev, role: v }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="operator">Operator</SelectItem><SelectItem value="staff">Staff</SelectItem></SelectContent></Select></div>
            </div>
            <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={handleCreateUser}>Create User</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle></DialogHeader>
          <div className="py-4 space-y-3">
            {sites.map(site => (
              <div key={site.id} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-slate-50">
                <Checkbox id={site.id} checked={selectedSites.includes(site.id)} onCheckedChange={(checked) => setSelectedSites(prev => checked ? [...prev, site.id] : prev.filter(id => id !== site.id))} />
                <label htmlFor={site.id} className="flex-1 cursor-pointer"><p className="font-medium">{site.name}</p><p className="text-xs text-muted-foreground">{site.code}</p></label>
              </div>
            ))}
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={handleSaveAssignments}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-0 shadow-lg">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Operators ({operators.length})</CardTitle></CardHeader>
        <CardContent>
          {operators.length === 0 ? <p className="text-muted-foreground text-center py-4">No operators yet</p> : (
            <div className="space-y-3">
              {operators.map(op => (
                <div key={op.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><User className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="font-medium">{op.name}</p>
                      <p className="text-xs text-muted-foreground">{op.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">{getUserSites(op.id).map((site, i) => <Badge key={i} variant="outline" className="text-xs">{site}</Badge>)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(op)}><Building className="h-4 w-4 mr-1" /> Sites</Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(op.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" /> Staff ({staffMembers.length})</CardTitle></CardHeader>
        <CardContent>
          {staffMembers.length === 0 ? <p className="text-muted-foreground text-center py-4">No staff members yet</p> : (
            <div className="space-y-3">
              {staffMembers.map(staff => (
                <div key={staff.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><User className="h-5 w-5 text-green-600" /></div>
                    <div>
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">{getUserSites(staff.id).map((site, i) => <Badge key={i} variant="outline" className="text-xs">{site}</Badge>)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(staff)}><Building className="h-4 w-4 mr-1" /> Sites</Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(staff.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteFilter = selectedSite === 'all' ? siteIds : selectedSite;
      const [reportsRes, dailyRes, statsRes] = await Promise.all([
        fetch(`/api/reports?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
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

// ============== STAFF ACCESS MANAGEMENT ==============
function StaffAccessManagement({ user, sites }) {
  const [staffUsers, setStaffUsers] = useState([]);
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAssignSites, setShowAssignSites] = useState(null);
  const [selectedSites, setSelectedSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: 'demo123' });

  const loadData = useCallback(async () => {
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch('/api/users?role=staff'),
        fetch(`/api/staff-assignments?operatorId=${user.id}`)
      ]);
      const [usersData, assignmentsData] = await Promise.all([usersRes.json(), assignmentsRes.json()]);
      setStaffUsers(usersData);
      setStaffAssignments(assignmentsData);
    } catch (err) { console.error('Failed to load staff:', err); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateStaff = async () => {
    if (!form.name || !form.email) { alert('Name and email are required'); return; }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'staff', creatorRole: 'operator' })
      });
      if (res.ok) {
        setForm({ name: '', email: '', password: 'demo123' });
        setShowAddStaff(false);
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create staff member');
      }
    } catch (err) { alert('Failed to create staff: ' + err.message); }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!confirm('Are you sure? This will remove all site assignments for this staff member.')) return;
    await fetch(`/api/users/${staffId}`, { method: 'DELETE' });
    loadData();
  };

  const openAssignSites = (staff) => {
    const staffSiteIds = staffAssignments
      .filter(a => a.staff_user_id === staff.id)
      .map(a => a.site_id);
    setSelectedSites(staffSiteIds);
    setShowAssignSites(staff);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    const staffId = showAssignSites.id;
    const currentSiteIds = staffAssignments
      .filter(a => a.staff_user_id === staffId)
      .map(a => a.site_id);
    const toAdd = selectedSites.filter(id => !currentSiteIds.includes(id));
    const toRemove = staffAssignments
      .filter(a => a.staff_user_id === staffId && !selectedSites.includes(a.site_id))
      .map(a => a.id);

    try {
      for (const siteId of toAdd) {
        const res = await fetch('/api/staff-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_user_id: staffId,
            site_id: siteId,
            assigned_by_operator_id: user.id
          })
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Failed to assign site');
          return;
        }
      }
      for (const assignmentId of toRemove) {
        await fetch(`/api/staff-assignments/${assignmentId}`, { method: 'DELETE' });
      }
      setShowAssignSites(null);
      loadData();
    } catch (err) { alert('Failed to update assignments'); }
  };

  const getStaffSites = (staffId) =>
    staffAssignments
      .filter(a => a.staff_user_id === staffId)
      .map(a => a.site?.name || 'Unknown');

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Staff Management</h2>
          <p className="text-muted-foreground">Create staff members and assign them to your sites</p>
        </div>
        <Dialog open={showAddStaff} onOpenChange={setShowAddStaff}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-green-500 to-emerald-600">
              <UserPlus className="h-4 w-4 mr-2" /> Add Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Staff Member</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Name *</Label>
                <Input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleCreateStaff}>Create Staff Member</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle>
            <DialogDescription>Select which sites this staff member can access (from your assigned sites only)</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
            {sites.map(site => (
              <div key={site.id} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-slate-50">
                <Checkbox
                  id={site.id}
                  checked={selectedSites.includes(site.id)}
                  onCheckedChange={(checked) =>
                    setSelectedSites(prev =>
                      checked ? [...prev, site.id] : prev.filter(id => id !== site.id)
                    )
                  }
                />
                <label htmlFor={site.id} className="flex-1 cursor-pointer">
                  <p className="font-medium">{site.name}</p>
                  <p className="text-xs text-muted-foreground">{site.code} • {site.location}</p>
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Staff Members ({staffUsers.length})
          </CardTitle>
          <CardDescription>Staff members can submit shift reports for assigned sites</CardDescription>
        </CardHeader>
        <CardContent>
          {staffUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No staff members yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a staff member to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {staffUsers.map(staff => (
                <div key={staff.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-green-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {getStaffSites(staff.id).length > 0 ? (
                          getStaffSites(staff.id).map((site, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />{site}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs text-orange-600">No sites assigned</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssignSites(staff)}>
                      <Building className="h-4 w-4 mr-1" /> Assign Sites
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteStaff(staff.id)}>
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

// ============== STAFF DASHBOARD ==============
function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports?userId=${user.id}`);
      const data = await res.json();
      setReports(data);
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
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');
    if (savedUser && savedSites) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setSites(JSON.parse(savedSites));
      setActiveTab(parsedUser.role === 'staff' ? 'submit' : 'dashboard');
    }
    setInitialized(true);
  }, []);

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
    } catch (err) { console.error('Failed to refresh sites:', err); }
  };

  if (!initialized) { return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>; }
  if (!user) { return <LoginPage onLogin={handleLogin} loading={loading} />; }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      {user.role === 'staff' && <StaffDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'operator' && <OperatorDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'owner' && <OwnerDashboard user={user} sites={sites} activeTab={activeTab} onRefreshSites={refreshSites} />}
    </div>
  );
}
