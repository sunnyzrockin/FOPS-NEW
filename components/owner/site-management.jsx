'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose, DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Loader2, MapPin, Pencil, Building2, Trash2, AlertTriangle, Download } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * SiteManagement — Owner-facing CRUD UI for fuel station sites. Lets owners
 * add, edit, and delete sites (with a guarded confirm + JSON export step
 * before destructive delete).
 *
 * All API calls go through authedFetch so the JWT travels with the request.
 */
export default function SiteManagement({ user, sites, onRefresh }) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '' });

  const [siteToDelete, setSiteToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.code) {
      alert('Site name and code are required');
      return;
    }
    setLoading(true);
    try {
      const url = editingSite ? `/api/sites/${editingSite.id}` : '/api/sites';
      const method = editingSite ? 'PUT' : 'POST';
      const res = await authedFetch(url, {
        method,
        body: JSON.stringify({ ...form, owner_id: user.id }),
      });
      if (res.ok) {
        setForm({ name: '', code: '', location: '' });
        setShowAddSite(false);
        setEditingSite(null);
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || data.message || `Failed to save site (HTTP ${res.status})`);
      }
    } catch (err) {
      alert('Failed to save site: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportSiteData = async (site) => {
    setExportBusy(true);
    try {
      const reportsParams = `?siteIds=${site.id}&startDate=2000-01-01&endDate=2999-12-31`;
      const [reportsRes, dipsRes, pricesRes, formulasRes] = await Promise.all([
        authedFetch(`/api/reports${reportsParams}`),
        authedFetch(`/api/dips?site_id=${site.id}&limit=1000`),
        authedFetch(`/api/fuel-prices?siteId=${site.id}`),
        authedFetch(`/api/banking-formulas?siteId=${site.id}`),
      ]);
      const [reports, dips, prices, formulas] = await Promise.all([
        reportsRes.ok ? reportsRes.json() : [],
        dipsRes.ok ? dipsRes.json() : [],
        pricesRes.ok ? pricesRes.json() : [],
        formulasRes.ok ? formulasRes.json() : [],
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        exported_by: user.email || user.id,
        site,
        counts: {
          shift_reports: Array.isArray(reports) ? reports.length : 0,
          dip_readings: Array.isArray(dips) ? dips.length : 0,
          fuel_price_changes: Array.isArray(prices) ? prices.length : 0,
          banking_formulas: Array.isArray(formulas) ? formulas.length : 0,
        },
        shift_reports: Array.isArray(reports) ? reports : [],
        dip_readings: Array.isArray(dips) ? dips : [],
        fuel_price_changes: Array.isArray(prices) ? prices : [],
        banking_formulas: Array.isArray(formulas) ? formulas : [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-${site.code || site.id}-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExportBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!siteToDelete) return;
    setDeleteBusy(true);
    try {
      const res = await authedFetch(`/api/sites/${siteToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSiteToDelete(null);
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || data.message || `Failed to delete site (HTTP ${res.status})`);
      }
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setDeleteBusy(false);
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
                    title="Edit site"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSiteToDelete(site)}
                    title="Delete site"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <Button
              variant="outline"
              className="w-full"
              onClick={() => siteToDelete && exportSiteData(siteToDelete)}
              disabled={exportBusy || deleteBusy}
            >
              {exportBusy
                ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>)
                : (<><Download className="h-4 w-4 mr-2" /> Export all site data (JSON)</>)}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteBusy}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy
                ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</>)
                : (<><Trash2 className="h-4 w-4 mr-2" /> Delete permanently</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
