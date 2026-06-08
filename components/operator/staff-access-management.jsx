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
  Loader2, UserPlus, UserMinus, User, Building2, Mail, ClipboardList,
  Search, Power, ChevronRight,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import { toast } from 'sonner';

/**
 * StaffAccessManagement — Operator-facing UI to manage staff who can
 * submit shift reports for the operator's own sites. Section B (Phase 2)
 * rebuild: card list with assigned-site badges, last-shift date, status
 * badge (Active / Invited / Inactive); Add Staff modal with two tabs
 * (Invite by email / Select existing user); site-scoped assignment.
 */
export default function StaffAccessManagement({ user, sites }) {
  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();

  const [staffUsers, setStaffUsers] = useState([]);
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]); // invites I sent that are still pending
  const [lastShiftByUser, setLastShiftByUser] = useState({}); // user_id -> ISO date
  const [loading, setLoading] = useState(true);

  // Add Staff modal
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addTab, setAddTab] = useState('invite'); // invite | existing
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', site_ids: [] });
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState('');
  const [pickedSiteIds, setPickedSiteIds] = useState([]);
  const [addBusy, setAddBusy] = useState(false);

  // Per-row "manage sites" modal
  const [managing, setManaging] = useState(null); // staff user object
  const [manageSiteIds, setManageSiteIds] = useState([]);
  const [manageBusy, setManageBusy] = useState(false);

  /* ----- Load all data ----- */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteIds = (sites || []).map((s) => s.id).join(',');
      const [usersRes, asnRes, invRes, reportsRes] = await Promise.all([
        authedFetch('/api/users?role=staff'),
        authedFetch(`/api/staff-assignments?operatorId=${user.id}`),
        authedFetch(`/api/invites?invitedBy=${user.id}`),
        siteIds ? authedFetch(`/api/reports?siteIds=${siteIds}`) : Promise.resolve(null),
      ]);
      const usersData = await usersRes.json().catch(() => []);
      const asnData = await asnRes.json().catch(() => []);
      const invData = await invRes.json().catch(() => []);
      const reportsData = reportsRes ? await reportsRes.json().catch(() => []) : [];

      setStaffUsers(Array.isArray(usersData) ? usersData : []);
      setStaffAssignments(Array.isArray(asnData) ? asnData : []);
      setPendingInvites(
        Array.isArray(invData)
          ? invData.filter((i) => i.status === 'pending' && i.role === 'staff')
          : []
      );

      // Last shift per staff (only those for THIS operator's sites)
      const map = {};
      if (Array.isArray(reportsData)) {
        for (const r of reportsData) {
          const uid = r.submitted_by_user_id || r.user_id;
          if (!uid) continue;
          if (!map[uid] || r.date > map[uid]) map[uid] = r.date;
        }
      }
      setLastShiftByUser(map);
    } catch (e) {
      console.error('staff load failed', e);
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [user.id, sites]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ----- Derived: only staff who have at least one assignment to MY sites ----- */
  const mySiteIdSet = useMemo(() => new Set((sites || []).map((s) => s.id)), [sites]);

  // Assignments scoped to my sites
  const myAssignments = useMemo(
    () => staffAssignments.filter((a) => mySiteIdSet.has(a.site_id)),
    [staffAssignments, mySiteIdSet]
  );

  // staff_user_id → array of site IDs assigned (within my sites)
  const sitesByStaffUserId = useMemo(() => {
    const m = {};
    for (const a of myAssignments) {
      if (!m[a.staff_user_id]) m[a.staff_user_id] = [];
      m[a.staff_user_id].push(a.site_id);
    }
    return m;
  }, [myAssignments]);

  // Cards to render = staff users with at least one assignment to my sites
  const visibleStaff = useMemo(() => {
    const ids = Object.keys(sitesByStaffUserId);
    return staffUsers.filter((u) => ids.includes(u.id));
  }, [staffUsers, sitesByStaffUserId]);

  // Existing users that AREN'T already assigned to any of my sites
  const pickableStaff = useMemo(() => {
    const assignedSet = new Set(Object.keys(sitesByStaffUserId));
    const q = search.trim().toLowerCase();
    return staffUsers
      .filter((u) => !assignedSet.has(u.id))
      .filter((u) =>
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
  }, [staffUsers, sitesByStaffUserId, search]);

  /* ----- Status helper ----- */
  const statusOf = (u) => {
    if (u.status === 'inactive') return { label: 'Inactive', cls: 'bg-slate-100 text-slate-600' };
    if (u.status === 'invited') return { label: 'Invited', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
  };

  const siteNameById = useMemo(() => {
    const m = {};
    for (const s of sites || []) m[s.id] = s;
    return m;
  }, [sites]);

  /* ----- Add Staff: open / close ----- */
  const openAddStaff = () => {
    setShowAddStaff(true);
    setAddTab('invite');
    setInviteForm({ email: '', name: '', site_ids: [] });
    setPicked(null);
    setPickedSiteIds([]);
    setSearch('');
  };
  const closeAddStaff = () => {
    setShowAddStaff(false);
    setInviteForm({ email: '', name: '', site_ids: [] });
    setPicked(null);
    setPickedSiteIds([]);
  };

  const sendInvite = async () => {
    if (!inviteForm.email) { toast.error('Email is required'); return; }
    if (inviteForm.site_ids.length === 0) { toast.error('Pick at least one site'); return; }
    setAddBusy(true);
    try {
      const res = await authedFetch('/api/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || null,
          role: 'staff',
          site_ids: inviteForm.site_ids,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Invite sent to ${inviteForm.email}`);
        closeAddStaff();
        await loadData();
      } else {
        toast.error(data.error || data.message || 'Invite failed');
      }
    } catch (e) {
      toast.error('Invite failed: ' + e.message);
    } finally { setAddBusy(false); }
  };

  const addExistingStaff = async () => {
    if (!picked) { toast.error('Pick a staff member'); return; }
    if (pickedSiteIds.length === 0) { toast.error('Pick at least one site'); return; }
    setAddBusy(true);
    try {
      for (const siteId of pickedSiteIds) {
        await authedFetch('/api/staff-assignments', {
          method: 'POST',
          body: JSON.stringify({
            staff_user_id: picked.id,
            site_id: siteId,
            assigned_by_operator_id: user.id,
          }),
        });
      }
      toast.success(`${picked.name || picked.email} added to ${pickedSiteIds.length} site${pickedSiteIds.length === 1 ? '' : 's'}`);
      closeAddStaff();
      await loadData();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    } finally { setAddBusy(false); }
  };

  /* ----- Manage sites (per row) ----- */
  const openManage = (u) => {
    setManaging(u);
    setManageSiteIds(sitesByStaffUserId[u.id] || []);
  };
  const closeManage = () => { setManaging(null); setManageSiteIds([]); };

  const saveManage = async () => {
    if (!managing) return;
    setManageBusy(true);
    try {
      const current = new Set(sitesByStaffUserId[managing.id] || []);
      const target = new Set(manageSiteIds);
      const toAdd = [...target].filter((id) => !current.has(id));
      const toRemove = staffAssignments.filter(
        (a) => a.staff_user_id === managing.id && current.has(a.site_id) && !target.has(a.site_id)
      );
      // Removals
      for (const a of toRemove) {
        await authedFetch(`/api/staff-assignments/${a.id}`, { method: 'DELETE' });
      }
      // Additions
      for (const siteId of toAdd) {
        await authedFetch('/api/staff-assignments', {
          method: 'POST',
          body: JSON.stringify({
            staff_user_id: managing.id,
            site_id: siteId,
            assigned_by_operator_id: user.id,
          }),
        });
      }
      toast.success(`Updated site access for ${managing.name || managing.email}`);
      closeManage();
      await loadData();
    } catch (e) {
      toast.error('Save failed: ' + e.message);
    } finally { setManageBusy(false); }
  };

  /* ----- Remove from single site / Remove from all ----- */
  const removeFromOneSite = async (staff, assignmentRow) => {
    const site = siteNameById[assignmentRow.site_id];
    const ok = await confirmDialog(
      `Remove ${staff.name || staff.email}'s access to ${site?.name || 'this site'}?`,
      `They will no longer be able to submit shift reports for this site.`,
      { destructive: true, confirmLabel: 'Remove' }
    );
    if (!ok) return;
    try {
      const res = await authedFetch(`/api/staff-assignments/${assignmentRow.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Removed from site');
        await loadData();
      } else {
        toast.error('Failed to remove');
      }
    } catch (e) { toast.error('Failed: ' + e.message); }
  };

  const removeFromAll = async (staff) => {
    const ok = await confirmDialog(
      `Deactivate ${staff.name || staff.email}?`,
      `This will remove all of their site assignments under your sites. They will lose all submit access for your sites.`,
      { destructive: true, confirmLabel: 'Deactivate' }
    );
    if (!ok) return;
    try {
      const rows = staffAssignments.filter(
        (a) => a.staff_user_id === staff.id && mySiteIdSet.has(a.site_id)
      );
      for (const a of rows) {
        await authedFetch(`/api/staff-assignments/${a.id}`, { method: 'DELETE' });
      }
      toast.success(`${staff.name || staff.email} deactivated`);
      await loadData();
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  /* ----- Render ----- */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Staff Management</h2>
          <p className="text-muted-foreground">Manage who can submit shift reports for your sites</p>
        </div>
        <Button onClick={openAddStaff} className="bg-teal-600 hover:bg-teal-700">
          <UserPlus className="h-4 w-4 mr-2" /> Add Staff
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}

      {/* Pending invites strip */}
      {pendingInvites.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Mail className="h-4 w-4 text-amber-700" />
            <span className="text-sm text-amber-900 font-medium">
              {pendingInvites.length} pending invite{pendingInvites.length === 1 ? '' : 's'}:
            </span>
            <span className="text-xs text-amber-800 break-all">
              {pendingInvites.map((i) => i.email).join(', ')}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Staff cards */}
      {!loading && visibleStaff.length === 0 && pendingInvites.length === 0 && (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="p-8 text-center text-muted-foreground">
            <User className="h-10 w-10 mx-auto opacity-50 mb-2" />
            <p className="font-medium text-foreground">No staff assigned yet</p>
            <p className="text-sm">Use <strong>Add Staff</strong> to invite or pick from existing users.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {visibleStaff.map((staff) => {
          const status = statusOf(staff);
          const assignedSiteIds = sitesByStaffUserId[staff.id] || [];
          const lastShift = lastShiftByUser[staff.id];
          const assignmentRows = staffAssignments.filter(
            (a) => a.staff_user_id === staff.id && mySiteIdSet.has(a.site_id)
          );
          return (
            <Card key={staff.id} className="border border-border/50 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-100 text-teal-700 font-semibold">
                      {(staff.name || staff.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{staff.name || '—'}</div>
                      <div className="text-xs text-muted-foreground truncate">{staff.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={status.cls + ' hover:' + status.cls}>{status.label}</Badge>
                    <Button variant="outline" size="sm" onClick={() => openManage(staff)}>
                      <Building2 className="h-3.5 w-3.5 mr-1.5" /> Manage sites
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => removeFromAll(staff)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Power className="h-3.5 w-3.5 mr-1.5" /> Remove all
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mr-1">Sites:</span>
                    {assignedSiteIds.length === 0 ? (
                      <span className="text-muted-foreground italic">none</span>
                    ) : (
                      assignmentRows.map((row) => {
                        const s = siteNameById[row.site_id];
                        if (!s) return null;
                        return (
                          <Badge key={row.id} variant="outline" className="gap-1 pr-1">
                            {s.code || s.name}
                            <button type="button" onClick={() => removeFromOneSite(staff, row)}
                              className="ml-0.5 rounded hover:bg-red-100 hover:text-red-700 p-0.5"
                              aria-label={`Remove from ${s.name}`}>
                              <UserMinus className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <ClipboardList className="h-4 w-4" />
                    <span>{lastShift ? `Last shift ${lastShift}` : 'No shifts yet'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ADD STAFF MODAL */}
      <Dialog open={showAddStaff} onOpenChange={(o) => { if (!o) closeAddStaff(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Add staff member
            </DialogTitle>
            <DialogDescription>Invite a new staff member by email or pick someone already in the system.</DialogDescription>
          </DialogHeader>

          <div className="inline-flex rounded-md border bg-background p-0.5 self-start">
            <button type="button" onClick={() => setAddTab('invite')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${addTab === 'invite' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              Invite by email
            </button>
            <button type="button" onClick={() => setAddTab('existing')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${addTab === 'existing' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              Select existing user
            </button>
          </div>

          {addTab === 'invite' && (
            <div className="space-y-3">
              <div>
                <Label>Email *</Label>
                <Input type="email" placeholder="staff@example.com" value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Name (optional)</Label>
                <Input placeholder="John Smith" value={inviteForm.name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>Site access *</Label>
                <div className="mt-2 max-h-40 overflow-y-auto border rounded-md p-2 space-y-1.5">
                  {(sites || []).map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={inviteForm.site_ids.includes(s.id)}
                        onCheckedChange={(c) => setInviteForm((p) => ({
                          ...p,
                          site_ids: c ? [...p.site_ids, s.id] : p.site_ids.filter((id) => id !== s.id),
                        }))} />
                      <span className="truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> An invite email with a magic link will be sent.
              </p>
            </div>
          )}

          {addTab === 'existing' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email…" value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <div className="max-h-44 overflow-y-auto border rounded-md divide-y">
                {pickableStaff.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    {staffUsers.length === 0 ? 'No staff users exist yet — use the Invite tab.' : 'No matching users.'}
                  </div>
                ) : pickableStaff.map((u) => (
                  <button key={u.id} type="button" onClick={() => setPicked(u)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/60 ${picked?.id === u.id ? 'bg-teal-50' : ''}`}>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm font-medium">
                      {(u.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-sm truncate">{u.name || u.email}</span>
                      <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
                    </span>
                    {picked?.id === u.id && <ChevronRight className="h-4 w-4 text-teal-600" />}
                  </button>
                ))}
              </div>
              {picked && (
                <div>
                  <Label>Assign to which sites *</Label>
                  <div className="mt-2 max-h-32 overflow-y-auto border rounded-md p-2 space-y-1.5">
                    {(sites || []).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={pickedSiteIds.includes(s.id)}
                          onCheckedChange={(c) => setPickedSiteIds((prev) => c ? [...prev, s.id] : prev.filter((id) => id !== s.id))} />
                        <span className="truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={addBusy}>Cancel</Button></DialogClose>
            {addTab === 'invite' ? (
              <Button onClick={sendInvite} disabled={!inviteForm.email || inviteForm.site_ids.length === 0 || addBusy}>
                {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invite'}
              </Button>
            ) : (
              <Button onClick={addExistingStaff} disabled={!picked || pickedSiteIds.length === 0 || addBusy}>
                {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to sites'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MANAGE SITES MODAL */}
      <Dialog open={!!managing} onOpenChange={(o) => { if (!o) closeManage(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage site access</DialogTitle>
            <DialogDescription>{managing?.name || managing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(sites || []).map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm p-2 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={manageSiteIds.includes(s.id)}
                  onCheckedChange={(c) => setManageSiteIds((prev) => c ? [...prev, s.id] : prev.filter((id) => id !== s.id))} />
                <span className="flex-1 truncate">{s.name} <span className="text-muted-foreground">({s.code})</span></span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={manageBusy}>Cancel</Button></DialogClose>
            <Button onClick={saveManage} disabled={manageBusy}>
              {manageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}
