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
  Loader2, UserPlus, User, Users, Building, Building2, Trash2,
} from 'lucide-react';

import { toast } from 'sonner';
import { authedFetch } from '@/lib/authed-fetch';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
/**
 * OperatorManagement — Owner-facing UI to create operators and assign sites
 * to them. Extracted from /app/app/app/page.js as Phase C of the dashboard
 * monolith refactor. API contracts unchanged.
 */
export default function OperatorManagement({ user, sites, onRefresh }) {
  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();
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
        authedFetch('/api/users?role=operator'),
        authedFetch(`/api/operator-assignments?ownerId=${user.id}`),
      ]);
      const [operatorsData, assignmentsData] = await Promise.all([
        operatorsRes.json(),
        assignmentsRes.json(),
      ]);
      setOperators(Array.isArray(operatorsData) ? operatorsData : []);
      setOperatorAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
    } catch (err) {
      console.error('Failed to load operators:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateOperator = async () => {
    if (!form.name || !form.email) { toast.error('Name and email are required'); return; }
    try {
      const res = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'operator', creatorRole: 'owner' }),
      });

      const text = await res.text();
      if (!text) {
        toast.error(`Failed to create operator: Server returned empty response (HTTP ${res.status}). Please retry; if this persists, contact support.`);
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Response was not JSON:', text);
        toast.error(`Failed to create operator: Invalid server response (HTTP ${res.status}).\n\nRaw response:\n${text.slice(0, 300)}`);
        return;
      }

      if (res.ok) {
        setForm({ name: '', email: '', password: 'demo123' });
        setShowAddOperator(false);
        loadData();
      } else {
        const detail = data.error || data.message || 'Failed to create operator';
        const code = data.code ? ` (code: ${data.code})` : '';
        toast.info(`${detail}${code}`);
      }
    } catch (err) {
      console.error('Create operator error:', err);
      toast.error('Failed to create operator: ' + err.message);
    }
  };

  const handleDeleteOperator = async (operatorId) => {
    if (!(await confirmDialog('Delete operator?', 'This will remove all site assignments for this operator.', { destructive: true, confirmLabel: 'Delete' }))) return;
    try {
      const res = await authedFetch(`/api/users/${operatorId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`Failed to delete operator: ${data.error || data.message || res.status}`);
        return;
      }
      setOperators((prev) => prev.filter((o) => o.id !== operatorId));
      setOperatorAssignments((prev) => prev.filter((a) => a.operator_user_id !== operatorId));
      loadData();
    } catch (err) {
      toast.error('Failed to delete operator: ' + err.message);
    }
  };

  const openAssignSites = (operator) => {
    const operatorSiteIds = operatorAssignments
      .filter((a) => a.operator_user_id === operator.id)
      .map((a) => a.site_id);
    setSelectedSites(operatorSiteIds);
    setShowAssignSites(operator);
  };

  const handleSaveAssignments = async () => {
    if (!showAssignSites) return;
    const operatorId = showAssignSites.id;
    const currentSiteIds = operatorAssignments
      .filter((a) => a.operator_user_id === operatorId)
      .map((a) => a.site_id);
    const toAdd = selectedSites.filter((id) => !currentSiteIds.includes(id));
    const toRemove = operatorAssignments
      .filter((a) => a.operator_user_id === operatorId && !selectedSites.includes(a.site_id))
      .map((a) => a.id);

    try {
      for (const siteId of toAdd) {
        await authedFetch('/api/operator-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operator_user_id: operatorId,
            site_id: siteId,
            assigned_by_owner_id: user.id,
          }),
        });
      }
      for (const assignmentId of toRemove) {
        await authedFetch(`/api/operator-assignments/${assignmentId}`, { method: 'DELETE' });
      }
      setShowAssignSites(null);
      loadData();
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to update assignments');
    }
  };

  const getOperatorSites = (operatorId) =>
    operatorAssignments
      .filter((a) => a.operator_user_id === operatorId)
      .map((a) => a.site?.name || 'Unknown');

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
            {sites.map((site) => (
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
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border border-border/50 shadow-sm">
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
              {operators.map((operator) => (
                <div
                  key={operator.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-100"
                >
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
    
    <ConfirmDialog />
  </div>
  );
}
