'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ShieldAlert, LogOut, Loader2, Database, Users, Building2, FileText, Activity,
  Filter, RefreshCw, ChevronDown, ChevronRight, Calendar, AlertTriangle,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

const ACTION_COLORS = {
  login: 'bg-blue-100 text-blue-700',
  login_failed: 'bg-red-100 text-red-700',
  insert: 'bg-emerald-100 text-emerald-700',
  update: 'bg-amber-100 text-amber-700',
  delete: 'bg-rose-100 text-rose-700',
  support_account_created: 'bg-purple-100 text-purple-700',
};

export default function FounderDashboardPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    action: 'all',
    table: 'all',
    actor: '',
  });

  // Auth guard
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('workflowlite_user') || 'null');
      const support = localStorage.getItem('fops_support_session');
      if (!u || u.role !== 'support' || !support) {
        router.replace('/founder');
        return;
      }
      setUser(u);
      setAuthReady(true);
    } catch {
      router.replace('/founder');
    }
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      const res = await authedFetch('/api/founder/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setStats(data);
    } catch (e) {
      console.error('Stats load failed', e);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.action && filters.action !== 'all') params.set('action', filters.action);
      if (filters.table && filters.table !== 'all') params.set('table', filters.table);
      if (filters.actor) params.set('actor', filters.actor);
      params.set('limit', '200');
      const res = await authedFetch(`/api/founder/audit-log?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Audit load failed', e);
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { if (authReady) { loadStats(); loadAudit(); } }, [authReady, loadStats, loadAudit]);

  const logout = () => {
    localStorage.removeItem('workflowlite_user');
    localStorage.removeItem('workflowlite_sites');
    localStorage.removeItem('supabase-session');
    localStorage.removeItem('fops_support_session');
    router.replace('/founder');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">FOPS Founder Console</h1>
              <p className="text-xs text-slate-300">Cross-tenant administration · {user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={logout} className="text-slate-200 hover:bg-slate-700 gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* System overview cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <SystemCard icon={Database} label="Tenants (Owners)" value={stats.roleBreakdown?.owner ?? 0} color="from-blue-500 to-indigo-600" />
            <SystemCard icon={Users} label="Operators" value={stats.roleBreakdown?.operator ?? 0} color="from-emerald-500 to-teal-600" />
            <SystemCard icon={Users} label="Staff" value={stats.roleBreakdown?.staff ?? 0} color="from-purple-500 to-pink-600" />
            <SystemCard icon={Building2} label="Sites" value={stats.counts?.sites ?? 0} color="from-cyan-500 to-blue-600" />
            <SystemCard icon={FileText} label="Reports" value={stats.counts?.shift_reports ?? 0} color="from-amber-500 to-orange-600" />
            <SystemCard icon={Activity} label="Audit Events 7d" value={stats.auditActivity?.last7d ?? 0} color="from-rose-500 to-red-600" />
          </div>
        )}

        {/* Action breakdown chips */}
        {stats?.auditActivity?.byActionLast7d && Object.keys(stats.auditActivity.byActionLast7d).length > 0 && (
          <Card className="border-0 shadow">
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Activity (last 7d):</span>
              {Object.entries(stats.auditActivity.byActionLast7d).map(([action, count]) => (
                <Badge key={action} className={`${ACTION_COLORS[action] || 'bg-slate-100 text-slate-700'} gap-1`}>
                  {action} · <strong>{count}</strong>
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="border-0 shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-600" /> Audit Timeline Filters
            </CardTitle>
            <CardDescription>{total.toLocaleString()} events match · showing latest {rows.length}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Action</Label>
                <Select value={filters.action} onValueChange={(v) => setFilters((f) => ({ ...f, action: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="login">login</SelectItem>
                    <SelectItem value="login_failed">login_failed</SelectItem>
                    <SelectItem value="insert">insert</SelectItem>
                    <SelectItem value="update">update</SelectItem>
                    <SelectItem value="delete">delete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Table</Label>
                <Select value={filters.table} onValueChange={(v) => setFilters((f) => ({ ...f, table: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tables</SelectItem>
                    <SelectItem value="users">users</SelectItem>
                    <SelectItem value="sites">sites</SelectItem>
                    <SelectItem value="shift_reports">shift_reports</SelectItem>
                    <SelectItem value="dip_readings">dip_readings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Actor (email/id)</Label>
                  <Input value={filters.actor} onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))} placeholder="search…" />
                </div>
                <Button onClick={loadAudit} variant="outline" size="icon" className="mt-5" title="Refresh">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" /> Audit Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No audit events match these filters.
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="divide-y">
                  {rows.map((r) => (
                    <AuditRow key={r.id} row={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function SystemCard({ icon: Icon, label, value, color }) {
  return (
    <Card className={`border-0 shadow bg-gradient-to-br ${color} text-white`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold opacity-90 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-0.5">{Number(value).toLocaleString()}</p>
          </div>
          <Icon className="h-5 w-5 opacity-90" />
        </div>
      </CardContent>
    </Card>
  );
}

function AuditRow({ row, expanded, onToggle }) {
  const when = new Date(row.created_at);
  const cls = ACTION_COLORS[row.action] || 'bg-slate-100 text-slate-700';
  return (
    <div className="px-4 py-2.5 hover:bg-slate-50">
      <button onClick={onToggle} className="w-full flex items-start gap-3 text-left">
        <span className="mt-0.5">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${cls} text-[10px] font-bold uppercase`}>{row.action}</Badge>
            {row.table_name && <span className="text-xs font-mono text-slate-600">{row.table_name}</span>}
            {row.record_id && <span className="text-[10px] text-slate-400 font-mono truncate">#{String(row.record_id).slice(0, 8)}</span>}
            <span className="text-xs text-muted-foreground ml-auto">{when.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium' })}</span>
          </div>
          <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-slate-700 font-medium">{row.actor_email || 'anonymous'}</span>
            {row.actor_role && <Badge variant="outline" className="text-[10px]">{row.actor_role}</Badge>}
            {row.ip_address && <span className="text-[10px] text-slate-400 font-mono">{row.ip_address}</span>}
            {row.site_id && <span className="text-[10px] text-slate-400">site:{String(row.site_id).slice(0, 8)}</span>}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-2 ml-7 grid md:grid-cols-2 gap-3 text-xs">
          {row.before_state && (
            <div>
              <div className="font-semibold text-slate-500 mb-1">Before</div>
              <pre className="p-2 bg-rose-50 border border-rose-200 rounded text-[10px] overflow-x-auto max-h-60">{JSON.stringify(row.before_state, null, 2)}</pre>
            </div>
          )}
          {row.after_state && (
            <div>
              <div className="font-semibold text-slate-500 mb-1">After</div>
              <pre className="p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px] overflow-x-auto max-h-60">{JSON.stringify(row.after_state, null, 2)}</pre>
            </div>
          )}
          {row.metadata && Object.keys(row.metadata).length > 0 && (
            <div className="md:col-span-2">
              <div className="font-semibold text-slate-500 mb-1">Metadata</div>
              <pre className="p-2 bg-slate-100 border rounded text-[10px] overflow-x-auto">{JSON.stringify(row.metadata, null, 2)}</pre>
            </div>
          )}
          {row.user_agent && (
            <div className="md:col-span-2 text-[10px] text-slate-500 font-mono break-all">UA: {row.user_agent}</div>
          )}
        </div>
      )}
    </div>
  );
}
