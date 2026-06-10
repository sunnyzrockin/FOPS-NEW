'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Loader2, Plus, Truck } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * Record Fuel Delivery form — operator + owner.
 *
 * The user can supply EITHER total_cost_dollars OR unit_cost_cpl; the server
 * derives the missing one (lib/margin.js deriveDeliveryCost). All ex-GST.
 */
export default function RecordFuelDelivery({ sites, onSaved }) {
  const [open, setOpen] = useState(false);
  const [grades, setGrades] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    site_id: '',
    grade: '',
    delivered_at: new Date().toISOString().slice(0, 10),
    litres: '',
    unit_cost_cpl: '',
    total_cost_dollars: '',
    supplier: '',
    invoice_ref: '',
    notes: '',
  });

  const loadGrades = useCallback(async () => {
    try {
      const r = await authedFetch('/api/fuel-grades');
      const j = await r.json();
      if (r.ok) setGrades(j.grades || []);
    } catch (_e) { /* non-fatal */ }
  }, []);

  useEffect(() => { if (open) loadGrades(); }, [open, loadGrades]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.site_id || !form.grade || !form.litres) {
      toast.error('Site, grade and litres are required');
      return;
    }
    if (!form.unit_cost_cpl && !form.total_cost_dollars) {
      toast.error('Enter either total cost ($ ex-GST) or unit cost (¢/L ex-GST)');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        site_id: form.site_id,
        grade: form.grade,
        delivered_at: form.delivered_at,
        litres: Number(form.litres),
        unit_cost_cpl: form.unit_cost_cpl ? Number(form.unit_cost_cpl) : undefined,
        total_cost_dollars: form.total_cost_dollars ? Number(form.total_cost_dollars) : undefined,
        supplier: form.supplier || undefined,
        invoice_ref: form.invoice_ref || undefined,
        notes: form.notes || undefined,
      };
      const r = await authedFetch('/api/fuel-deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.detail || `HTTP ${r.status}`);
      toast.success('Delivery recorded', {
        description: `${j.delivery.litres} L of ${j.delivery.grade} → ${j.delivery.unit_cost_cpl}¢/L`,
      });
      setOpen(false);
      setForm({
        site_id: '', grade: '', delivered_at: new Date().toISOString().slice(0, 10),
        litres: '', unit_cost_cpl: '', total_cost_dollars: '',
        supplier: '', invoice_ref: '', notes: '',
      });
      if (onSaved) onSaved(j.delivery);
    } catch (e) {
      toast.error('Failed to record delivery', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg"><Truck className="h-5 w-5 text-teal-700" /></div>
            <div>
              <div className="font-medium text-sm">Record fuel delivery</div>
              <div className="text-xs text-muted-foreground">Cost of fuel bought in (ex-GST). Feeds the Fuel Margin engine.</div>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New delivery
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-5 w-5 text-teal-600" /> Record fuel delivery
        </CardTitle>
        <CardDescription>
          All amounts <strong>ex-GST</strong>. Enter either the total invoice cost or the unit cost per litre —
          we&apos;ll compute the other.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Site</Label>
            <Select value={form.site_id} onValueChange={(v) => update('site_id', v)}>
              <SelectTrigger><SelectValue placeholder="Choose site" /></SelectTrigger>
              <SelectContent>
                {(sites || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name || s.code || s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grade</Label>
            <Select value={form.grade} onValueChange={(v) => update('grade', v)}>
              <SelectTrigger><SelectValue placeholder="Choose grade" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.code} value={g.code}>{g.label || g.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Delivered on</Label>
            <Input type="date" value={form.delivered_at} onChange={(e) => update('delivered_at', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Litres delivered</Label>
            <Input type="number" inputMode="decimal" step="0.01" value={form.litres} onChange={(e) => update('litres', e.target.value)} placeholder="e.g. 30000" />
          </div>
          <div>
            <Label className="text-xs">Total cost ($ ex-GST)</Label>
            <Input type="number" inputMode="decimal" step="0.01" value={form.total_cost_dollars} onChange={(e) => update('total_cost_dollars', e.target.value)} placeholder="e.g. 52500" />
          </div>
          <div>
            <Label className="text-xs">Unit cost (¢/L ex-GST)</Label>
            <Input type="number" inputMode="decimal" step="0.0001" value={form.unit_cost_cpl} onChange={(e) => update('unit_cost_cpl', e.target.value)} placeholder="e.g. 175.00" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Supplier (optional)</Label>
            <Input value={form.supplier} onChange={(e) => update('supplier', e.target.value)} placeholder="e.g. BP Wholesale" />
          </div>
          <div>
            <Label className="text-xs">Invoice reference (optional)</Label>
            <Input value={form.invoice_ref} onChange={(e) => update('invoice_ref', e.target.value)} placeholder="e.g. INV-3892" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Notes (optional)</Label>
          <Input value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Any context for this delivery…" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Save delivery
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
