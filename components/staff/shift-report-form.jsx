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

import { toast } from 'sonner';
/**
 * Safely evaluate a spreadsheet-style numeric expression like "2450+1360",
 * "+2450+1360", "(800+200)*1.1", "1,234.50 - 500". Returns the numeric
 * result, or null if the input isn't a valid expression (in which case
 * callers should keep the user's raw input untouched).
 *
 * Why not just use eval()?  We never want arbitrary code execution. So:
 *   1. Strip a leading "+" (Excel shorthand).
 *   2. Remove thousands-separator commas.
 *   3. Whitelist characters via regex: digits, . + - * / ( ) and whitespace.
 *   4. Use new Function() inside a try/catch — still sandboxed by the
 *      whitelist regex; impossible to get past digits/operators.
 *   5. Require the result to be a finite number.
 *
 * Returns:
 *   - number if the expression evaluates cleanly to a finite number
 *   - null   if the input is empty, plain text, or evaluates to NaN/Infinity
 */
function evalFormula(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const stripped = raw.replace(/^\+/, '');
  // Remove thousands-separator commas (only between digits).
  const noCommas = stripped.replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
  // Whitelist check — refuses anything outside the math vocabulary.
  if (!/^[0-9+\-*/().\s]+$/.test(noCommas)) return null;
  // Reject sequences that would be obviously invalid (lone operator etc.)
  if (/[+\-*/]\s*$/.test(noCommas) || /^\s*[*/]/.test(noCommas)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${noCommas});`);
    const v = fn();
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    // Round to 2 decimal places to avoid float artefacts (1.1 + 2.2 etc.)
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

/** True if the user is mid-formula (contains an operator beyond the leading "+"). */
function looksLikeFormula(s) {
  if (!s) return false;
  const stripped = String(s).trim().replace(/^\+/, '');
  return /[+\-*/(]/.test(stripped);
}

/**
 * ShiftReportForm — Staff-facing form to submit a shift report. Loads the
 * site's field configurations and any staff-visible banking formulas, then
 * computes formula results live as the user types. Submits via the
 * Bearer-locked POST /api/reports endpoint (user id pulled from JWT).
 *
 * Numeric fields support Excel-style arithmetic. Users can type things
 * like "+2450+1360" or "(800+200)*1.1" and the value is evaluated on blur
 * (or on submit as a safety net). A subtle "= 3810" preview shows while
 * the user is still typing.
 *
 * Extracted from /app/app/app/page.js as Phase D of the dashboard monolith
 * refactor. Behaviour unchanged outside the explicit upgrades above.
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
  // Custom fuel-grade dip fields (category='dip') configured per-site by
  // the operator. They render in their own section below the built-in
  // ULP / Diesel / Premium grades, each with a level + delivery input.
  const [dipFieldConfigs, setDipFieldConfigs] = useState([]);

  // Load field configs for the selected site — split into sales (the
  // existing "Sales & Payments" section) and dip (the new custom-grade
  // section below the built-in dips).
  useEffect(() => {
    const loadFieldConfigs = async () => {
      if (!form.site_id) return;
      try {
        const res = await fetch(`/api/field-configs?siteId=${form.site_id}`);
        const data = await res.json();
        const all = Array.isArray(data) ? data : [];
        const enabled = all
          .filter((f) => f.is_enabled)
          // Visibility filter (staff context): show field if visibility
          // is 'all' or 'staff_only'. Hide 'owner_only' fields like
          // "Cash" that staff shouldn't enter. Default to 'all' if the
          // column hasn't been migrated yet (back-compat).
          .filter((f) => {
            const v = f.visibility || 'all';
            return v === 'all' || v === 'staff_only';
          })
          .sort((a, b) => a.display_order - b.display_order);
        // Default category to 'sales' so legacy rows (no category column)
        // keep appearing in the sales section as they used to.
        setFieldConfigs(enabled.filter((f) => (f.category || 'sales') === 'sales'));
        setDipFieldConfigs(enabled.filter((f) => f.category === 'dip'));
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
      // Pre-resolve every field value so the operator's banking formula
      // sees the *intended* number even if the staff is mid-typing an
      // arithmetic expression like "+2450+1360".
      const resolved = {};
      for (const k of Object.keys(form)) {
        const v = form[k];
        if (v === '' || v == null) { resolved[k] = 0; continue; }
        const plain = /^-?\d+(\.\d+)?$/.test(String(v).trim());
        if (plain) { resolved[k] = parseFloat(v); continue; }
        const evald = evalFormula(v);
        resolved[k] = evald != null ? evald : parseFloat(v) || 0;
      }
      formulas.forEach((formula) => {
        try {
          const operations = JSON.parse(formula.formula_json).operations || [];
          let result = 0;
          let currentOp = '+';

          for (const op of operations) {
            if (op.type === 'field') {
              const value = Number.isFinite(resolved[op.value]) ? resolved[op.value] : 0;
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

  /**
   * Triggered on blur for numeric inputs. If the raw text is a valid
   * arithmetic expression (e.g. "+2450+1360"), replace it with the
   * computed value (3810). If it's already a plain number, leave it
   * untouched. If it doesn't parse, also leave it — the user will see
   * the validation error when they hit Submit.
   */
  const handleNumericBlur = (field) => {
    const raw = form[field];
    if (raw == null || raw === '') return;
    // If it's already a clean plain number, normalise it (strip commas).
    const looksPlain = /^-?\d+(\.\d+)?$/.test(String(raw).trim());
    if (looksPlain) return;
    const evaluated = evalFormula(raw);
    if (evaluated != null) {
      setForm((prev) => ({ ...prev, [field]: String(evaluated) }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.site_id) newErrors.site_id = 'Site is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (!form.shift_type) newErrors.shift_type = 'Shift type is required';
    // Validate against the actual configured fields rather than hard-coded
    // names. Any field marked `is_core` on the site's field-config is
    // mandatory; everything else is optional. Numeric core fields must
    // either be empty (=> error) or contain something that evaluates to
    // a number (so "+2450+1360" is OK because it evaluates to 3810).
    for (const f of fieldConfigs) {
      if (!f.is_core) continue;
      const v = form[f.key];
      if (v == null || String(v).trim() === '') {
        newErrors[f.key] = `${f.label} is required`;
        continue;
      }
      if (f.field_type === 'number') {
        const looksPlain = /^-?\d+(\.\d+)?$/.test(String(v).trim());
        if (!looksPlain && evalFormula(v) == null) {
          newErrors[f.key] = `${f.label} is not a valid number or formula`;
        }
      }
    }
    setErrors(newErrors);
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      // Tell the user exactly what's missing — silent failure was the
      // original "Submit Report button does nothing" complaint.
      alert(
        'Please fix the following before submitting:\n• ' +
        Object.values(newErrors).join('\n• ')
      );
      return;
    }

    setLoading(true);
    try {
      // Safety net: coerce every configured field via evalFormula so
      // anything like "+2450+1360" that the user typed but never blurred
      // away from still gets evaluated before being POSTed. We do this
      // regardless of field_type — evalFormula is whitelist-safe and
      // returns null for genuine text (so legacy text fields containing
      // notes/codes pass through untouched). Optional dip-litre fields
      // are coerced the same way.
      const coerced = { ...form };
      const numericFlavoured = (key) => {
        const v = coerced[key];
        if (v == null || v === '') return;
        const looksPlain = /^-?\d+(\.\d+)?$/.test(String(v).trim());
        if (looksPlain) return;
        const evald = evalFormula(v);
        if (evald != null) coerced[key] = String(evald);
      };
      for (const f of fieldConfigs) numericFlavoured(f.key);
      for (const k of [
        'dip_ulp_litres', 'dip_diesel_litres', 'dip_premium_litres',
        'delivery_ulp_litres', 'delivery_diesel_litres', 'delivery_premium_litres',
      ]) numericFlavoured(k);

      // Pack the custom-dip inputs (form keys "custom_dip__<key>__level"
      // and "...__delivery") into the structured custom_dip_values shape
      // the backend expects: { [key]: { level, delivery } }. Empty entries
      // (level blank + delivery 0) are dropped server-side too.
      const customDipValues = {};
      for (const f of dipFieldConfigs) {
        const lvl = coerced[`custom_dip__${f.key}__level`];
        const del = coerced[`custom_dip__${f.key}__delivery`];
        const cleanLvl = lvl == null || lvl === '' ? null : Number(lvl);
        const cleanDel = del == null || del === '' ? 0 : Number(del);
        if (cleanLvl == null && cleanDel === 0) continue;
        customDipValues[f.key] = { level: cleanLvl, delivery: cleanDel };
      }
      coerced.custom_dip_values = customDipValues;

      // authedFetch injects Authorization: Bearer <jwt>. The backend pulls
      // submitter id from the JWT — do NOT send submitted_by_user_id in body.
      const res = await authedFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify(coerced),
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
        // Don't hard-redirect — authedFetch already retried with a fresh
        // token. If we're still 401 it's a real expiry, but kicking the
        // user out unprompted is jarring. Show a clear message instead.
        toast.error('Your session has expired. Please refresh the page and log in again.');
      } else if (res.status === 409 || data.code === 'duplicate_report') {
        toast.info(`A ${form.shift_type} report for this site on ${form.date} has already been submitted.\n\n` +
          `Tip: try a different shift type or date, or ask your operator to delete the existing one.`);
      } else {
        alert(
          (data.error || 'Failed to submit report') +
          (data.detail && !String(data.error || '').includes(data.detail) ? `\n\nDetail: ${data.detail}` : '')
        );
      }
    } catch (err) {
      toast.error('Failed to submit report: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-border/50 shadow-sm">
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
            <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
              <Calculator className="h-3 w-3" />
              Tip: you can type Excel-style formulas e.g.{' '}
              <code className="px-1 py-0.5 rounded bg-slate-100 font-mono text-xs">+2450+1360</code>{' '}
              and the field will calculate the total when you tab out.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {fieldConfigs.map((field) => {
                const isNumber = field.field_type === 'number';
                const raw = form[field.key] || '';
                // Show the live "= 3810" preview whenever the raw input looks
                // like an arithmetic expression — works for fields configured
                // as either `number` or `text`. evalFormula is whitelist-safe
                // and returns null for plain text or letters.
                const preview = looksLikeFormula(raw) ? evalFormula(raw) : null;
                return (
                  <div key={field.id} className="space-y-1">
                    <Label className="text-sm">{field.label} {field.is_core && '*'}</Label>
                    <Input
                      // Always render as text so spreadsheet formulas like
                      // "+2450+1360" survive into onChange. inputMode=decimal
                      // gives mobile users a numeric keypad when the field
                      // type is meant to be numeric.
                      type="text"
                      inputMode={isNumber ? 'decimal' : undefined}
                      placeholder={isNumber ? '0.00 or +1+2' : ''}
                      value={raw}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      onBlur={() => handleNumericBlur(field.key)}
                      className={errors[field.key] ? 'border-red-500' : ''}
                    />
                    {/* Live preview while the user is typing a formula. */}
                    {preview != null && (
                      <p className="text-xs text-blue-600 font-medium">
                        = {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    )}
                    {errors[field.key] && <p className="text-xs text-red-500">{errors[field.key]}</p>}
                  </div>
                );
              })}
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
              {[
                { key: 'dip_ulp_litres',    label: 'ULP level (L)',     placeholder: 'e.g. 18500' },
                { key: 'dip_diesel_litres', label: 'Diesel level (L)',  placeholder: 'e.g. 12300' },
                { key: 'dip_premium_litres',label: 'Premium level (L)', placeholder: '(if sold)' },
              ].map(({ key, label, placeholder }) => {
                const raw = form[key] || '';
                const preview = looksLikeFormula(raw) ? evalFormula(raw) : null;
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-sm">{label}</Label>
                    <Input
                      type="text" inputMode="decimal" placeholder={placeholder}
                      value={raw}
                      onChange={(e) => handleChange(key, e.target.value)}
                      onBlur={() => handleNumericBlur(key)}
                    />
                    {preview != null && (
                      <p className="text-xs text-blue-600 font-medium">
                        = {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <h4 className="text-sm font-medium mt-5 mb-2 flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              Deliveries received this shift (L) — leave 0 if none
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { key: 'delivery_ulp_litres',    label: 'ULP delivery' },
                { key: 'delivery_diesel_litres', label: 'Diesel delivery' },
                { key: 'delivery_premium_litres',label: 'Premium delivery' },
              ].map(({ key, label }) => {
                const raw = form[key] || '';
                const preview = looksLikeFormula(raw) ? evalFormula(raw) : null;
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-sm">{label}</Label>
                    <Input
                      type="text" inputMode="decimal" placeholder="0"
                      value={raw}
                      onChange={(e) => handleChange(key, e.target.value)}
                      onBlur={() => handleNumericBlur(key)}
                    />
                    {preview != null && (
                      <p className="text-xs text-blue-600 font-medium">
                        = {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom fuel-grade fields configured per-site by the operator
                (Form Fields → Fuel Tank Dips). Rendered below the built-in
                ULP / Diesel / Premium grades so the visual ordering is
                "core grades first, custom ones after". */}
            {dipFieldConfigs.length > 0 && (
              <>
                <h4 className="text-sm font-medium mt-6 mb-2 flex items-center gap-2 text-muted-foreground">
                  <Droplets className="h-4 w-4" />
                  Additional fuel grades — configured for this site
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dipFieldConfigs.map((f) => {
                    const levelKey = `custom_dip__${f.key}__level`;
                    const deliveryKey = `custom_dip__${f.key}__delivery`;
                    const lvlRaw = form[levelKey] || '';
                    const delRaw = form[deliveryKey] || '';
                    const lvlPreview = looksLikeFormula(lvlRaw) ? evalFormula(lvlRaw) : null;
                    const delPreview = looksLikeFormula(delRaw) ? evalFormula(delRaw) : null;
                    return (
                      <div
                        key={f.id}
                        className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2"
                      >
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-sky-600" />
                          {f.label}
                          {f.is_mandatory && <span className="text-red-500">*</span>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tank level (L)</Label>
                          <Input
                            type="text" inputMode="decimal" placeholder="e.g. 4500"
                            value={lvlRaw}
                            onChange={(e) => handleChange(levelKey, e.target.value)}
                            onBlur={() => handleNumericBlur(levelKey)}
                          />
                          {lvlPreview != null && (
                            <p className="text-xs text-blue-600 font-medium">
                              = {lvlPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Delivery (L) — leave 0 if none</Label>
                          <Input
                            type="text" inputMode="decimal" placeholder="0"
                            value={delRaw}
                            onChange={(e) => handleChange(deliveryKey, e.target.value)}
                            onBlur={() => handleNumericBlur(deliveryKey)}
                          />
                          {delPreview != null && (
                            <p className="text-xs text-blue-600 font-medium">
                              = {delPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
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
