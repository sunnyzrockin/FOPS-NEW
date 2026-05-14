'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Plus, Loader2, MapPin, Pencil, Building2 } from 'lucide-react';

/**
 * SiteManagement — Owner-facing CRUD UI for fuel station sites. Lets owners
 * add new sites or edit existing ones (name, code, location). Calls
 * /api/sites (POST) or /api/sites/{id} (PUT).
 *
 * Extracted from /app/app/app/page.js as Phase D of the dashboard monolith
 * refactor. Behaviour unchanged.
 */
export default function SiteManagement({ user, sites, onRefresh }) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '' });

  const handleSubmit = async () => {
    if (!form.name || !form.code) {
      alert('Site name and code are required');
      return;
    }
    setLoading(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, owner_id: user.id }),
      });
      if (res.ok) {
        setForm({ name: '', code: '', location: '' });
        setShowAddSite(false);
        setEditingSite(null);
        onRefresh?.();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save site');
      }
    } catch (err) {
      alert('Failed to save site: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Site Management</h2>
          <p className="text-muted-foreground">Add and manage your fuel station sites</p>
        </div>
        <Dialog
          open={showAddSite}
          onOpenChange={(open) => {
            setShowAddSite(open);
            if (!open) { setEditingSite(null); setForm({ name: '', code: '', location: '' }); }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-500 to-indigo-600">
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
                <Input
                  placeholder="e.g., Sunstate Fuel - Brisbane"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Site Code *</Label>
                <Input
                  placeholder="e.g., BNE-001"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  placeholder="Full address"
                  value={form.location}
                  onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : (editingSite ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-4">
        {sites.map((site) => (
          <Card key={site.id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{site.name}</h3>
                    <p className="text-sm text-muted-foreground">{site.code}</p>
                    {site.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3" />{site.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={site.status === 'active' ? 'default' : 'secondary'}
                    className={site.status === 'active' ? 'bg-green-100 text-green-700' : ''}
                  >
                    {site.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingSite(site);
                      setForm({
                        name: site.name,
                        code: site.code,
                        location: site.location || '',
                      });
                      setShowAddSite(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
