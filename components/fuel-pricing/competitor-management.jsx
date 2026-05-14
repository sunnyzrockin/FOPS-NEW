'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';

/**
 * CompetitorManagement — Operator-facing CRUD UI for nearby competitor
 * stations per site. Backed by /api/site-competitors. Extracted from
 * /app/app/app/page.js.
 */
export default function CompetitorManagement({ user, sites }) {
  // eslint-disable-next-line no-unused-vars
  const _user = user;
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [competitors, setCompetitors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ competitor_name: '', distance_km: '' });

  const loadCompetitors = useCallback(async () => {
    if (!selectedSite) return;
    const res = await fetch(`/api/site-competitors?siteId=${selectedSite}`);
    const data = await res.json();
    setCompetitors(Array.isArray(data) ? data : []);
  }, [selectedSite]);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  const handleAdd = async () => {
    if (!form.competitor_name) { alert('Competitor name required'); return; }
    await fetch('/api/site-competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, site_id: selectedSite }),
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
        <div>
          <h2 className="text-xl font-bold">Manage Competitors</h2>
          <p className="text-muted-foreground">Add and manage nearby competitor stations</p>
        </div>
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogTrigger asChild>
          <Button><Plus className="h-4 w-4 mr-2" /> Add Competitor</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Competitor Name</Label>
              <Input
                placeholder="Shell Petrol Station"
                value={form.competitor_name}
                onChange={(e) => setForm((p) => ({ ...p, competitor_name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Distance (km)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="1.5"
                value={form.distance_km}
                onChange={(e) => setForm((p) => ({ ...p, distance_km: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {competitors.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No competitors added yet</p>
          ) : (
            <div className="space-y-2">
              {competitors.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">{comp.competitor_name}</p>
                    {comp.distance_km && (
                      <p className="text-xs text-muted-foreground">{comp.distance_km} km away</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(comp.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
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
