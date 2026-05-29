'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Banknote, Calendar, Building2, User, ChevronDown, ChevronUp,
  Loader2, Calculator, RefreshCw, CheckCircle, Clock, AlertCircle, Trash2,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

import { toast } from 'sonner';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
/**
 * BankingSubmissions — owner & operator-facing flat list of all shift report
 * submissions across their accessible sites. Each row shows top-line banking
 * total + submitter; click-to-expand reveals the full per-formula breakdown
 * (the `shift_formula_results` audit trail) and raw field values.
 *
 * Backed by GET /api/reports (RBAC-scoped server-side) and GET
 * /api/reports/:id (returns embedded `formula_results`). Same role-scoped
 * data — owner sees all, operator sees only assigned sites. Staff filter
 * is client-side.
 *
 * Phase 2 — Q2 option (a) deliverable.
 */
export default function BankingSubmissions({ user, sites, currentUserRole }) {
  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();
  // eslint-disable-next-line no-unused-vars
  const _user = user;
  const role = currentUserRole || user?.role;

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState({}); // {reportId: detailPayload}
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [siteFilter, setSiteFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  const siteIds = useMemo(() => sites.map((s) => s.id).join(','), [sites]);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const siteFilterIds = siteFilter === 'all' ? siteIds : siteFilter;
      const res = await authedFetch(
        `/api/form-submissions?siteIds=${siteFilterIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`
      );
      if (!res.ok) {
        // DO NOT hard-redirect on 401 here — authedFetch already retried
        // with a refreshed token. If the user is genuinely signed out the
        // auth context guard on /app will kick in. Showing an inline error
        // avoids surprise logouts on tab switches caused by transient
        // session glitches.
        const err = await res.json().catch(() => ({}));
        console.warn('submissions load failed:', err);
        setSubmissions([]);
        if (res.status === 401) {
          setLoadError('Your session has expired. Please refresh the page or click the tab again.');
        } else {
          setLoadError(err.message || err.error || `Failed to load submissions (HTTP ${res.status})`);
        }
        return;
      }
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('submissions load error:', e);
      setSubmissions([]);
      setLoadError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [siteFilter, dateRange, siteIds]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  // Apply staff filter client-side
  const filteredSubmissions = useMemo(() => {
    if (staffFilter === 'all') return submissions;
    return submissions.filter((s) => (s.submitted_by_user_id || s.staff_id) === staffFilter);
  }, [submissions, staffFilter]);

  // Build distinct staff list from the loaded submissions
  const staffOptions = useMemo(() => {
    const seen = new Map();
    submissions.forEach((s) => {
      const uid = s.submitted_by_user_id || s.staff_id;
      const name = s.staff_name || s.submitter?.name;
      if (uid && name && !seen.has(uid)) seen.set(uid, name);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [submissions]);

  // Aggregated summary cards
  const summary = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const totalBanking = filteredSubmissions.reduce(
      (acc, s) => acc + (parseFloat(s.banking_value || s.total_revenue) || 0), 0,
    );
    const submittedToday = filteredSubmissions.filter(
      (s) => (s.date || s.shift_date || '').slice(0, 10) === today,
    ).length;
    const pendingReview = filteredSubmissions.filter((s) => s.status !== 'reviewed').length;
    return { totalBanking, submittedToday, pendingReview };
  }, [filteredSubmissions]);

  const toggleRow = async (reportId) => {
    if (expandedId === reportId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reportId);
    if (!expandedDetail[reportId]) {
      setLoadingDetail(reportId);
      try {
        const res = await fetch(`/api/form-submissions/${reportId}`);
        const data = await res.json();
        setExpandedDetail((prev) => ({ ...prev, [reportId]: data }));
      } catch (e) {
        console.error('detail fetch failed:', e);
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  const handleDelete = async (reportId, e) => {
    e.stopPropagation();
    if (!(await confirmDialog('Delete submission?', 'This action is irreversible.', { destructive: true, confirmLabel: 'Delete' }))) return;
    try {
      const res = await authedFetch(`/api/form-submissions/${reportId}`, { method: 'DELETE' });
      if (res.ok) {
        loadSubmissions();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to delete');
      }
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Banknote className="h-6 w-6 text-blue-600" />
          Banking Submissions
        </h1>
        <p className="text-muted-foreground mt-1">
          Every shift report with its full banking-formula audit trail.
        </p>
      </div>

      {/* Filters */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Site</Label>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Submitted by</Label>
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={loadSubmissions}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/50 shadow-sm bg-gradient-to-br from-purple-500 to-pink-500 text-white">
          <CardContent className="p-4">
            <p className="text-sm opacity-90">Total Banking</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(summary.totalBanking)}</p>
            <p className="text-xs opacity-75 mt-1">across {filteredSubmissions.length} submissions</p>
          </CardContent>
        </Card>
        <Card className="border border-border/50 shadow-sm bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
          <CardContent className="p-4">
            <p className="text-sm opacity-90">Submitted Today</p>
            <p className="text-3xl font-bold mt-1">{summary.submittedToday}</p>
            <p className="text-xs opacity-75 mt-1">{formatDate(new Date().toISOString())}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/50 shadow-sm bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <CardContent className="p-4">
            <p className="text-sm opacity-90">Pending Review</p>
            <p className="text-3xl font-bold mt-1">{summary.pendingReview}</p>
            <p className="text-xs opacity-75 mt-1">awaiting operator sign-off</p>
          </CardContent>
        </Card>
      </div>

      {/* Submissions list */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Submissions ({filteredSubmissions.length})</CardTitle>
          <CardDescription>Click a row to expand the audit breakdown.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadError && !loading && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {loadError}
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={loadSubmissions}>
                Retry
              </Button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Banknote className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No submissions in the selected window.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[640px]">
              <div className="space-y-2">
                {filteredSubmissions.map((s) => {
                  const isOpen = expandedId === s.id;
                  const detail = expandedDetail[s.id];
                  return (
                    <div key={s.id} className="border rounded-xl overflow-hidden bg-white">
                      {/* Row header */}
                      <button
                        onClick={() => toggleRow(s.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold">{s.site_name || s.site?.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-3">
                              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(s.date || s.shift_date)}</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">{s.shift_type}</Badge>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{s.staff_name || s.submitter?.name}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">{formatCurrency(s.banking_value || s.total_revenue || 0)}</p>
                            <p className="text-xs text-muted-foreground">Banking</p>
                          </div>
                          <Badge
                            variant={s.status === 'reviewed' ? 'default' : 'secondary'}
                            className={s.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
                          >
                            {s.status === 'reviewed' ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                            {s.status}
                          </Badge>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </div>
                      </button>

                      {/* Expanded breakdown */}
                      {isOpen && (
                        <div className="border-t bg-slate-50 p-4">
                          {loadingDetail === s.id ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              {/* Audit metadata */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Submitted at</p>
                                  <p className="font-medium">{formatDateTime(detail.submitted_at)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Submitter</p>
                                  <p className="font-medium">{detail.staff_name || detail.submitter?.name}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Reviewer</p>
                                  <p className="font-medium">{detail.reviewed_by_name || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Reviewed at</p>
                                  <p className="font-medium">{detail.reviewed_at ? formatDateTime(detail.reviewed_at) : '—'}</p>
                                </div>
                              </div>

                              {/* Per-formula audit trail */}
                              {Array.isArray(detail.formula_results) && detail.formula_results.length > 0 ? (
                                <div>
                                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Calculator className="h-4 w-4 text-blue-600" />
                                    Formula Results
                                    <Badge variant="outline" className="text-xs">audit trail</Badge>
                                  </h4>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {detail.formula_results.map((fr) => (
                                      <div key={fr.id} className="bg-white border border-blue-200 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">{fr.formula_name}</p>
                                        <p className="text-xl font-bold text-blue-700">{formatCurrency(fr.result_value)}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                          calc {formatDateTime(fr.calculated_at)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm flex items-center gap-2 text-amber-700">
                                  <AlertCircle className="h-4 w-4" />
                                  No formula results stored for this submission.
                                </div>
                              )}

                              {/* Raw field values */}
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Raw Field Values</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    ['Fuel Sales', detail.fuel_sales],
                                    ['Shop Sales', detail.shop_sales],
                                    ['EFTPOS', detail.eftpos],
                                    ['Motorpass', detail.motorpass],
                                    ['Cash', detail.cash],
                                    ['Accounts', detail.accounts],
                                    ['Beverages', detail.beverages],
                                    ['Hot Food', detail.hot_food],
                                    ['Drive Offs', detail.drive_offs],
                                    ['Dips', detail.dips],
                                  ].map(([label, value]) => (
                                    <div key={label} className="bg-white border rounded-lg p-2">
                                      <p className="text-[10px] text-muted-foreground">{label}</p>
                                      <p className="text-sm font-medium">{formatCurrency(value || 0)}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Admin-only delete */}
                              {role === 'owner' && (
                                <div className="flex justify-end pt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleDelete(s.id, e)}
                                    className="text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" /> Delete Submission
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No detail available.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    
    <ConfirmDialog />
  </div>
  );
}
