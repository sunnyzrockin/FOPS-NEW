'use client';
/* eslint-disable react-hooks/set-state-in-effect -- async fetch in effect */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, CheckCircle2, XCircle, Clock, AlertCircle, ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { resolveFieldValue, bankingSalesFields } from '@/lib/field-resolver';

/**
 * OperatorReportsPanel — scrollable shift-report review panel for operators.
 *
 *  • Filter bar (site, date range, status)
 *  • max-h scroll container so the page doesn't bloat past one screen
 *  • Click any row to expand → see Raw Field Values + per-formula results
 *  • Inline Approve / Reject buttons inside the expanded row
 *      - Approve  → PUT /api/reports/:id/status { status: 'approved' }
 *      - Reject   → reveals a small textarea for a reason, then
 *                   PUT /api/reports/:id/status { status: 'rejected', notes }
 *      - Both use authedFetch() and surface success/failure via sonner.
 *      - The row's status badge updates inline without reloading the page.
 *
 *  The component is read-only for staff (we only mount it on the operator
 *  + owner dashboards), but the parent passes `canChangeStatus` defensively.
 */
export default function OperatorReportsPanel({
  sites,
  user,
  initialDate = new Date().toISOString().split('T')[0],
  canChangeStatus = true,
}) {
  const allowedSiteIds = useMemo(() => sites.map((s) => s.id), [sites]);

  // Filters
  const [siteFilter, setSiteFilter] = useState('all'); // 'all' | siteId
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [dateFrom, setDateFrom] = useState(initialDate);
  const [dateTo, setDateTo] = useState(initialDate);

  // Data
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-row UI state
  const [expandedId, setExpandedId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState({}); // {reportId: detailPayload}
  // FIX 1 v2: cache full site_field_configs payload (in sort order). The
  // Raw Field Values grid is driven by these rows, filtered to enabled +
  // show_in_banking. No hardcoded field list any more.
  const [siteFieldConfigs, setSiteFieldConfigs] = useState({});
  const [busyAction, setBusyAction] = useState(null);  // reportId currently approving/rejecting
  const [rejectingId, setRejectingId] = useState(null); // reportId showing reject reason input
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (allowedSiteIds.length === 0) { setReports([]); setLoading(false); return; }
    setLoading(true);
    try {
      const siteIds = (siteFilter === 'all' ? allowedSiteIds : [siteFilter]).join(',');
      const res = await authedFetch(
        `/api/reports?siteIds=${siteIds}&startDate=${dateFrom}&endDate=${dateTo}`,
      );
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[OperatorReportsPanel] load failed:', e);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [allowedSiteIds, siteFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports;
    return reports.filter((r) => (r.status || 'pending') === statusFilter);
  }, [reports, statusFilter]);

  // Lazy-load detail + per-site label map on row expand.
  const handleExpand = async (reportId, siteId) => {
    if (expandedId === reportId) { setExpandedId(null); return; }
    setExpandedId(reportId);
    if (!expandedDetail[reportId]) {
      try {
        const res = await authedFetch(`/api/reports/${reportId}`);
        const data = await res.json();
        setExpandedDetail((prev) => ({ ...prev, [reportId]: data }));
      } catch (e) { console.error(e); }
    }
    if (siteId && !siteFieldConfigs[siteId]) {
      try {
        const cfgRes = await authedFetch(`/api/field-configs?siteId=${siteId}`);
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          const rows = Array.isArray(cfg) ? cfg : (cfg?.fields || cfg?.data || []);
          setSiteFieldConfigs((prev) => ({ ...prev, [siteId]: rows }));
        }
      } catch { /* fallback to empty-state message */ }
    }
  };

  const changeStatus = async (reportId, status, notes = null) => {
    setBusyAction(reportId);
    try {
      const res = await authedFetch(`/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewed_by_user_id: user?.id,
          ...(notes ? { notes } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      // Optimistic update so the badge changes immediately.
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      setExpandedDetail((prev) => (prev[reportId] ? { ...prev, [reportId]: { ...prev[reportId], status } } : prev));
      toast.success(`Report ${status}`);
      setRejectingId(null);
      setRejectReason('');
    } catch (e) {
      toast.error(`Failed: ${e?.message || 'unknown error'}`);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle>Shift Reports</CardTitle>
        <CardDescription>
          Review and approve individual shift reports. Click a row to expand and act inline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Filter bar ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="space-y-1">
            <Label className="text-xs">Site</Label>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filteredReports.length} of {reports.length} report{reports.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* ── Scrollable list ────────────────────────────────────── */}
        <div className="max-h-[600px] overflow-y-auto divide-y divide-border/60 rounded-lg border">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
          ) : filteredReports.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-10">No reports match these filters.</p>
          ) : (
            filteredReports.map((r) => {
              const isOpen = expandedId === r.id;
              const detail = expandedDetail[r.id];
              const siteName = sites.find((s) => s.id === r.site_id)?.name || r.site_id;
              const status = r.status || 'pending';

              return (
                <div key={r.id} className="bg-white">
                  {/* Summary row */}
                  <button
                    type="button"
                    onClick={() => handleExpand(r.id, r.site_id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{r.shift_type} · {siteName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.date} · Banking {formatCurrency(
                          r.formula_total != null
                            ? r.formula_total
                            : (r.banking_value ?? r.total_revenue ?? r.total_sales ?? 0),
                        )}
                      </div>
                    </div>
                    <StatusPill status={status} />
                  </button>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 bg-muted/20 border-t space-y-3">
                      {!detail ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading details…
                        </div>
                      ) : (
                        <>
                          <RawFieldGrid detail={detail} configs={siteFieldConfigs[r.site_id]} />

                          {/* Approve / Reject actions */}
                          {canChangeStatus && status !== 'approved' && status !== 'rejected' && (
                            <div className="pt-2 border-t border-dashed">
                              {rejectingId === r.id ? (
                                <div className="space-y-2">
                                  <Label className="text-xs">Rejection reason</Label>
                                  <Textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Why is this being rejected? The staff member will see this."
                                    rows={2}
                                    className="text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm" variant="destructive"
                                      disabled={busyAction === r.id || !rejectReason.trim()}
                                      onClick={() => changeStatus(r.id, 'rejected', rejectReason.trim())}
                                    >
                                      {busyAction === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                                      Confirm reject
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={busyAction === r.id}
                                    onClick={() => changeStatus(r.id, 'approved')}
                                  >
                                    {busyAction === r.id
                                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm" variant="outline"
                                    className="text-red-700 border-red-200 hover:bg-red-50"
                                    disabled={busyAction === r.id}
                                    onClick={() => setRejectingId(r.id)}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {(status === 'approved' || status === 'rejected') && (
                            <p className="text-[11px] text-muted-foreground">
                              Already {status} · last updated {formatDateTime(detail.updated_at || detail.created_at)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Subcomponents ===== */

const STATUS_TONES = {
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: XCircle },
  reviewed: { label: 'Reviewed', cls: 'bg-blue-50 text-blue-700 ring-blue-200', Icon: CheckCircle2 },
  pending:  { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: Clock },
  flagged:  { label: 'Flagged',  cls: 'bg-red-50 text-red-700 ring-red-200', Icon: AlertCircle },
};

function StatusPill({ status }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.pending;
  const Icon = tone.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${tone.cls}`}>
      <Icon className="h-3 w-3" /> {tone.label}
    </span>
  );
}

function RawFieldGrid({ detail, configs }) {
  // Driven entirely by site_field_configs (BUG 1 fix): filter strictly to
  // category === 'sales' && show_in_banking === true, in display_order.
  // Value lookup uses lib/field-resolver.js so config keys that don't
  // exactly match a flat column (e.g. cash_drop ↔ cash, account ↔
  // accounts, drive_off_iou ↔ drive_offs) still find their stored value.
  if (!Array.isArray(configs)) {
    return (
      <div>
        <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Raw Field Values</h4>
        <p className="text-xs text-muted-foreground">Loading configured fields…</p>
      </div>
    );
  }
  const fields = bankingSalesFields(configs);
  return (
    <div>
      <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Raw Field Values</h4>
      {fields.length === 0 ? (
        <div className="text-xs text-muted-foreground bg-white border border-dashed rounded-md py-3 px-3">
          This site has no banking-visible sales fields configured. Add them under
          <span className="font-medium"> Operator → Form Fields</span> and tick &ldquo;Show in banking&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {fields.map((f) => (
            <div key={f.id ?? f.key} className="bg-white border rounded-md p-2">
              <p className="text-[10px] text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium">{formatCurrency(resolveFieldValue(detail, f.key))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
