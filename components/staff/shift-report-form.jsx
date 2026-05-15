'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, CheckCircle, Calculator, RefreshCw, Loader2, FileText, Droplets, Truck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * ShiftReportForm — Staff-facing form to submit a shift report. Loads the
 * site's field configurations and any staff-visible banking formulas, then
 * computes formula results live as the user types. Submits via the
 * Bearer-locked POST /api/reports endpoint (user id pulled from JWT).
 *
 * Extracted from /app/app/app/page.js as Phase D of the dashboard monolith
 * refactor. Behaviour unchanged.
 */
export default function ShiftReportForm({ user, sites, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [formulaResults, setFormulaResults] = useState({});
  const [form, setForm] = useState({
    site_id: sites[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Morning',
  });
  const [errors, setErrors] = useState({});

  // Load field configs for the selected site
  useEffect(() => {
    const loadFieldConfigs = async () => {
      if (!form.site_id) return;
      try {
        const res = await fetch(`/api/field-configs?siteId=${form.site_id}`);
        const data = await res.json();
        setFieldConfigs(
          (Array.isArray(data) ? data : [])
            .filter((f) => f.is_enabled)
            // Visibility filter (staff context): show field if visibility
            // is 'all' or 'staff_only'. Hide 'owner_only' fields like
            // "Cash" that staff shouldn't enter. Default to 'all' if the
            // column hasn't been migrated yet (back-compat).
            .filter((f) => {
              const v = f.visibility || 'all';
              return v === 'all' || v === 'staff_only';
            })
            .sort((a, b) => a.display_order - b.display_order)
        );
      } catch (err) {
        console.error('Failed to load field configs:', err);
      }
    };
    loadFieldConfigs();
  }, [form.site_id]);

  // Load formulas visible to staff
  useEffect(() => {
    const loadFormulas = async () => {
      if (!form.site_id) return;
      try {
        const res = await fetch(`/api/banking-formulas?siteId=${form.site_id}`);
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []).filter((f) => f.visible_to_staff);

        // Dedupe by formula name. Duplicates can accumulate in the
        // banking_formulas table (no UNIQUE constraint on (site_id, name)
        // historically). Keep the newest row per name so any recent
        // edits the operator made win. Falls back to the only row if
        // updated_at is missing.
        const newestByName = new Map();
        for (const f of list) {
          const key = (f.name || '').trim().toLowerCase() || f.id;
          const existing = newestByName.get(key);
          if (!existing) {
            newestByName.set(key, f);
          } else {
            const tsNew = new Date(f.updated_at || f.created_at || 0).getTime();
            const tsOld = new Date(existing.updated_at || existing.created_at || 0).getTime();
            if (tsNew >= tsOld) newestByName.set(key, f);
          }
        }
        setFormulas(Array.from(newestByName.values()));
      } catch (err) {
        console.error('Failed to load formulas:', err);
      }
    };
    loadFormulas();
  }, [form.site_id]);

  // Live formula calculation as the user types
  useEffect(() => {
    const calculateFormulas = () => {
      const results = {};
      formulas.forEach((formula) => {
        try {
          const operations = JSON.parse(formula.formula_json).operations || [];
          let result = 0;
          let currentOp = '+';

          for (const op of operations) {
            if (op.type === 'field') {
              const value = parseFloat(form[op.value] || 0);
              if (currentOp === '+') result += value;
              else if (currentOp === '-') result -= value;
              else if (currentOp === '*') result *= value;
              else if (currentOp === '/') result = value !== 0 ? result / value : 0;
            } else if (op.type === 'operator') {
              currentOp = op.value;
            } else if (op.type === 'number') {
              const value = parseFloat(op.value || 0);
              if (currentOp === '+') result += value;
              else if (currentOp === '-') result -= value;
              else if (currentOp === '*') result *= value;
              else if (currentOp === '/') result = value !== 0 ? result / value : 0;
            }
          }

          results[formula.id] = Math.round(result * 100) / 100;
        } catch (err) {
          console.error(`Formula calculation error for ${formula.name}:`, err);
          results[formula.id] = 0;
        }
      });
      setFormulaResults(results);
    };

    if (formulas.length > 0) calculateFormulas();
  }, [form, formulas]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.site_id) newErrors.site_id = 'Site is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (!form.shift_type) newErrors.shift_type = 'Shift type is required';
    if (!form.fuel_sales) newErrors.fuel_sales = 'Fuel sales is required';
    if (!form.shop_sales) newErrors.shop_sales = 'Shop sales is required';
    if (!form.dips) newErrors.dips = 'Dips reading is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      // authedFetch injects Authorization: Bearer <jwt>. The backend pulls
      // submitter id from the JWT — do NOT send submitted_by_user_id in body.
      const res = await authedFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess(true);
        const resetForm = { site_id: form.site_id, date: form.date, shift_type: 'Morning' };
        fieldConfigs.forEach((f) => { resetForm[f.key] = ''; });
        // Phase 3: also clear dip-litre fields so they don't get re-submitted
        // on a subsequent shift.
        resetForm.dip_ulp_litres = '';
        resetForm.dip_diesel_litres = '';
        resetForm.dip_premium_litres = '';
        resetForm.delivery_ulp_litres = '';
        resetForm.delivery_diesel_litres = '';
        resetForm.delivery_premium_litres = '';
        setForm(resetForm);
        onSuccess?.();
        setTimeout(() => setSuccess(false), 3000);
      } else if (res.status === 401) {
        alert('Your session has expired. Please log in again.');
        if (typeof window !== 'undefined') window.location.href = '/login';
      } else if (res.status === 409 || data.code === 'duplicate_report') {
        alert(
          `A ${form.shift_type} report for this site on ${form.date} has already been submitted.\n\n` +
          `Tip: try a different shift type or date, or ask your operator to delete the existing one.`
        );
      } else {
        alert(
          (data.error || 'Failed to submit report') +
          (data.detail && !String(data.error || '').includes(data.detail) ? `\n\nDetail: ${data.detail}` : '')
        );
      }
    } catch (err) {
      alert('Failed to submit report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Submit Shift Report
        </CardTitle>
        <CardDescription>Complete the form below to submit your shift report</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Report submitted successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Site *</Label>
              <Select value={form.site_id} onValueChange={(v) => handleChange('site_id', v)}>
                <SelectTrigger className={errors.site_id ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.site_id && <p className="text-xs text-red-500">{errors.site_id}</p>}
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => handleChange('date', e.target.value)}
                className={errors.date ? 'border-red-500' : ''}
              />
              {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
            </div>
            <div className="space-y-2">
              <Label>Shift Type *</Label>
              <Select value={form.shift_type} onValueChange={(v) => handleChange('shift_type', v)}>
                <SelectTrigger className={errors.shift_type ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
                  <SelectItem value="Night">Night</SelectItem>
                </SelectContent>
              </Select>
              {errors.shift_type && <p className="text-xs text-red-500">{errors.shift_type}</p>}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-medium mb-4">Sales & Payments</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {fieldConfigs.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-sm">{field.label} {field.is_core && '*'}</Label>
                  <Input
                    type={field.field_type === 'number' ? 'number' : 'text'}
                    step={field.field_type === 'number' ? '0.01' : undefined}
                    placeholder={field.field_type === 'number' ? '0.00' : ''}
                    value={form[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className={errors[field.key] ? 'border-red-500' : ''}
                  />
                  {errors[field.key] && <p className="text-xs text-red-500">{errors[field.key]}</p>}
                </div>
              ))}
            </div>
          </div>

          {formulas.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-blue-600" />
                  Live Calculations
                  <Badge variant="outline" className="text-xs">Auto-updating</Badge>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {formulas.map((formula) => (
                    <div
                      key={formula.id}
                      className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200"
                    >
                      <p className="text-xs text-muted-foreground mb-1">{formula.name}</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {formatCurrency(formulaResults[formula.id] || 0)}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">{formula.result_label || 'Result'}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Values update automatically as you enter data
                </p>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Droplets className="h-4 w-4 text-cyan-600" />
              Fuel Tank Dips (Litres)
              <Badge variant="outline" className="text-xs">Optional</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Record current tank levels in litres. These automatically appear on the Fuel Inventory dashboard so your operator and owner can plan deliveries. Leave blank if you didn't take a dip this shift.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">ULP level (L)</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="e.g. 18500"
                  value={form.dip_ulp_litres || ''}
                  onChange={(e) => handleChange('dip_ulp_litres', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Diesel level (L)</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="e.g. 12300"
                  value={form.dip_diesel_litres || ''}
                  onChange={(e) => handleChange('dip_diesel_litres', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Premium level (L)</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="(if sold)"
                  value={form.dip_premium_litres || ''}
                  onChange={(e) => handleChange('dip_premium_litres', e.target.value)}
                />
              </div>
            </div>
            <h4 className="text-sm font-medium mt-5 mb-2 flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              Deliveries received this shift (L) — leave 0 if none
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">ULP delivery</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="0"
                  value={form.delivery_ulp_litres || ''}
                  onChange={(e) => handleChange('delivery_ulp_litres', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Diesel delivery</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="0"
                  value={form.delivery_diesel_litres || ''}
                  onChange={(e) => handleChange('delivery_diesel_litres', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Premium delivery</Label>
                <Input
                  type="number" step="0.01" inputMode="decimal" placeholder="0"
                  value={form.delivery_premium_litres || ''}
                  onChange={(e) => handleChange('delivery_premium_litres', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Notes / Comments</Label>
            <Textarea
              placeholder="Add any notes about this shift..."
              value={form.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          <Button
            type="submit"
            className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600"
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
              : <><FileText className="mr-2 h-4 w-4" /> Submit Report</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
