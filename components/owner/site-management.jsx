'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus, Loader2, MapPin, Pencil, Building2, Trash2, AlertTriangle, Download,
  UserPlus, UserMinus, Mail, Users, ClipboardList, ChevronRight,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import { toast } from 'sonner';

/**
 * SiteManagement — Owner-facing CRUD UI for fuel station sites + operator
 * assignment. Each site card surfaces who the assigned operator is, how
 * many staff are linked, and when the last shift report was submitted.
 *
 * Section A (Phase 2) — adds the "Assign Operator" / "Remove" workflow on
 * top of the existing Add/Edit/Delete site flows.
 */
export default function SiteManagement({ user, sites, onRefresh }) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '' });
  const [siteToDelete, setSiteToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  // Owner-only metadata we fetch on mount: who manages each site, how
  // many staff are linked, when each site last received a shift report.
  const [operatorAssignments, setOperatorAssignments] = useState([]); // [{id, site_id, operator: {id,name,email}}]
  const [staffCounts, setStaffCounts] = useState({}); // siteId -> integer
  const [lastShiftBySite, setLastShiftBySite] = useState({}); // siteId -> ISO date
  const [allOperators, setAllOperators] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);

  // Assign / remove operator workflow
  const [assignFor, setAssignFor] = useState(null); // site object
  const [assignTab, setAssignTab] = useState('existing'); // existing | invite
  const [pickedOperator, setPickedOperator] = useState(null);
  const [extraSites, setExtraSites] = useState([]); // additional site ids to assign
  const [operatorSearch, setOperatorSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();

  /* ----- Fetch owner metadata on mount ----- */
  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const [opRes, staffRes, opsRes] = await Promise.all([
        authedFetch(`/api/operator-assignments?ownerId=${user.id}`),
        authedFetch(`/api/staff-assignments?ownerId=${user.id}`),
        authedFetch(`/api/users?role=operator`),
      ]);
      const [ops, staffs, allOps] = await Promise.all([
        opRes.json().catch(() => []),
        staffRes.json().catch(() => []),
        opsRes.json().catch(() => []),
      ]);
      setOperatorAssignments(Array.isArray(ops) ? ops : []);
      setAllOperators(Array.isArray(allOps) ? allOps : []);
      // Staff count per site — multiple rows per (site, staff) get deduped.
      const counts = {};
      if (Array.isArray(staffs)) {
        const seen = new Set();
        for (const r of staffs) {
          const key = `${r.site_id}::${r.staff_user_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          counts[r.site_id] = (counts[r.site_id] || 0) + 1;
        }
      }
      setStaffCounts(counts);

      // Last shift per site — query reports for all sites at once, sorted desc.
      const siteIds = (sites || []).map((s) => s.id).join(',');
      if (siteIds) {
        const rRes = await authedFetch(`/api/reports?siteIds=${siteIds}`);
        const reports = await rRes.json().catch(() => []);
        const map = {};
        if (Array.isArray(reports)) {
          for (const r of reports) {
            if (!map[r.site_id] || r.date > map[r.site_id]) map[r.site_id] = r.date;
          }
        }
        setLastShiftBySite(map);
      }
    } catch (e) {
      console.error('site-management metadata load failed', e);
    } finally {
      setMetaLoading(false);
    }
  }, [user.id, sites]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  /* ----- Site CRUD (unchanged from before) ----- */
  const handleSubmit = async () => {
    if (!form.name || !form.code) { toast.error('Site name and code are required'); return; }
    setLoading(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';
      const res = await authedFetch(url, { method, body: JSON.stringify({ ...form, owner_id: user.id }) });
      if (res.ok) {
        setForm({ name: '', code: '', location: '' });
        setShowAddSite(false);
        setEditingSite(null);
        onRefresh?.();
        toast.success(editingSite ? 'Site updated' : 'Site created');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save site');
      }
    } finally { setLoading(false); }
  };

  const exportSiteData = async (site) => {
    setExportBusy(true);
    try {
      const res = await authedFetch(`/api/sites/${site.id}/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${site.code}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Site data exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    } finally { setExportBusy(false); }
  };

  const confirmDelete = async () => {
    if (!siteToDelete) return;
    setDeleteBusy(true);
    try {
      const res = await authedFetch(`/api/sites/${siteToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Deleted ${siteToDelete.name}`);
        setSiteToDelete(null);
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to delete (HTTP ${res.status})`);
      }
    } finally { setDeleteBusy(false); }
  };

  /* ----- Operator assignment helpers ----- */
  const assignmentBySite = useMemo(() => {
    const m = {};
    for (const a of operatorAssignments) m[a.site_id] = a;
    return m;
  }, [operatorAssignments]);

  const unassignedSites = useMemo(
    () => (sites || []).filter((s) => !assignmentBySite[s.id]),
    [sites, assignmentBySite]
  );

  const openAssignModal = (site) => {
    setAssignFor(site);
    setAssignTab('existing');
    setPickedOperator(null);
    setExtraSites([]);
    setOperatorSearch('');
    setInviteEmail('');
    setInviteName('');
  };

  const closeAssignModal = () => {
    setAssignFor(null);
    setPickedOperator(null);
    setExtraSites([]);
    setOperatorSearch('');
    setInviteEmail('');
    setInviteName('');
  };

  const filteredOperators = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    if (!q) return allOperators;
    return allOperators.filter(
      (o) => (o.name || '').toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q)
    );
  }, [allOperators, operatorSearch]);

  const assignExistingOperator = async () => {
    if (!assignFor || !pickedOperator) return;
    setAssignBusy(true);
    try {
      // If the operator was already assigned to the target site, we still
      // re-assign (idempotent — server will reject or accept).
      const targets = [assignFor.id, ...extraSites];
      const existing = assignmentBySite[assignFor.id];
      // If reassigning, remove the old one first (warning was shown).
      if (existing && existing.operator?.id !== pickedOperator.id) {
        await authedFetch(`/api/operator-assignments/${existing.id}`, { method: 'DELETE' });
      }
      for (const siteId of targets) {
        const existingOnTarget = assignmentBySite[siteId];
        if (existingOnTarget && existingOnTarget.operator?.id === pickedOperator.id) continue;
        if (existingOnTarget) {
          await authedFetch(`/api/operator-assignments/${existingOnTarget.id}`, { method: 'DELETE' });
        }
        await authedFetch(`/api/operator-assignments`, {
          method: 'POST',
          body: JSON.stringify({
            operator_user_id: pickedOperator.id,
            site_id: siteId,
            assigned_by_owner_id: user.id,
          }),
        });
      }
      toast.success(`${pickedOperator.name} assigned to ${targets.length} site${targets.length === 1 ? '' : 's'}`);
      closeAssignModal();
      await loadMeta();
    } catch (e) {
      toast.error('Assignment failed: ' + e.message);
    } finally { setAssignBusy(false); }
  };

  const inviteNewOperator = async () => {
    if (!assignFor || !inviteEmail) { toast.error('Email is required'); return; }
    setAssignBusy(true);
    try {
      const res = await authedFetch('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || null,
          role: 'operator',
          site_ids: [assignFor.id, ...extraSites],
          invited_by: user.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Invite sent to ${inviteEmail}`);
        closeAssignModal();
        await loadMeta();
      } else {
        toast.error(data.error || data.message || 'Invite failed');
      }
    } catch (e) {
      toast.error('Invite failed: ' + e.message);
    } finally { setAssignBusy(false); }
  };

  const removeOperator = async (site, assignment) => {
    const ok = await confirmDialog(
      `Remove ${assignment.operator?.name || 'operator'} from ${site.name}?`,
      `They will lose access to this site and all staff they assigned here. They will be notified by email.`,
      { destructive: true, confirmLabel: 'Remove' }
    );
    if (!ok) return;
    try {
      const res = await authedFetch(`/api/operator-assignments/${assignment.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`${assignment.operator?.name || 'Operator'} removed from ${site.name}`);
        await loadMeta();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to remove operator');
      }
    } catch (e) {
      toast.error('Removal failed: ' + e.message);
    }
  };

  /* ----- Render ----- */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Site Management</h2>
          <p className="text-muted-foreground">Add and manage your fuel station sites &amp; their operators</p>
        </div>
        <Dialog
          open={showAddSite}
          onOpenChange={(open) => {
            setShowAddSite(open);
            if (!open) { setEditingSite(null); setForm({ name: '', code: '', location: '' }); }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" /> Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSite ? 'Edit Site' : 'Add New Site'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Site Name *</Label>
                <Input placeholder="e.g., Sunstate Fuel - Brisbane" value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Site Code *</Label>
                <Input placeholder="e.g., BNE-001" value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Location</Label>
                <Input placeholder="Full address" value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingSite ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {metaLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading operator assignments…
        </div>
      )}

      <div className="grid gap-4">
        {sites.map((site) => {
          const assignment = assignmentBySite[site.id];
          const staffN = staffCounts[site.id] || 0;
          const lastShift = lastShiftBySite[site.id];
          return (
            <Card key={site.id} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{site.name}</h3>
                      <p className="text-sm text-muted-foreground">{site.code}</p>
                      {site.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{site.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={site.status === 'active' ? 'default' : 'secondary'}
                      className={site.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                      {site.status}
                    </Badge>
                    <Button variant="ghost" size="icon"
                      onClick={() => { setEditingSite(site); setForm({ name: site.name, code: site.code, location: site.location || '' }); setShowAddSite(true); }}
                      title="Edit site">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSiteToDelete(site)} title="Delete site">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Operator + staff + last-shift row */}
                <div className="pt-3 border-t flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    {assignment ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                          {(assignment.operator?.name || '?').charAt(0).toUpperCase()}
                        </span>
                        <div className="leading-tight">
                          <div className="font-medium text-foreground">{assignment.operator?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{assignment.operator?.email || '—'}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">No operator assigned</span>
                    )}
                    <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{staffN} staff</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <ClipboardList className="h-4 w-4" />
                      <span>{lastShift ? `Last shift ${lastShift}` : 'No shifts yet'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {assignment ? (
                      <Button variant="outline" size="sm" onClick={() => removeOperator(site, assignment)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5">
                        <UserMinus className="h-3.5 w-3.5" /> Remove
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => openAssignModal(site)} className="gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" /> Assign Operator
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ASSIGN OPERATOR DIALOG */}
      <Dialog open={!!assignFor} onOpenChange={(o) => !o && closeAssignModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Assign operator to {assignFor?.name}
            </DialogTitle>
            <DialogDescription>
              Pick an existing operator or invite a new one by email.
            </DialogDescription>
          </DialogHeader>

          {/* Tab toggle */}
          <div className="inline-flex rounded-md border bg-background p-0.5 self-start">
            <button type="button" onClick={() => setAssignTab('existing')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${assignTab === 'existing' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              Existing operator
            </button>
            <button type="button" onClick={() => setAssignTab('invite')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${assignTab === 'invite' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              Invite new
            </button>
          </div>

          {assignTab === 'existing' && (
            <div className="space-y-3">
              <Input placeholder="Search by name or email…" value={operatorSearch}
                onChange={(e) => setOperatorSearch(e.target.value)} />
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {filteredOperators.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No operators match.</div>
                ) : filteredOperators.map((op) => (
                  <button key={op.id} type="button"
                    onClick={() => setPickedOperator(op)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/60 ${pickedOperator?.id === op.id ? 'bg-blue-50' : ''}`}>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-sm font-medium">
                      {(op.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-sm truncate">{op.name || op.email}</span>
                      <span className="block text-xs text-muted-foreground truncate">{op.email}</span>
                    </span>
                    {pickedOperator?.id === op.id && <ChevronRight className="h-4 w-4 text-blue-600" />}
                  </button>
                ))}
              </div>

              {pickedOperator && assignFor && assignmentBySite[assignFor.id] && assignmentBySite[assignFor.id].operator?.id !== pickedOperator.id && (
                <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  This will remove <strong className="mx-1">{assignmentBySite[assignFor.id].operator?.name}</strong> from {assignFor.name}.
                </div>
              )}

              {/* Multi-site checkbox list */}
              {unassignedSites.length > 0 && (
                <div>
                  <Label className="text-xs">Also assign to other unassigned sites (optional)</Label>
                  <div className="mt-2 max-h-32 overflow-y-auto border rounded-md p-2 space-y-1.5">
                    {unassignedSites.filter((s) => s.id !== assignFor?.id).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={extraSites.includes(s.id)}
                          onCheckedChange={(c) => {
                            setExtraSites((prev) => c ? [...prev, s.id] : prev.filter((id) => id !== s.id));
                          }}
                        />
                        <span className="truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {assignTab === 'invite' && (
            <div className="space-y-3">
              <div>
                <Label>Email *</Label>
                <Input type="email" placeholder="operator@example.com" value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Name (optional)</Label>
                <Input placeholder="Sarah Johnson" value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)} className="mt-1" />
              </div>
              {unassignedSites.length > 0 && (
                <div>
                  <Label className="text-xs">Also invite to other unassigned sites (optional)</Label>
                  <div className="mt-2 max-h-32 overflow-y-auto border rounded-md p-2 space-y-1.5">
                    {unassignedSites.filter((s) => s.id !== assignFor?.id).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={extraSites.includes(s.id)}
                          onCheckedChange={(c) => {
                            setExtraSites((prev) => c ? [...prev, s.id] : prev.filter((id) => id !== s.id));
                          }}
                        />
                        <span className="truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> An invite email will be sent with a magic link to set their password.
              </p>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={assignBusy}>Cancel</Button></DialogClose>
            {assignTab === 'existing' ? (
              <Button onClick={assignExistingOperator} disabled={!pickedOperator || assignBusy}>
                {assignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
              </Button>
            ) : (
              <Button onClick={inviteNewOperator} disabled={!inviteEmail || assignBusy}>
                {assignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invite'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE SITE DIALOG (unchanged) */}
      <Dialog open={!!siteToDelete} onOpenChange={(o) => !o && setSiteToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Delete site?
            </DialogTitle>
            <DialogDescription className="pt-2">
              You're about to delete <strong>{siteToDelete?.name}</strong> ({siteToDelete?.code}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
              <strong>Warning — this also removes:</strong>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>All shift reports submitted at this site</li>
                <li>All fuel inventory (dip) readings</li>
                <li>All fuel price change history</li>
                <li>All banking formulas configured for this site</li>
                <li>All staff and operator assignments to this site</li>
              </ul>
              <p className="mt-2">This cannot be undone. Export a JSON backup first.</p>
            </div>
            <Button variant="outline" className="w-full"
              onClick={() => siteToDelete && exportSiteData(siteToDelete)} disabled={exportBusy || deleteBusy}>
              {exportBusy
                ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>)
                : (<><Download className="h-4 w-4 mr-2" /> Export all site data (JSON)</>)}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={deleteBusy}>Cancel</Button></DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy
                ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</>)
                : (<><Trash2 className="h-4 w-4 mr-2" /> Delete permanently</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
