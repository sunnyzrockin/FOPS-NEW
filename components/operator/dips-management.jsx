'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Droplets, Loader2, Plus, Truck, Trash2, Pencil, X, Check, AlertCircle,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { formatDateTime } from '@/lib/format';

import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
/**
 * DipsManagement — Operator-facing screen for logging fuel-tank dip
 * readings (in litres) and deliveries received. Shows the latest reading
 * status per site and a recent history table with inline edit for the
 * last 24h.
 *
 * Backend:
 *   GET    /api/dips?site_id=&limit=
 *   GET    /api/dips/current
 *   POST   /api/dips
 *   PUT    /api/dips/:id
 *   DELETE /api/dips/:id
 *
 * Consumption math is computed by the API. Frontend just displays it.
 */
export default function DipsManagement({ user, sites }) {
  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();
  const [selectedSite, setSelectedSite] = useState(() => sites[0]?.id || '');
  const [current, setCurrent] = useState([]); // [{site_id, current, previous, consumption_since_previous}]
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const emptyForm = {
    reading_label: '',
    reading_time: '',
    ulp_litres: '',
    diesel_litres: '',
    premium_litres: '',
    deliveries_ulp_litres: '',
    deliveries_diesel_litres: '',
    deliveries_premium_litres: '',
    notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Inline edit state (for the operator's own readings within 24h)
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const loadData = useCallback(async () => {
    if (!selectedSite) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [currentRes, historyRes] = await Promise.all([
        authedFetch('/api/dips/current'),
        authedFetch(`/api/dips?site_id=${selectedSite}&limit=50`),
      ]);
      const [currentData, historyData] = await Promise.all([
        currentRes.json(), historyRes.json(),
      ]);
      setCurrent(Array.isArray(currentData) ? currentData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (err) {
      console.error('Failed to load dips:', err);
      setError('Could not load fuel inventory data.');
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-dismiss success toast
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3500);
    return () => clearTimeout(t);
  }, [successMsg]);

  const siteName = sites.find((s) => s.id === selectedSite)?.name || 'Site';
  const currentForSite = current.find((c) => c.site_id === selectedSite) || null;

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const onChangeEdit = (k, v) => setEditForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedSite) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...form, site_id: selectedSite };
      // strip empty optional fields so backend treats them as null/0 properly
      const res = await authedFetch('/api/dips', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      setForm(emptyForm);
      setSuccessMsg('Dip reading saved.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save dip reading.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = async (row) => {
    setEditingId(row.id);
    setEditForm({
      reading_label: row.reading_label || '',
      reading_time: row.reading_time
        ? new Date(row.reading_time).toISOString().slice(0, 16)
        : '',
      ulp_litres: row.ulp_litres ?? '',
      diesel_litres: row.diesel_litres ?? '',
      premium_litres: row.premium_litres ?? '',
      deliveries_ulp_litres: row.deliveries_ulp_litres ?? '',
      deliveries_diesel_litres: row.deliveries_diesel_litres ?? '',
      deliveries_premium_litres: row.deliveries_premium_litres ?? '',
      notes: row.notes || '',
    });
  };

  const cancelEdit = async () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const saveEdit = async (id) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/dips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      cancelEdit();
      setSuccessMsg('Reading updated.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update reading.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRow = async (id) => {
    if (!(await confirmDialog('Delete dip reading?', 'This cannot be undone.', { destructive: true, confirmLabel: 'Delete' }))) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/dips/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      setSuccessMsg('Reading deleted.');
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete reading.');
    } finally {
      setSubmitting(false);
    }
  };

  const isEditable = (row) => {
    if (row.operator_user_id !== user.id) return false;
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    return ageMs <= 24 * 60 * 60 * 1000;
  };

  const fmtLitres = (v) =>
    v == null || v === '' ? '—' : `${Number(v).toLocaleString('en-AU', { maximumFractionDigits: 0 })} L`;

  if (sites.length === 0) {
    return (
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-6 text-center text-muted-foreground">
          No sites assigned yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Site picker + status banner */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-medium">Site</Label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentForSite?.current ? (
              <Badge variant="secondary" className="ml-auto">
                Last reading: {formatDateTime(currentForSite.current.reading_time)}
                {currentForSite.current.reading_label ? ` · ${currentForSite.current.reading_label}` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto">No readings yet</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <Check className="h-4 w-4" /> {successMsg}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Current levels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['ulp', 'diesel', 'premium'].map((fuel) => {
          const colorMap = {
            ulp: 'from-blue-500 to-indigo-500',
            diesel: 'from-amber-500 to-orange-600',
            premium: 'from-purple-500 to-fuchsia-600',
          };
          const labelMap = { ulp: 'ULP', diesel: 'Diesel', premium: 'Premium' };
          const lvl = currentForSite?.current?.[`${fuel}_litres`];
          const consumed = currentForSite?.consumption_since_previous?.[fuel];
          return (
            <Card key={fuel} className="overflow-hidden border border-border/50 shadow-sm">
              <div className={`bg-gradient-to-br ${colorMap[fuel]} p-5 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">{labelMap[fuel]} tank level</p>
                    <p className="text-3xl font-bold mt-1">{fmtLitres(lvl)}</p>
                  </div>
                  <Droplets className="h-7 w-7 opacity-90" />
                </div>
              </div>
              <CardContent className="p-3 text-sm text-muted-foreground">
                {consumed == null
                  ? 'No previous reading to compare.'
                  : consumed >= 0
                  ? `Consumed ${fmtLitres(consumed)} since previous reading.`
                  : `Net inflow ${fmtLitres(Math.abs(consumed))} since previous (delivery > consumption).`}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Log a new reading */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5" /> Log fuel levels — {siteName}
          </CardTitle>
          <CardDescription>
            Enter current tank levels in litres. If you received a delivery since the last reading, enter the delivered amounts too.
            Consumption is calculated automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reading_label">Reading label (e.g. Morning, PM, After delivery)</Label>
                <Input
                  id="reading_label"
                  value={form.reading_label}
                  onChange={(e) => onChange('reading_label', e.target.value)}
                  placeholder="Morning"
                />
              </div>
              <div>
                <Label htmlFor="reading_time">Reading time (leave blank for now)</Label>
                <Input
                  id="reading_time"
                  type="datetime-local"
                  value={form.reading_time}
                  onChange={(e) => onChange('reading_time', e.target.value)}
                />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Droplets className="h-4 w-4" /> Tank levels (litres)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>ULP</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.ulp_litres}
                    onChange={(e) => onChange('ulp_litres', e.target.value)} placeholder="e.g. 18500" />
                </div>
                <div>
                  <Label>Diesel</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.diesel_litres}
                    onChange={(e) => onChange('diesel_litres', e.target.value)} placeholder="e.g. 12300" />
                </div>
                <div>
                  <Label>Premium</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.premium_litres}
                    onChange={(e) => onChange('premium_litres', e.target.value)} placeholder="(optional)" />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Truck className="h-4 w-4" /> Deliveries received since last reading (litres)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>ULP delivery</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.deliveries_ulp_litres}
                    onChange={(e) => onChange('deliveries_ulp_litres', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Diesel delivery</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.deliveries_diesel_litres}
                    onChange={(e) => onChange('deliveries_diesel_litres', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Premium delivery</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.deliveries_premium_litres}
                    onChange={(e) => onChange('deliveries_premium_litres', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => onChange('notes', e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(emptyForm)} disabled={submitting}>
                Reset
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Save reading
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Recent readings</CardTitle>
          <CardDescription>
            Most recent first. You can edit or delete your own readings within 24 hours of submission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No readings yet for this site.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">Label</th>
                    <th className="py-2 pr-2 text-right">ULP (L)</th>
                    <th className="py-2 pr-2 text-right">Diesel (L)</th>
                    <th className="py-2 pr-2 text-right">Premium (L)</th>
                    <th className="py-2 pr-2 text-right">Deliveries</th>
                    <th className="py-2 pr-2">Notes</th>
                    <th className="py-2 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const editable = isEditable(row);
                    const isEditing = editingId === row.id;
                    if (isEditing) {
                      return (
                        <tr key={row.id} className="border-b bg-blue-50/30 align-top">
                          <td className="py-2 pr-2">
                            <Input type="datetime-local" value={editForm.reading_time}
                              onChange={(e) => onChangeEdit('reading_time', e.target.value)} className="h-8 w-44" />
                          </td>
                          <td className="py-2 pr-2">
                            <Input value={editForm.reading_label}
                              onChange={(e) => onChangeEdit('reading_label', e.target.value)} className="h-8 w-28" />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Input type="number" step="0.01" value={editForm.ulp_litres}
                              onChange={(e) => onChangeEdit('ulp_litres', e.target.value)} className="h-8 w-24 text-right" />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Input type="number" step="0.01" value={editForm.diesel_litres}
                              onChange={(e) => onChangeEdit('diesel_litres', e.target.value)} className="h-8 w-24 text-right" />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <Input type="number" step="0.01" value={editForm.premium_litres}
                              onChange={(e) => onChangeEdit('premium_litres', e.target.value)} className="h-8 w-24 text-right" />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <div className="flex flex-col gap-1 items-end">
                              <Input type="number" step="0.01" value={editForm.deliveries_ulp_litres} placeholder="ULP del"
                                onChange={(e) => onChangeEdit('deliveries_ulp_litres', e.target.value)} className="h-7 w-24 text-right" />
                              <Input type="number" step="0.01" value={editForm.deliveries_diesel_litres} placeholder="Diesel del"
                                onChange={(e) => onChangeEdit('deliveries_diesel_litres', e.target.value)} className="h-7 w-24 text-right" />
                              <Input type="number" step="0.01" value={editForm.deliveries_premium_litres} placeholder="Prem del"
                                onChange={(e) => onChangeEdit('deliveries_premium_litres', e.target.value)} className="h-7 w-24 text-right" />
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <Input value={editForm.notes}
                              onChange={(e) => onChangeEdit('notes', e.target.value)} className="h-8 w-40" />
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={submitting}>
                                <X className="h-3 w-3" />
                              </Button>
                              <Button size="sm" onClick={() => saveEdit(row.id)} disabled={submitting}>
                                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const deliveriesAny = [row.deliveries_ulp_litres, row.deliveries_diesel_litres, row.deliveries_premium_litres]
                      .some((v) => Number(v) > 0);
                    return (
                      <tr key={row.id} className="border-b hover:bg-slate-50">
                        <td className="py-2 pr-2 whitespace-nowrap">{formatDateTime(row.reading_time)}</td>
                        <td className="py-2 pr-2">{row.reading_label || '—'}</td>
                        <td className="py-2 pr-2 text-right">{fmtLitres(row.ulp_litres)}</td>
                        <td className="py-2 pr-2 text-right">{fmtLitres(row.diesel_litres)}</td>
                        <td className="py-2 pr-2 text-right">{fmtLitres(row.premium_litres)}</td>
                        <td className="py-2 pr-2 text-right text-xs text-muted-foreground">
                          {deliveriesAny ? (
                            <>
                              {Number(row.deliveries_ulp_litres) > 0 && <div>ULP +{fmtLitres(row.deliveries_ulp_litres)}</div>}
                              {Number(row.deliveries_diesel_litres) > 0 && <div>Diesel +{fmtLitres(row.deliveries_diesel_litres)}</div>}
                              {Number(row.deliveries_premium_litres) > 0 && <div>Prem +{fmtLitres(row.deliveries_premium_litres)}</div>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[180px] truncate">{row.notes || '—'}</td>
                        <td className="py-2 pr-2 text-right">
                          {editable ? (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteRow(row.id)}>
                                <Trash2 className="h-3 w-3 text-red-600" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    
    <ConfirmDialog />
  </div>
  );
}
