'use client';
/* eslint-disable react-hooks/set-state-in-effect -- data hydration in useEffect */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Save, Database, Info } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * TankSetup — operator/owner CRUD over the per-site `tanks` registry.
 * One card per site listing its tanks; inline editing + delete (soft).
 * The reconciliation engine reads from this registry on every shift submit.
 */
export default function TankSetup({ sites }) {
  const [loading, setLoading] = useState(true);
  const [tanksBySite, setTanksBySite] = useState({}); // { site_id: [tank,...] }
  const [selectedSite, setSelectedSite] = useState((sites && sites[0]?.id) || '');
  const [draft, setDraft] = useState({ grade: '', capacity_litres: '', tolerance_pct: '0.5' });
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/tanks');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const grouped = {};
      for (const t of Array.isArray(data) ? data : []) {
        if (!grouped[t.site_id]) grouped[t.site_id] = [];
        grouped[t.site_id].push(t);
      }
      setTanksBySite(grouped);
    } catch (e) {
      toast.error('Failed to load tanks', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTank = async () => {
    if (!selectedSite || !draft.grade || !draft.capacity_litres) {
      toast.error('Site, grade and capacity are required');
      return;
    }
    try {
      const res = await authedFetch('/api/tanks', {
        method: 'POST',
        body: JSON.stringify({
          site_id: selectedSite,
          grade: draft.grade.trim(),
          capacity_litres: Number(draft.capacity_litres),
          tolerance_pct: Number(draft.tolerance_pct || 0.5),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success(`Added tank “${data.grade}”`);
      setDraft({ grade: '', capacity_litres: '', tolerance_pct: '0.5' });
      await load();
    } catch (e) {
      toast.error('Failed to add tank', { description: e.message });
    }
  };

  const saveTank = async (tank, patch) => {
    setSavingId(tank.id);
    try {
      const res = await authedFetch(`/api/tanks/${tank.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success('Saved');
      await load();
    } catch (e) {
      toast.error('Failed to save', { description: e.message });
    } finally {
      setSavingId(null);
    }
  };

  const removeTank = async (tank) => {
    if (!confirm(`Remove tank “${tank.grade}”? Reconciliation history is preserved.`)) return;
    try {
      const res = await authedFetch(`/api/tanks/${tank.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      toast.success('Removed');
      await load();
    } catch (e) {
      toast.error('Failed to remove', { description: e.message });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Database className="h-6 w-6 text-teal-600" /> Tank Setup
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the fuel tanks for each site (grade, capacity, variance tolerance).
          These tanks drive daily wet-stock reconciliation.
        </p>
      </div>

      {/* Add-new card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add tank
          </CardTitle>
          <CardDescription>Tolerance % is the green/amber/red threshold for daily variance.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Site</Label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grade</Label>
            <Input value={draft.grade} placeholder="ULP" onChange={(e) => setDraft({ ...draft, grade: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Capacity (L)</Label>
            <Input type="number" value={draft.capacity_litres} placeholder="30000" onChange={(e) => setDraft({ ...draft, capacity_litres: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Tolerance %</Label>
            <Input type="number" step="0.1" value={draft.tolerance_pct} onChange={(e) => setDraft({ ...draft, tolerance_pct: e.target.value })} />
          </div>
          <Button onClick={addTank} className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
        </CardContent>
      </Card>

      {/* Per-site cards */}
      {(sites || []).map((s) => {
        const list = tanksBySite[s.id] || [];
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base">{s.name}</CardTitle>
              <CardDescription>{list.length} tank{list.length === 1 ? '' : 's'} configured</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {list.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Info className="h-4 w-4" /> No tanks yet — add one above to enable daily reconciliation for this site.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Grade</th>
                        <th className="text-right px-3 py-2">Capacity (L)</th>
                        <th className="text-right px-3 py-2">Tolerance %</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((t) => (
                        <TankRow
                          key={t.id}
                          tank={t}
                          saving={savingId === t.id}
                          onSave={(patch) => saveTank(t, patch)}
                          onRemove={() => removeTank(t)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TankRow({ tank, saving, onSave, onRemove }) {
  const [grade, setGrade] = useState(tank.grade);
  const [cap, setCap] = useState(String(tank.capacity_litres));
  const [tol, setTol] = useState(String(tank.tolerance_pct));
  const dirty = grade !== tank.grade || Number(cap) !== Number(tank.capacity_litres) || Number(tol) !== Number(tank.tolerance_pct);
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2"><Input value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9" /></td>
      <td className="px-3 py-2 text-right"><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 text-right" /></td>
      <td className="px-3 py-2 text-right"><Input type="number" step="0.1" value={tol} onChange={(e) => setTol(e.target.value)} className="h-9 text-right" /></td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => onSave({ grade, capacity_litres: Number(cap), tolerance_pct: Number(tol) })}
            className="gap-1"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} className="text-red-600"><Trash2 className="h-3 w-3" /></Button>
        </div>
      </td>
    </tr>
  );
}
