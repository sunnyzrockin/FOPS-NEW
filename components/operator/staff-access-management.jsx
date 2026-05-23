'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2, UserPlus, User, Users, Building, Building2, Trash2, Mail, X,
} from 'lucide-react';

/**
 * StaffAccessManagement — Operator-facing UI to create staff members,
 * send invites, and assign them to sites the operator is responsible for.
 * Includes an inline debug panel (toggleable) showing the raw API responses
 * for quick triage. Extracted from /app/app/app/page.js as Phase C of the
 * dashboard monolith refactor. API contracts unchanged.
 */
export default function StaffAccessManagement({ user, sites }) {
  const [staffUsers, setStaffUsers] = useState([]);
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAssignSites, setShowAssignSites] = useState(null);
  const [selectedSites, setSelectedSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: 'demo123' });
  const [debug, setDebug] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  const loadData = useCallback(async () => {
    const t = Date.now();
    const dbg = { startedAt: new Date().toISOString(), userId: user.id };
    try {
      const usersUrl = `/api/users?role=staff&_t=${t}`;
      const assignmentsUrl = `/api/staff-assignments?operatorId=${user.id}&_t=${t}`;
      dbg.usersUrl = usersUrl;
      dbg.assignmentsUrl = assignmentsUrl;

      const [usersRes, assignmentsRes] = await Promise.all([
        fetch(usersUrl, { cache: 'no-store' }),
        fetch(assignmentsUrl, { cache: 'no-store' }),
      ]);
      dbg.usersStatus = usersRes.status;
      dbg.assignmentsStatus = assignmentsRes.status;

      const usersText = await usersRes.text();
      const assignmentsText = await assignmentsRes.text();
      dbg.usersBodyPreview = usersText.slice(0, 200);
      dbg.assignmentsBodyPreview = assignmentsText.slice(0, 200);

      let usersData = [];
      let assignmentsData = [];
      try { usersData = JSON.parse(usersText); } catch (e) { dbg.usersParseError = e.message; }
      try { assignmentsData = JSON.parse(assignmentsText); } catch (e) { dbg.assignmentsParseError = e.message; }

      const finalUsers = Array.isArray(usersData) ? usersData : [];
      const finalAssignments = Array.isArray(assignmentsData) ? assignmentsData : [];
      dbg.staffCount = finalUsers.length;
      dbg.assignmentsCount = finalAssignments.length;

      setStaffUsers(finalUsers);
      setStaffAssignments(finalAssignments);

      if (!Array.isArray(usersData)) {
        console.error('Failed to load staff list (non-array):', usersData);
      }
    } catch (err) {
      dbg.error = err.message;
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
      setDebug(dbg);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSendStaffInvite = async () => {
    if (!form.name || !form.email) { alert('Name and email are required'); return; }
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          role: 'staff',
          invited_by_user_id: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Failed to send invite: ${data.error || data.message || res.status}`);
        return;
      }
      const ackMsg = data.email_sent
        ? `Invite email sent to ${form.email}`
        : data.email_mocked
        ? `Invite created but email service is not configured. Share this link directly:\n\n${data.accept_url}`
        : `Invite created but email failed to send. Share this link directly:\n\n${data.accept_url}`;
      alert(ackMsg);
      setForm({ name: '', email: '', password: 'demo123' });
      setShowAddStaff(false);
    } catch (err) {
      alert('Failed to send invite: ' + err.message);
    }
  };

  const handleCreateStaff = async () => {
    if (!form.name || !form.email) { alert('Name and email are required'); return; }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'staff', creatorRole: 'operator' }),
      });

      const text = await res.text();
      if (!text) {
        alert(`Failed to create staff: Server returned empty response (HTTP ${res.status}). Please retry; if this persists, contact support.`);
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Response was not JSON:', text);
        alert(`Failed to create staff: Invalid server response (HTTP ${res.status}).\n\nRaw response:\n${text.slice(0, 300)}`);
        return;
      }

      if (res.ok) {
        setForm({ name: '', email: '', password: 'demo123' });
        setShowAddStaff(false);
        loadData();
      } else {
        const detail = data.error || data.message || 'Failed to create staff member';
        const code = data.code ? ` (code: ${data.code})` : '';
        alert(`${detail}${code}`);
      }
    } catch (err) {
      console.error('Create staff error:', err);
      alert('Failed to create staff: ' + err.message);
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!confirm('Are you sure? This will remove all site assignments for this staff member.')) return;
    try {
      const res = await fetch(`/api/users/${staffId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to delete staff: ${data.error || data.message || res.status}`);
        return;
      }
      setStaffUsers((prev) => prev.filter((s) => s.id !== staffId));
      setStaffAssignments((prev) => prev.filter((a) => a.staff_user_id !== staffId));
      loadData();
    } catch (err) {
      alert('Failed to delete staff: ' + err.message);
    }
  };

  const openAssignSites = (staff) => {
    const staffSiteIds = staffAssignments
      .filter((a) => a.staff_user_id === staff.id)
      .map((a) => a.site_id);
    setSelectedSites(staffSiteIds);
    setShowAssignSites(staff);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    const staffId = showAssignSites.id;
    const currentSiteIds = staffAssignments
      .filter((a) => a.staff_user_id === staffId)
      .map((a) => a.site_id);
    const toAdd = selectedSites.filter((id) => !currentSiteIds.includes(id));
    const toRemove = staffAssignments
      .filter((a) => a.staff_user_id === staffId && !selectedSites.includes(a.site_id))
      .map((a) => a.id);

    try {
      for (const siteId of toAdd) {
        const res = await fetch('/api/staff-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_user_id: staffId,
            site_id: siteId,
            assigned_by_operator_id: user.id,
          }),
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
    } catch (err) {
      alert('Failed to update assignments');
    }
  };

  const handleRemoveSiteAssignment = async (assignmentId, staffName, siteName) => {
    if (!assignmentId) return;
    if (!confirm(`Remove ${staffName}'s access to ${siteName}?\n\nThey will no longer be able to submit shift reports for this site.`)) return;
    setRemovingAssignmentId(assignmentId);
    try {
      const res = await fetch(`/api/staff-assignments/${assignmentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to remove site: ${data.error || data.message || res.status}`);
        return;
      }
      // Optimistic local update + reload to stay consistent with server
      setStaffAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      loadData();
    } catch (err) {
      alert('Failed to remove site: ' + err.message);
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  const getStaffSites = (staffId) =>
    staffAssignments
      .filter((a) => a.staff_user_id === staffId)
      .map((a) => ({
        assignmentId: a.id,
        siteId: a.site_id,
        siteName: a.site?.name || 'Unknown',
      }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
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
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
              <DialogDescription>
                Send an email invitation (recommended) or create the account directly with a temporary password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Name *</Label>
                <Input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button variant="outline" onClick={handleSendStaffInvite}>
                <Mail className="h-4 w-4 mr-1" /> Send Invite
              </Button>
              <Button onClick={handleCreateStaff}>Create Directly</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!showAssignSites} onOpenChange={(open) => !open && setShowAssignSites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Sites to {showAssignSites?.name}</DialogTitle>
            <DialogDescription>
              Select which sites this staff member can access (from your assigned sites only)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 max-h-[400px] overflow-y-auto">
            {sites.length === 0 ? (
              <div className="text-center py-8 px-4">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-medium text-amber-700">No sites available to assign</p>
                <p className="text-xs text-muted-foreground mt-2">
                  You don&apos;t have any sites assigned to you yet. Ask your owner to assign sites to your operator account first.
                </p>
              </div>
            ) : (
              sites.map((site) => (
                <div key={site.id} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-slate-50">
                  <Checkbox
                    id={site.id}
                    checked={selectedSites.includes(site.id)}
                    onCheckedChange={(checked) =>
                      setSelectedSites((prev) =>
                        checked ? [...prev, site.id] : prev.filter((id) => id !== site.id)
                      )
                    }
                  />
                  <label htmlFor={site.id} className="flex-1 cursor-pointer">
                    <p className="font-medium">{site.name}</p>
                    <p className="text-xs text-muted-foreground">{site.code} • {site.location}</p>
                  </label>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveAssignments} disabled={sites.length === 0}>
              Save Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" /> Staff Members ({staffUsers.length})
              </CardTitle>
              <CardDescription>Staff members can submit shift reports for assigned sites</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => loadData()}>
                <Loader2 className="h-3 w-3 mr-1" /> Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDebug((v) => !v)}>
                {showDebug ? 'Hide' : 'Show'} Debug
              </Button>
            </div>
          </div>
          {showDebug && debug && (
            <div className="mt-3 p-3 bg-slate-100 rounded-md text-xs font-mono overflow-x-auto">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(debug, null, 2)}</pre>
            </div>
          )}
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
              {staffUsers.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-green-50 rounded-xl border border-slate-100"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {getStaffSites(staff.id).length > 0 ? (
                          getStaffSites(staff.id).map((s) => {
                            const busy = removingAssignmentId === s.assignmentId;
                            return (
                              <Badge
                                key={s.assignmentId}
                                variant="secondary"
                                className="text-xs pl-2 pr-1 py-0.5 gap-1 flex items-center"
                              >
                                <Building2 className="h-3 w-3" />
                                <span>{s.siteName}</span>
                                <button
                                  type="button"
                                  aria-label={`Unassign ${s.siteName} from ${staff.name}`}
                                  title={`Unassign ${s.siteName}`}
                                  disabled={busy}
                                  onClick={() =>
                                    handleRemoveSiteAssignment(s.assignmentId, staff.name, s.siteName)
                                  }
                                  className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              </Badge>
                            );
                          })
                        ) : (
                          <Badge variant="outline" className="text-xs text-orange-600">
                            No sites assigned
                          </Badge>
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
